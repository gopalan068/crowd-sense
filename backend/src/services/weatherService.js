/**
 * backend/src/services/weatherService.js
 * In-memory weather and environmental condition state service.
 * Supports simulated presenter control presets for demo execution
 * and maintains a timestamped history of environmental changes for post-event analysis.
 */
'use strict';

const PRESETS = {
  clear: {
    condition: 'clear',
    label: 'Clear / Baseline',
    temperature_c: 28,
    precipitation_mm: 0,
    heat_index_c: 28,
    density_factor: 1.0,      // Normal thresholds
    flow_factor: 1.0,         // Normal sensitivity
    cv_confidence: 96,        // High visual clarity
  },
  extreme_heat: {
    condition: 'extreme_heat',
    label: 'Extreme Heat',
    temperature_c: 42,
    precipitation_mm: 0,
    heat_index_c: 46,
    density_factor: 0.75,     // Tightens red density threshold by 25%
    flow_factor: 1.0,         // Normal sensitivity
    cv_confidence: 94,
  },
  heavy_rain: {
    condition: 'heavy_rain',
    label: 'Heavy Rain',
    temperature_c: 24,
    precipitation_mm: 35,
    heat_index_c: 24,
    density_factor: 1.0,      // Normal density threshold
    flow_factor: 1.5,         // 1.5x scaling on convergence & turbulence sensitivity
    cv_confidence: 74,        // Camera vision degradation (lens water, motion blur)
  },
  hot_and_rainy: {
    condition: 'hot_and_rainy',
    label: 'Extreme Heat + Heavy Rain',
    temperature_c: 38,
    precipitation_mm: 25,
    heat_index_c: 45,
    density_factor: 0.75,     // Tightens density threshold by 25%
    flow_factor: 1.5,         // 1.5x scaling on flow sensitivity
    cv_confidence: 71,        // High heat humidity + camera rain blur
  },
};

const initialTimestamp = new Date().toISOString();

let currentState = {
  ...PRESETS.clear,
  is_simulated: true,
  updated_at: initialTimestamp,
};

const weatherHistory = [
  {
    ...currentState,
    transition_type: 'initial_state',
    timestamp: initialTimestamp,
  },
];

/**
 * Get current weather state object
 */
function getWeatherState() {
  return { ...currentState };
}

/**
 * Set weather condition preset
 * @param {string} condition Preset key: 'clear' | 'extreme_heat' | 'heavy_rain' | 'hot_and_rainy'
 * @param {Object} [customParams] Optional numeric overrides (temperature_c, precipitation_mm)
 */
function setWeatherState(condition, customParams = {}) {
  const preset = PRESETS[condition] || PRESETS.clear;
  const timestamp = new Date().toISOString();

  currentState = {
    ...preset,
    temperature_c: customParams.temperature_c ?? preset.temperature_c,
    precipitation_mm: customParams.precipitation_mm ?? preset.precipitation_mm,
    is_simulated: true,
    updated_at: timestamp,
  };

  weatherHistory.push({
    ...currentState,
    transition_type: 'condition_shift',
    timestamp,
  });

  return getWeatherState();
}

/**
 * Get full history of weather state transitions during the session
 * @returns {Array<Object>}
 */
function getWeatherHistory() {
  return [...weatherHistory];
}

module.exports = {
  PRESETS,
  getWeatherState,
  setWeatherState,
  getWeatherHistory,
};
