/**
 * backend/src/routes/conditions.js
 * REST endpoints for managing simulated weather and environmental conditions.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getWeatherState, setWeatherState, PRESETS } = require('../services/weatherService');

/**
 * GET /api/conditions/current
 * Returns current weather state.
 */
router.get('/conditions/current', (_req, res) => {
  return res.status(200).json(getWeatherState());
});

/**
 * POST /api/conditions/set
 * Body: { condition: 'clear' | 'extreme_heat' | 'heavy_rain' | 'hot_and_rainy', temperature_c?: number, precipitation_mm?: number }
 * Updates state and emits 'conditions_updated' over Socket.io.
 */
router.post('/conditions/set', (req, res) => {
  const { condition, temperature_c, precipitation_mm } = req.body || {};

  if (!condition || !PRESETS[condition]) {
    return res.status(400).json({
      error: `Invalid condition preset '${condition}'. Valid presets: ${Object.keys(PRESETS).join(', ')}`,
    });
  }

  const newState = setWeatherState(condition, { temperature_c, precipitation_mm });

  const io = req.app.get('io');
  if (io) {
    io.emit('conditions_updated', newState);
  }

  console.log(`[Conditions] Weather updated -> ${newState.condition} (${newState.label})`);

  return res.status(200).json({
    success: true,
    state: newState,
  });
});

module.exports = router;
