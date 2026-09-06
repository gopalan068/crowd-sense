/**
 * frontend/src/lib/simulationLogger.js
 *
 * Optional simulation data logger for the CrowdSense Planner.
 * Records snapshots of simulation state at a fixed simulated-time interval,
 * without affecting real-time rendering or the SFM physics step.
 *
 * Usage:
 *   const logger = createLogger()
 *   logger.start(0.5)                 // record every 0.5 simulated seconds
 *   // inside your sim tick:
 *   logger.maybeRecord(simTimeSec, agents, layout, grid, pxPerMeter)
 *   const timeSeries = logger.stop()  // returns snapshot[]
 *
 * Each snapshot:
 *   {
 *     t:              number,         // simulated seconds at snapshot
 *     densityGrid:    Float32Array,   // density[row*cols+col] in people/m²
 *     gateStates:     {[gateId]: boolean},  // true = open
 *     agentCount:     number,
 *     maxDensityCell: { cellIdx: number, value: number }
 *   }
 *
 * The densityGrid uses the SAME grid structure as densityGrid.js.
 * No second grid representation is created.
 */

import { buildGrid, computeDensity, getMaxDensity } from './densityGrid.js'

/**
 * Create an independent logger instance.
 * Each headless scenario run and each real-time session should create its own.
 */
export function createLogger() {
  let _active      = false
  let _intervalSec = 0.5
  let _lastRecordT = -Infinity
  let _snapshots   = []

  /**
   * Begin recording snapshots at the given simulated-time interval.
   * @param {number} [intervalSec=0.5] — record every N simulated seconds
   */
  function start(intervalSec = 0.5) {
    _active      = true
    _intervalSec = intervalSec
    _lastRecordT = -Infinity
    _snapshots   = []
  }

  /**
   * Call once per simulation step. Only records if the interval has elapsed.
   *
   * @param {number}       t          — current simulated time in seconds
   * @param {Array}        agents     — current agent array (pos, reachedExit, …)
   * @param {object}       layout     — venue layout (openings array for gate states)
   * @param {number}       canvasW    — canvas width in pixels (for grid construction)
   * @param {number}       canvasH    — canvas height in pixels
   * @param {number}       pxPerMeter — scale factor
   */
  function maybeRecord(t, agents, layout, canvasW, canvasH, pxPerMeter) {
    if (!_active) return
    if (t - _lastRecordT < _intervalSec) return
    _lastRecordT = t

    const grid    = buildGrid(canvasW, canvasH, pxPerMeter, 1.0)
    const density = computeDensity(agents, grid, pxPerMeter)

    // Find max-density cell index + value
    let maxVal  = 0
    let maxIdx  = 0
    for (let i = 0; i < density.length; i++) {
      if (density[i] > maxVal) { maxVal = density[i]; maxIdx = i }
    }

    // Gate states: openings[] — true = open (passable), false = closed (solid wall)
    const gateStates = {}
    for (const op of (layout?.openings || [])) {
      gateStates[op.id] = !!op.isOpen
    }

    _snapshots.push({
      t,
      densityGrid:    density,          // Float32Array — same structure as densityGrid.js
      gateStates,
      agentCount:     agents.filter(a => !a.reachedExit).length,
      maxDensityCell: { cellIdx: maxIdx, value: maxVal },
    })
  }

  /**
   * Stop logging and return the full time series.
   * @returns {Array} snapshot[]
   */
  function stop() {
    _active = false
    return _snapshots.slice()
  }

  /** Is logging currently active? */
  function isActive() { return _active }

  return { start, maybeRecord, stop, isActive }
}
