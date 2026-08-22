/**
 * backend/src/services/riskEngine.js
 * Normalized Composite Risk Score Computation Engine & Trend Extrapolation.
 *
 * Implements blueprint §5 formula:
 *   risk_score = f(density, density_trend_slope, flow_convergence, flow_turbulence)
 *
 * Supports ENABLE_OPTICAL_FLOW env switch to fall back cleanly to Phase 3 scoring.
 */
'use strict';

const zoneHistories = new Map();
const HISTORY_WINDOW_MS = 60 * 1000;

const THRESHOLDS = {
  general: {
    green: 0.35,
    yellow: 0.60,
    orange: 0.80,
    red_density: 3.5,
  },
  corridor: {
    green: 0.25,
    yellow: 0.50,
    orange: 0.70,
    red_density: 2.0,
  },
};

function updateAndGetTrendSlope(zoneId, density, nowMs = Date.now()) {
  if (!zoneHistories.has(zoneId)) {
    zoneHistories.set(zoneId, []);
  }

  const history = zoneHistories.get(zoneId);
  history.push({ density, timestamp: nowMs });

  const cutoff = nowMs - HISTORY_WINDOW_MS;
  while (history.length > 0 && history[0].timestamp < cutoff) {
    history.shift();
  }

  if (history.length < 2) {
    return { slope: 0.0, history: [...history] };
  }

  const oldest = history[0];
  const newest = history[history.length - 1];
  const timeDeltaMin = (newest.timestamp - oldest.timestamp) / 60000;

  if (timeDeltaMin <= 0) {
    return { slope: 0.0, history: [...history] };
  }

  const slope = (newest.density - oldest.density) / timeDeltaMin;
  return {
    slope: Math.round(slope * 100) / 100,
    history: [...history],
  };
}

function computeRiskScore(
  density,
  trend_slope = 0.0,
  flow_convergence = 0.0,
  flow_turbulence = 0.0,
  zone_type = 'general',
  panic_signature = false,
  exodus_signature = false
) {
  const config = THRESHOLDS[zone_type] || THRESHOLDS.general;
  const redThreshold = config.red_density;

  const enableOpticalFlow = (process.env.ENABLE_OPTICAL_FLOW || 'true').toLowerCase() !== 'false';

  // 1. Normalized density term (0.0 to 1.0)
  const density_norm = Math.min(1.0, Math.max(0.0, density / redThreshold));

  // 2. Normalized trend slope term (0.0 to 1.0)
  const trend_norm = Math.min(1.0, Math.max(0.0, trend_slope / 2.0));

  // 3. Flow terms (0.0 to 1.0)
  const conv_norm = Math.min(1.0, Math.max(0.0, flow_convergence));
  const turb_norm = Math.min(1.0, Math.max(0.0, flow_turbulence));

  let rawScore = 0.0;
  if (enableOpticalFlow) {
    // Phase 4 Composite Formula
    rawScore =
      (density_norm * 0.50) +
      (trend_norm * 0.30) +
      (conv_norm * 0.10) +
      (turb_norm * 0.10);
  } else {
    // Phase 3 Fallback Scoring (Density + Slope only)
    rawScore = (density_norm * 0.70) + (trend_norm * 0.30);
  }

  let risk_score = Math.min(1.0, Math.max(0.0, Math.round(rawScore * 100) / 100));

  // Determine risk level purely from composite score
  // The score already incorporates density via density_norm (50% weight),
  // so density-based secondary overrides are NOT used — they caused false
  // yellows at low occupancy (e.g., 12 people in 20m² corridor = yellow).
  let risk_level = 'green';
  if (risk_score >= config.orange) {
    risk_level = 'red';
  } else if (risk_score >= config.yellow) {
    risk_level = 'orange';
  } else if (risk_score >= config.green) {
    risk_level = 'yellow';
  }

  // ── Turbulence Fast Path ──────────────────────────────────────────────────
  // Only fires on EXTREME chaotic motion (0.88+) — not normal walking.
  // Raises level by one step, never skips straight to red.
  if (turb_norm > 0.88 && risk_level === 'green') {
    risk_level = 'yellow';
  } else if (turb_norm > 0.88 && risk_level === 'yellow') {
    risk_level = 'orange';
  }

  // ── Behavioral Panic Bypass ───────────────────────────────────────────────
  // CV service confirmed a behavioral emergency pattern:
  //   panic_signature  = crowd crush / chaotic stampede
  //   exodus_signature = mass flee / fire evacuation (coherent fast motion)
  // Either bypasses the density-based scoring and immediately triggers RED.
  if (panic_signature || exodus_signature) {
    risk_score = Math.max(risk_score, 0.90);
    risk_level = 'red';
  }

  // Calculate linear extrapolation ETA to red threshold
  let eta_to_red_min = null;
  if (density >= redThreshold) {
    eta_to_red_min = 0;
  } else if (trend_slope > 0) {
    const remaining = redThreshold - density;
    const mins = remaining / trend_slope;
    eta_to_red_min = Math.max(1, Math.ceil(mins));
  }

  return {
    risk_score,
    risk_level,
    eta_to_red_min,
    red_threshold: redThreshold,
    behavioral_trigger: panic_signature ? 'panic' : exodus_signature ? 'exodus' : null,
    breakdown: {
      density_raw: density,
      density_norm: Math.round(density_norm * 100) / 100,
      density_weight: enableOpticalFlow ? 0.50 : 0.70,

      trend_slope_raw: trend_slope,
      trend_norm: Math.round(trend_norm * 100) / 100,
      trend_weight: 0.30,

      flow_convergence_raw: flow_convergence,
      flow_convergence_norm: Math.round(conv_norm * 100) / 100,
      flow_convergence_weight: enableOpticalFlow ? 0.10 : 0.00,

      flow_turbulence_raw: flow_turbulence,
      flow_turbulence_norm: Math.round(turb_norm * 100) / 100,
      flow_turbulence_weight: enableOpticalFlow ? 0.10 : 0.00,
    },
  };
}

function resetZoneHistory(zoneId) {
  if (zoneId) {
    zoneHistories.delete(zoneId);
  } else {
    zoneHistories.clear();
  }
}

module.exports = {
  updateAndGetTrendSlope,
  computeRiskScore,
  resetZoneHistory,
  THRESHOLDS,
};
