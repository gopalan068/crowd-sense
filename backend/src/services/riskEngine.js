/**
 * backend/src/services/riskEngine.js
 * Composite Risk Score Computation Engine.
 *
 * Implements blueprint §5:
 *   risk_score = f(density, density_trend_slope, flow_convergence, flow_turbulence)
 *
 * Maintains a sliding window of density readings per zone to calculate
 * density_trend_slope (rate of change in people/sqm per minute).
 */
'use strict';

// Per-zone density history windows: Map<zone_id, Array<{ density: number, timestamp: number }>>
const zoneHistories = new Map();

// History window duration in milliseconds (30 seconds)
const HISTORY_WINDOW_MS = 30 * 1000;

// Default threshold configurations by zone_type
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
    red_density: 2.0, // emergency corridors have tighter thresholds
  },
};

/**
 * Record a density reading and calculate the trend slope (rate of density change per minute).
 * @param {string} zoneId
 * @param {number} density
 * @param {number} nowMs
 * @returns {number} trend_slope in people/m² per minute
 */
function updateAndGetTrendSlope(zoneId, density, nowMs = Date.now()) {
  if (!zoneHistories.has(zoneId)) {
    zoneHistories.set(zoneId, []);
  }

  const history = zoneHistories.get(zoneId);
  history.push({ density, timestamp: nowMs });

  // Trim readings older than window
  const cutoff = nowMs - HISTORY_WINDOW_MS;
  while (history.length > 0 && history[0].timestamp < cutoff) {
    history.shift();
  }

  if (history.length < 2) {
    return 0.0;
  }

  const oldest = history[0];
  const newest = history[history.length - 1];
  const timeDeltaMin = (newest.timestamp - oldest.timestamp) / 60000;

  if (timeDeltaMin <= 0) {
    return 0.0;
  }

  const densityDelta = newest.density - oldest.density;
  const slope = densityDelta / timeDeltaMin;
  return Math.round(slope * 100) / 100;
}

/**
 * Composite risk calculation matching Blueprint Section 5 full signature.
 * Flow terms are stubbed at 0.0 in Phase 2.
 *
 * @param {number} density
 * @param {number} trend_slope
 * @param {number} flow_convergence
 * @param {number} flow_turbulence
 * @param {string} zone_type
 * @returns {{ risk_score: number, risk_level: string, eta_to_red_min: number|null }}
 */
function computeRiskScore(
  density,
  trend_slope = 0.0,
  flow_convergence = 0.0,
  flow_turbulence = 0.0,
  zone_type = 'general'
) {
  const config = THRESHOLDS[zone_type] || THRESHOLDS.general;
  const maxDensity = config.red_density;

  // Base density score (0.0 to ~1.0)
  const densityScore = Math.min(1.0, density / maxDensity);

  // Trend slope component (positive slope increases risk)
  // E.g., slope of +1.0 person/m²/min adds 0.15 to risk score
  const trendScore = Math.max(0, trend_slope) * 0.15;

  // Flow components (stubbed at 0.0 for Phase 2; will add to score in Tier 2)
  const flowScore = (flow_convergence * 0.2) + (flow_turbulence * 0.2);

  // Raw composite score
  const rawScore = (densityScore * 0.7) + trendScore + flowScore;
  const risk_score = Math.min(1.0, Math.max(0.0, Math.round(rawScore * 100) / 100));

  // Determine risk level
  let risk_level = 'green';
  if (risk_score >= config.orange || density >= config.red_density) {
    risk_level = 'red';
  } else if (risk_score >= config.yellow || density >= config.red_density * 0.6) {
    risk_level = 'orange';
  } else if (risk_score >= config.green || density >= config.red_density * 0.3) {
    risk_level = 'yellow';
  }

  // Calculate ETA to red threshold (minutes)
  let eta_to_red_min = null;
  if (density >= config.red_density) {
    eta_to_red_min = 0;
  } else if (trend_slope > 0) {
    const remainingDensity = config.red_density - density;
    const minutes = remainingDensity / trend_slope;
    eta_to_red_min = Math.max(1, Math.ceil(minutes));
  }

  return {
    risk_score,
    risk_level,
    eta_to_red_min,
  };
}

/**
 * Reset history for tests or zone resets.
 * @param {string} zoneId
 */
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
};
