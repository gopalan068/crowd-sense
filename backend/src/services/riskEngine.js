/**
 * backend/src/services/riskEngine.js
 * Normalized Composite Risk Score Computation Engine & Trend Extrapolation.
 *
 * Implements blueprint §5 formula:
 *   risk_score = f(density, density_trend_slope, flow_convergence, flow_turbulence)
 *
 * Normalization Scale:
 *   1. density_norm = min(1.0, density / red_density)  [Weight: 0.50]
 *   2. trend_norm   = min(1.0, max(0.0, trend_slope / 2.0))  [Weight: 0.30]
 *   3. flow_convergence = float 0.0-1.0  [Weight: 0.10]
 *   4. flow_turbulence  = float 0.0-1.0  [Weight: 0.10]
 */
'use strict';

// Per-zone rolling history windows (60 seconds)
const zoneHistories = new Map();
const HISTORY_WINDOW_MS = 60 * 1000;

// Per-zone threshold definitions
const THRESHOLDS = {
  general: {
    green: 0.35,
    yellow: 0.60,
    orange: 0.80,
    red_density: 3.5, // people / m²
  },
  corridor: {
    green: 0.25,
    yellow: 0.50,
    orange: 0.70,
    red_density: 2.0, // emergency corridor egress path threshold
  },
};

/**
 * Record a density reading and return stored history + trend slope.
 * @param {string} zoneId
 * @param {number} density
 * @param {number} nowMs
 * @returns {{ slope: number, history: Array<{ density: number, timestamp: number }> }}
 */
function updateAndGetTrendSlope(zoneId, density, nowMs = Date.now()) {
  if (!zoneHistories.has(zoneId)) {
    zoneHistories.set(zoneId, []);
  }

  const history = zoneHistories.get(zoneId);
  history.push({ density, timestamp: nowMs });

  // Trim readings older than 60s
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

/**
 * Normalized composite risk calculation (Blueprint Section 5).
 *
 * @param {number} density
 * @param {number} trend_slope
 * @param {number} flow_convergence
 * @param {number} flow_turbulence
 * @param {string} zone_type
 * @returns {Object}
 */
function computeRiskScore(
  density,
  trend_slope = 0.0,
  flow_convergence = 0.0,
  flow_turbulence = 0.0,
  zone_type = 'general'
) {
  const config = THRESHOLDS[zone_type] || THRESHOLDS.general;
  const redThreshold = config.red_density;

  // 1. Normalized density term (0.0 to 1.0)
  const density_norm = Math.min(1.0, Math.max(0.0, density / redThreshold));

  // 2. Normalized trend slope term (0.0 to 1.0, where 2.0 p/m²/min is max expected slope)
  const trend_norm = Math.min(1.0, Math.max(0.0, trend_slope / 2.0));

  // 3. Flow terms (already 0.0 to 1.0, stubs emit 0.0)
  const conv_norm = Math.min(1.0, Math.max(0.0, flow_convergence));
  const turb_norm = Math.min(1.0, Math.max(0.0, flow_turbulence));

  // 4. Weighted composite formula
  const rawScore =
    (density_norm * 0.50) +
    (trend_norm * 0.30) +
    (conv_norm * 0.10) +
    (turb_norm * 0.10);

  const risk_score = Math.min(1.0, Math.max(0.0, Math.round(rawScore * 100) / 100));

  // Determine risk level based on score & density
  let risk_level = 'green';
  if (risk_score >= config.orange || density >= redThreshold) {
    risk_level = 'red';
  } else if (risk_score >= config.yellow || density >= redThreshold * 0.6) {
    risk_level = 'orange';
  } else if (risk_score >= config.green || density >= redThreshold * 0.3) {
    risk_level = 'yellow';
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
    breakdown: {
      density_raw: density,
      density_norm: Math.round(density_norm * 100) / 100,
      density_weight: 0.50,

      trend_slope_raw: trend_slope,
      trend_norm: Math.round(trend_norm * 100) / 100,
      trend_weight: 0.30,

      flow_convergence_raw: flow_convergence,
      flow_convergence_norm: Math.round(conv_norm * 100) / 100,
      flow_convergence_weight: 0.10,

      flow_turbulence_raw: flow_turbulence,
      flow_turbulence_norm: Math.round(turb_norm * 100) / 100,
      flow_turbulence_weight: 0.10,
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
