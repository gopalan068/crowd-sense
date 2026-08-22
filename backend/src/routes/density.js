/**
 * backend/src/routes/density.js
 * POST /api/density — receives density readings from CV service,
 * computes composite risk & trend, evaluates thresholds & escalation timers,
 * logs to audit DB, and emits Backend→Frontend shape over Socket.io.
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

  const { zone_id, zone_type, density, flow_convergence, flow_turbulence, panic_signature, timestamp, feed_source, camera_type } = payload;

  // 1. Calculate trend slope (people/m² per minute) and fetch rolling history
  const { slope: trend_slope, history: historyArray } = updateAndGetTrendSlope(zone_id, density);
  payload.trend_slope = trend_slope;

  // 2. Compute composite risk score matching Blueprint Section 5 formula
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

  // 4. Construct Backend → Frontend Socket.io payload (docs/api-contract.md §2)
  const socketPayload = {
    zone_id,
    zone_type,
    feed_source: feed_source || (zone_id === 'zone_1' ? 'live_webcam' : 'pre_recorded'),
    camera_type: camera_type || (zone_id === 'zone_1' ? 'drone' : 'cctv'),
    risk_level: riskResult.risk_level,
    risk_score: riskResult.risk_score,
    density,
    density_norm: riskResult.breakdown.density_norm,
    trend_slope,
    trend_norm: riskResult.breakdown.trend_norm,
    flow_convergence: Number(flow_convergence) || 0.0,
    flow_turbulence: Number(flow_turbulence) || 0.0,
    panic_signature: Boolean(panic_signature),
    eta_to_red_min: riskResult.eta_to_red_min,
    red_threshold: riskResult.red_threshold,
    timestamp,
    people_count: payload.people_count,
    area_sqm: payload.area_sqm,
    breakdown: riskResult.breakdown,
    history: historyArray,
  };

  console.log(
    `[Backend] density_update zone=${zone_id} (${zone_type}) ` +
    `density=${density} risk=${riskResult.risk_level} (${riskResult.risk_score}) ` +
    `conv=${socketPayload.flow_convergence} turb=${socketPayload.flow_turbulence}`
  );

  if (io) {
    io.emit('density_update', socketPayload);
  }

  return res.status(200).json({ received: true, processed: socketPayload });
});

module.exports = router;
