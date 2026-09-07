/**
 * backend/src/services/pipelineService.js
 * In-memory pipeline execution state controller.
 * Allows toggling the continuous CV data & streaming pipeline on/off.
 */
'use strict';

const initialActive = process.env.PIPELINE_ACTIVE !== undefined
  ? process.env.PIPELINE_ACTIVE.toLowerCase() === 'true'
  : process.env.START_PIPELINE_PAUSED !== undefined
  ? process.env.START_PIPELINE_PAUSED.toLowerCase() !== 'true'
  : true;

let pipelineState = {
  active: initialActive,
  paused_at: initialActive ? null : new Date().toISOString(),
  last_updated: new Date().toISOString(),
};

function getPipelineState() {
  return { ...pipelineState };
}

function setPipelineState(active) {
  const isNowActive = Boolean(active);
  pipelineState = {
    active: isNowActive,
    paused_at: isNowActive ? null : new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };
  return { ...pipelineState };
}

function togglePipelineState() {
  return setPipelineState(!pipelineState.active);
}

module.exports = {
  getPipelineState,
  setPipelineState,
  togglePipelineState,
};
