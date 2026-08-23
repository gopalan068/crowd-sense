/**
 * backend/src/services/densityHistoryService.js
 * Session Density Recording & Aggregation Service.
 *
 * Persists periodic density snapshots to SQLite density_history table,
 * maintains session peak and rolling metrics, and ensures bounded table size
 * through automatic rotation.
 */
'use strict';

const {
  insertDensitySnapshot,
  getAggregatedDensityStats,
  getPeakDensityTimestamp,
  rotateDensityHistory,
} = require('../db/database');

const MAX_ROWS_PER_ZONE = 5000;
let insertCounter = 0;

// In-memory zone cache for immediate aggregation
const sessionZoneCache = new Map();

/**
 * Record a density reading received from CV service.
 * @param {Object} payload
 * @returns {Promise<void>}
 */
async function recordDensitySnapshot(payload) {
  const {
    zone_id,
    density,
    people_count,
    area_sqm,
    flow_convergence,
    flow_turbulence,
    trend_slope,
    timestamp,
  } = payload;

  const readingTs = timestamp || new Date().toISOString();

  // 1. Update in-memory session zone cache
  if (!sessionZoneCache.has(zone_id)) {
    sessionZoneCache.set(zone_id, {
      zone_id,
      area_sqm: area_sqm || 20.0,
      readings: [],
      peak_density: density,
      peak_timestamp: readingTs,
      max_people_count: people_count || 0,
      start_time: readingTs,
      latest_timestamp: readingTs,
    });
  }

  const cache = sessionZoneCache.get(zone_id);
  cache.latest_timestamp = readingTs;
  cache.area_sqm = area_sqm || cache.area_sqm;

  if (density > cache.peak_density) {
    cache.peak_density = density;
    cache.peak_timestamp = readingTs;
  }
  if ((people_count || 0) > cache.max_people_count) {
    cache.max_people_count = people_count;
  }

  // 2. Persist to SQLite
  try {
    await insertDensitySnapshot({
      zone_id,
      density: Number(density) || 0,
      people_count: Number(people_count) || 0,
      area_sqm: Number(area_sqm) || 20.0,
      flow_convergence: Number(flow_convergence) || 0.0,
      flow_turbulence: Number(flow_turbulence) || 0.0,
      trend_slope: Number(trend_slope) || 0.0,
      timestamp: readingTs,
    });

    insertCounter++;
    if (insertCounter % 500 === 0) {
      await rotateDensityHistory(MAX_ROWS_PER_ZONE);
    }
  } catch (err) {
    console.error('[DensityHistory] Error persisting snapshot:', err);
  }
}

/**
 * Get aggregated summary statistics per zone across the entire session history.
 * @param {string} [scopeZoneId]
 * @returns {Promise<Array<Object>>}
 */
async function getSessionDensitySummaries(scopeZoneId = 'all') {
  try {
    const dbStats = await getAggregatedDensityStats(scopeZoneId);

    const results = [];
    for (const stat of dbStats) {
      const peakTs = await getPeakDensityTimestamp(stat.zone_id);
      const area = stat.area_sqm || 20.0;
      const peakDensity = stat.peak_density || 0.0;

      // Estimated peak concurrent occupancy = peak_density * area
      const estPeakConcurrentOccupancy = Math.round(peakDensity * area);

      results.push({
        zone_id: stat.zone_id,
        total_readings: stat.total_readings,
        min_density: Math.round((stat.min_density || 0) * 100) / 100,
        avg_density: Math.round((stat.avg_density || 0) * 100) / 100,
        peak_density: Math.round(peakDensity * 100) / 100,
        time_of_peak: peakTs || stat.start_time,
        area_sqm: area,
        max_detected_persons: stat.max_people_count,
        estimated_peak_concurrent_occupancy: estPeakConcurrentOccupancy,
        occupancy_metric_caveat: 'Peak concurrent occupancy only; not deduplicated unique footfall.',
        peak_convergence: Math.round((stat.peak_convergence || 0) * 100) / 100,
        peak_turbulence: Math.round((stat.peak_turbulence || 0) * 100) / 100,
        session_start: stat.start_time,
        session_end: stat.end_time,
      });
    }

    // If database had 0 records (e.g. before first CV push), fallback to memory cache if any
    if (results.length === 0 && sessionZoneCache.size > 0) {
      for (const [zId, cache] of sessionZoneCache.entries()) {
        if (scopeZoneId !== 'all' && scopeZoneId !== zId) continue;
        results.push({
          zone_id: zId,
          total_readings: 1,
          min_density: cache.peak_density,
          avg_density: cache.peak_density,
          peak_density: cache.peak_density,
          time_of_peak: cache.peak_timestamp,
          area_sqm: cache.area_sqm,
          max_detected_persons: cache.max_people_count,
          estimated_peak_concurrent_occupancy: Math.round(cache.peak_density * cache.area_sqm),
          occupancy_metric_caveat: 'Peak concurrent occupancy only; not deduplicated unique footfall.',
          peak_convergence: 0,
          peak_turbulence: 0,
          session_start: cache.start_time,
          session_end: cache.latest_timestamp,
        });
      }
    }

    return results;
  } catch (err) {
    console.error('[DensityHistory] Error fetching session density summaries:', err);
    return [];
  }
}

module.exports = {
  recordDensitySnapshot,
  getSessionDensitySummaries,
};
