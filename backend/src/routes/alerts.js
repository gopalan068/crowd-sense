/**
 * backend/src/routes/alerts.js
 * Express routes for alert acknowledgment and audit log retrieval.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../db/database');
const { acknowledgeAlert, getActiveAlerts } = require('../services/escalationManager');

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

module.exports = router;
