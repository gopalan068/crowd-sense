/**
 * backend/src/services/pipelineService.js
 * In-memory pipeline execution state controller.
 * Allows toggling the continuous CV data & streaming pipeline on/off.
 */
'use strict';

let pipelineState = {
  active: true,
  paused_at: null,
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
