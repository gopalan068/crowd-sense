/**
 * backend/src/routes/alerts.js
 * Express routes for alert acknowledgment and audit log retrieval.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getAuditLogs, getAlertById, getAllPlaybookStepLogsInDb } = require('../db/database');
const { acknowledgeAlert, updateAlertStatus, getActiveAlerts } = require('../services/escalationManager');
const {
  getPlaybookForAlert,
  evaluateResourceShortfall,
  recordPlaybookStep,
  getCompletedSteps,
} = require('../services/playbookService');
const { generateContextualNarrative } = require('../services/geminiPlaybookService');
const { getWeatherState } = require('../services/weatherService');

/**
 * GET /api/audit-log
 * Returns timestamped audit log records and completed playbook steps.
 */
router.get('/audit-log', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const logs = await getAuditLogs(limit);
    const playbookSteps = await getAllPlaybookStepLogsInDb(limit);
    return res.status(200).json({ logs, playbook_steps: playbookSteps });
  } catch (err) {
    console.error('[Route] GET /api/audit-log error:', err);
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * GET /api/alerts/active
 * Returns currently active alerts.
 */
router.get('/alerts/active', (_req, res) => {
  const active = getActiveAlerts();
  return res.status(200).json({ alerts: active });
});

/**
 * GET /api/alerts/:id/playbook
 * Returns the static protocol, live resource shortfall calculation,
 * checklist completion state, and Groq contextual narrative note for an alert.
 */
router.get('/alerts/:id/playbook', async (req, res) => {
  const alertId = req.params.id;
  try {
    // 1. Find alert from in-memory active alerts or SQLite DB
    const activeList = getActiveAlerts();
    let alert = activeList.find((a) => a.alert_id === alertId);
    if (!alert) {
      alert = await getAlertById(alertId);
    }

    if (!alert) {
      // Create fallback alert envelope for testing/mock purposes if needed
      alert = {
        alert_id: alertId,
        zone_id: 'zone_1',
        severity: 'yellow',
        alert_type: 'graduated_escalation',
      };
    }

    // 2. Deterministically match static playbook
    const playbook = getPlaybookForAlert(alert);

    // 3. Compute live resource shortfall against checked-in responders
    const shortfall = evaluateResourceShortfall(playbook, alert.zone_id);

    // 4. Fetch already-completed checklist steps
    const completedSteps = await getCompletedSteps(alertId);

    // 5. Get current weather context
    const weatherState = getWeatherState();

    // 6. Generate contextual narrative wrapper (Groq LLM or deterministic fallback)
    const narrativeResult = await generateContextualNarrative({
      playbook,
      shortfall,
      weatherState,
      alert,
    });

    return res.status(200).json({
      success: true,
      alert_id: alertId,
      zone_id: alert.zone_id,
      playbook,
      shortfall,
      completed_steps: completedSteps,
      narrative_wrapper: {
        text: narrativeResult.narrative,
        source: narrativeResult.source,
        model: narrativeResult.model,
      },
    });
  } catch (err) {
    console.error(`[Route] GET /api/alerts/${alertId}/playbook error:`, err);
    return res.status(500).json({ error: 'Failed to retrieve playbook for alert' });
  }
});

/**
 * POST /api/alerts/:id/playbook-step
 * Records a checked action step in SQLite audit log and emits live socket update.
 * Body: { step_index: number, step_text: string, completed_by?: string }
 */
router.post('/alerts/:id/playbook-step', async (req, res) => {
  const alertId = req.params.id;
  const { step_index, step_text, completed_by } = req.body || {};
  const io = req.app.get('io');

  if (step_index === undefined || !step_text) {
    return res.status(400).json({ error: 'step_index and step_text are required' });
  }

  try {
    const record = await recordPlaybookStep(
      alertId,
      Number(step_index),
      String(step_text),
      completed_by || 'official_1',
      io
    );
    return res.status(200).json({ success: true, step: record });
  } catch (err) {
    console.error(`[Route] POST /api/alerts/${alertId}/playbook-step error:`, err);
    return res.status(500).json({ error: 'Failed to record playbook step' });
  }
});

/**
 * POST /api/alerts/:id/acknowledge
 * Body: { acknowledged_by?: string }
 */
router.post('/alerts/:id/acknowledge', async (req, res) => {
  const alertId = req.params.id;
  const acknowledgedBy = req.body.acknowledged_by || 'official_1';
  const io = req.app.get('io');

  try {
    const updated = await acknowledgeAlert(alertId, acknowledgedBy, io);
    if (!updated) {
      return res.status(404).json({ error: 'Alert not found or already acknowledged' });
    }
    return res.status(200).json({ success: true, alert: updated });
  } catch (err) {
    console.error(`[Route] POST /api/alerts/${alertId}/acknowledge error:`, err);
    return res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

/**
 * POST /api/alerts/:id/status
 * Responder operational status update.
 * Body: { status: 'en_route'|'on_scene'|'resolved'|'need_backup', responder_id?: string }
 *
 * Writes to the SAME audit log used by the main dashboard (responder_status column).
 * Emits alert_status_updated over the existing Socket.io connection.
 */
const VALID_RESPONDER_STATUSES = ['en_route', 'on_scene', 'resolved', 'need_backup'];

router.post('/alerts/:id/status', async (req, res) => {
  const alertId = req.params.id;
  const { status, responder_id } = req.body || {};
  const io = req.app.get('io');

  if (!status || !VALID_RESPONDER_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid or missing status. Must be one of: ${VALID_RESPONDER_STATUSES.join(', ')}`,
    });
  }

  try {
    const updated = await updateAlertStatus(alertId, status, responder_id || 'unknown_responder', io);
    if (!updated) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    return res.status(200).json({ success: true, alert: updated });
  } catch (err) {
    console.error(`[Route] POST /api/alerts/${alertId}/status error:`, err);
    return res.status(500).json({ error: 'Failed to update responder status' });
  }
});

module.exports = router;
