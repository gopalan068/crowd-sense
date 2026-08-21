/**
 * backend/src/routes/postEvent.js
 * Express route for Post-Event Timeline Analysis.
 *
 * Implements Section 4 Feature 11:
 *   Returns historical density readings + alert milestones for post-event review.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../db/database');

/**
 * GET /api/post-event-timeline
 * Query params: zone_id (default 'zone_1' or 'all')
 */
router.get('/post-event-timeline', async (req, res) => {
  try {
    const zone_id = req.query.zone_id || 'zone_1';
    const auditLogs = await getAuditLogs(100);

    // Filter audit logs for the zone if specified
    const zoneAlerts = auditLogs.filter(
      (log) => zone_id === 'all' || log.zone_id === zone_id
    );

    return res.status(200).json({
      zone_id,
      generated_at: new Date().toISOString(),
      alerts: zoneAlerts,
      summary: {
        total_alerts: zoneAlerts.length,
        panic_alerts: zoneAlerts.filter((a) => a.alert_type === 'immediate_panic_alert').length,
        escalated_alerts: zoneAlerts.filter((a) => Boolean(a.escalated_at)).length,
        acknowledged_alerts: zoneAlerts.filter((a) => Boolean(a.acknowledged_at)).length,
      },
    });
  } catch (err) {
    console.error('[Route] GET /api/post-event-timeline error:', err);
    return res.status(500).json({ error: 'Failed to generate post-event timeline' });
  }
});

module.exports = router;
