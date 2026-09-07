/**
 * backend/src/routes/pipeline.js
 * REST endpoints to view and toggle the CV Data Pipeline execution.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getPipelineState, setPipelineState, togglePipelineState } = require('../services/pipelineService');

/**
 * GET /api/pipeline/status
 * Returns current execution state: { active: boolean, paused_at: string | null }
 */
router.get('/pipeline/status', (_req, res) => {
  return res.status(200).json(getPipelineState());
});

/**
 * POST /api/pipeline/toggle
 * Toggles active state between ON and OFF, emits 'pipeline_status_updated' over Socket.io.
 */
router.post('/pipeline/toggle', (req, res) => {
  const updatedState = togglePipelineState();
  const io = req.app.get('io');
  if (io) {
    io.emit('pipeline_status_updated', updatedState);
  }
  console.log(`[Pipeline] CV Pipeline toggled -> ${updatedState.active ? 'LIVE / ACTIVE' : 'PAUSED / STATIC'}`);
  return res.status(200).json(updatedState);
});

/**
 * POST /api/pipeline/set
 * Sets active state explicitly { active: boolean }.
 */
router.post('/pipeline/set', (req, res) => {
  const { active } = req.body || {};
  const updatedState = setPipelineState(active !== undefined ? active : true);
  const io = req.app.get('io');
  if (io) {
    io.emit('pipeline_status_updated', updatedState);
  }
  console.log(`[Pipeline] CV Pipeline set -> ${updatedState.active ? 'LIVE / ACTIVE' : 'PAUSED / STATIC'}`);
  return res.status(200).json(updatedState);
});

module.exports = router;
