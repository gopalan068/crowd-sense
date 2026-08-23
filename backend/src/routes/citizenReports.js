/**
 * backend/src/routes/citizenReports.js
 * Citizen Emergency Reporting REST API route.
 *
 * Receives citizen SOS / report submissions from the crowd reporting UI.
 * Feeds directly into the SAME alert pipeline:
 *  - Inserts alert record into audit_log SQLite DB with alert_type: 'citizen_report'
 *  - Broadcasts 'alert_triggered' to main Command Dashboard and Field Responders
 *  - Emits 'mock_dispatch_toast' for dispatch simulation
 */
'use strict';

const express = require('express');
const router = express.Router();
const { registerCustomAlert } = require('../services/escalationManager');

const VALID_CATEGORIES = [
  'MEDICAL_ASSISTANCE',
  'SUSPICIOUS_ACTIVITY',
  'REPORT_THEFT',
  'BLOCKED_EXITS',
  'STAMPEDE_RISK',
  'MEDICAL_EMERGENCY',
  'BLOCKED_EXIT',
  'GENERAL_PANIC',
];

/**
 * POST /api/citizen-reports
 * Body: { category: string, zone_id: string, description?: string, reporter_name?: string }
 */
router.post('/citizen-reports', async (req, res) => {
  const { category, zone_id, description, reporter_name } = req.body || {};

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({
      error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
    });
  }

  const validZone = (zone_id === 'zone_2') ? 'zone_2' : 'zone_1';
  const alertId = `alt_cit_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const timestamp = new Date().toISOString();

  const isPanicCategory = category === 'STAMPEDE_RISK' || category === 'GENERAL_PANIC';

  const alertEntry = {
    alert_id: alertId,
    zone_id: validZone,
    severity: isPanicCategory ? 'red' : 'orange',
    alert_type: 'citizen_report',
    triggered_at: timestamp,
    assigned_to: 'all_officials',
    acknowledged_at: null,
    acknowledged_by: null,
    escalated_at: null,
    escalated_to: null,
    category,
    description: description || `Citizen Emergency Report (${category.replace('_', ' ')})`,
    reporter_name: reporter_name || 'Anonymous Citizen',
  };

  const io = req.app.get('io');

  try {
    await registerCustomAlert(alertEntry, io);

    if (io) {
      io.emit('mock_dispatch_toast', {
        zone_id: validZone,
        title: `CITIZEN REPORT: ${category.replace('_', ' ')}`,
        message: `Emergency reported by ${alertEntry.reporter_name} in ${validZone}. Field teams notified.`,
        timestamp,
        is_simulation: true,
      });
    }

    console.warn(
      `📱 [CITIZEN REPORT] New report from ${alertEntry.reporter_name} in ${validZone}: ${category}`
    );

    return res.status(200).json({ success: true, alert: alertEntry });
  } catch (err) {
    console.error('[Route] POST /api/citizen-reports error:', err);
    return res.status(500).json({ error: 'Failed to process citizen emergency report' });
  }
});

module.exports = router;
