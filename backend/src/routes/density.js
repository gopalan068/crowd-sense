/**
 * backend/src/routes/density.js
 * POST /api/density — receives a density reading from the CV service,
 * computes composite risk & trend, evaluates thresholds & escalation timers,
 * logs to audit DB, and emits Backend→Frontend shape over Socket.io.
 *
 * Contract:
 *   CV → Backend: docs/api-contract.md §1
 *   Backend → Frontend: docs/api-contract.md §2
 */
'use strict';

const express = require('express');
const router = express.Router();
const { updateAndGetTrendSlope, computeRiskScore } = require('../services/riskEngine');
const { processZoneAlerts } = require('../services/escalationManager');

const REQUIRED_FIELDS = [
  'zone_id',
  'zone_type',
  'people_count',
  'area_sqm',
  'density',
  'flow_convergence',
  'flow_turbulence',
  'timestamp',
];

router.post('/density', async (req, res) => {
  const payload = req.body;

  // Contract enforcement — reject payloads missing required fields
  const missing = REQUIRED_FIELDS.filter((f) => !(f in payload));
  if (missing.length > 0) {
    console.warn('[Backend] Rejected payload — missing fields:', missing);
    return res.status(400).json({
      error: 'Payload does not match API contract (docs/api-contract.md §1)',
      missing_fields: missing,
    });
  }

  const { zone_id, zone_type, density, flow_convergence, flow_turbulence, timestamp } = payload;

  // 1. Calculate trend slope (people/m² per minute)
  const trend_slope = updateAndGetTrendSlope(zone_id, density);
  payload.trend_slope = trend_slope;

  // 2. Compute composite risk score matching Blueprint Section 5 formula signature
  const riskResult = computeRiskScore(
    density,
    trend_slope,
    flow_convergence,
    flow_turbulence,
    zone_type
  );

  // 3. Process zone alerts & escalation logic
  const io = req.app.get('io');
  await processZoneAlerts(riskResult, payload, io);

  // 4. Construct exact Backend → Frontend Socket.io payload (docs/api-contract.md §2)
  const socketPayload = {
    zone_id,
    risk_level: riskResult.risk_level,
    risk_score: riskResult.risk_score,
    density,
    trend_slope,
    eta_to_red_min: riskResult.eta_to_red_min,
    timestamp,
    // Include extra metrics for rich dashboard readouts
    people_count: payload.people_count,
    area_sqm: payload.area_sqm,
    zone_type: payload.zone_type,
  };

  console.log(
    `[Backend] density_update zone=${zone_id} ` +
    `density=${density} risk=${riskResult.risk_level} (${riskResult.risk_score}) ` +
    `slope=${trend_slope} eta=${riskResult.eta_to_red_min}m`
  );

  // Emit Backend → Frontend shape to all connected frontend clients
  if (io) {
    io.emit('density_update', socketPayload);
  }

  return res.status(200).json({ received: true, processed: socketPayload });
});

module.exports = router;
