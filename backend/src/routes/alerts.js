/**
 * backend/src/routes/alerts.js
 * Express routes for alert acknowledgment and audit log retrieval.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../db/database');
const { acknowledgeAlert, updateAlertStatus, getActiveAlerts } = require('../services/escalationManager');


/**
 * GET /api/audit-log
 * Returns timestamped audit log records in docs/api-contract.md §3 shape.
 */
router.get('/audit-log', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const logs = await getAuditLogs(limit);
    return res.status(200).json({ logs });
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
