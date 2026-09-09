/**
 * frontend/src/lib/scenarioRunner.js
 *
 * Headless CrowdSense scenario runner.
 *
 * Runs the Social Force Model simulation without any rendering or requestAnimationFrame.
 * Uses a fixed timestep (dt = 0.05s = 20 physics steps per simulated second) for
 * deterministic, reproducible output.
 *
 * For a 120-second scenario that produces ≤2,400 SFM steps.
 * Performance expectation: < 1 second wall-clock per scenario with ≤300 agents.
 *
 * Scripted event trigger types supported:
 *   "time"           — fires once when simT >= atSec
 *   "first_red_zone" — fires once when any grid cell first crosses RED_THRESHOLD
 *
 * Returns: { scenarioId, label, timeSeries, finalStats }
 */

import {
  DEFAULT_SFM_PARAMS,
  spawnAgent,
  triggerEmergency as sfmTriggerEmergency,
  setFocusTarget,
  step as sfmStep,
  extractWallSegments,
  extractBuildingPolygons,
  convertExitsToMeters,
  convertSpawnsToMeters,
  resetAgentIds,
} from './socialForceSim.js'

import { buildGrid, computeDensity } from './densityGrid.js'
import { createLogger } from './simulationLogger.js'
import { RED_THRESHOLD } from './scenarios.js'

/** Fixed simulation timestep for headless runs (deterministic) */
const HEADLESS_DT = 0.05   // seconds
/** Snapshot interval for the logger (simulated seconds) */
const LOG_INTERVAL_SEC = 0.5
/** Canvas dimensions mirror the real PlannerPage */
const CANVAS_W = 800
const CANVAS_H = 850

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Deep-clone the venue layout so the headless run never mutates the user's layout.
 */
function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout))
}

/**
 * Apply scenario-level gate init: force all openings closed or preserve current state.
 */
function applyInitialGateState(layout, scenario) {
  if (scenario.forceCloseAllGates) {
    for (const op of (layout.openings || [])) {
      op.isOpen = false
    }
  }
  // Otherwise preserve whatever isOpen state is in the cloned layout
}

/**
 * Build the wall segment list including barricades and closed openings.
 */
function buildWallSegs(layout, pxM) {
  const wallSegs = extractWallSegments(layout.walls, pxM)

  for (const bar of (layout.barricades || [])) {
    wallSegs.push([
      { x: bar.a.x / pxM, y: bar.a.y / pxM },
      { x: bar.b.x / pxM, y: bar.b.y / pxM },
    ])
  }

  for (const op of (layout.openings || [])) {
    if (!op.isOpen) {
      wallSegs.push([
        { x: op.a.x / pxM, y: op.a.y / pxM },
        { x: op.b.x / pxM, y: op.b.y / pxM },
      ])
    }
  }

  return wallSegs
}

/**
 * Choose an exit goal for a newly spawned agent.
 * Mirrors the logic in PlannerPage.jsx tick().
 */
function chooseGoalExit(sp_m, exits_m) {
  const isSouth = sp_m.id.includes('south') || sp_m.id.includes('se')
  const opposite = exits_m.filter(e =>
    isSouth
      ? !e.id.includes('south') && !e.id.includes('se')
      : e.id.includes('south') || e.id.includes('se')
  )
  if (opposite.length > 0) return opposite[Math.floor(Math.random() * opposite.length)]
  return exits_m.find(e => isSouth ? e.id.includes('north') : e.id.includes('south')) || exits_m[0]
}

/**
 * Try to open a gate by its ID. If not found, open the first available closed opening.
 * Returns true if a gate was opened.
 */
function openGate(layout, gateId) {
  // Try exact match first
  const exact = (layout.openings || []).find(o => o.id === gateId)
  if (exact) {
    exact.isOpen = true
    return true
  }
  // Fallback: open first closed opening
  const fallback = (layout.openings || []).find(o => !o.isOpen)
  if (fallback) {
    fallback.isOpen = true
    return true
  }
  return false
}

/**
 * Handle scripted events. Returns a new set of fired event indices.
 *
 * @param {object}   scenario      — scenario config
 * @param {Set}      firedEvents   — indices of events already fired (mutated in place)
 * @param {number}   simT          — current simulated time
 * @param {boolean}  firstRedSeen  — whether first_red_zone trigger has been observed
 * @param {object}   layout        — mutable layout (openings will be modified)
 * @param {Array}    agents        — current agent array
 * @param {Array}    exits_m       — exits in meters
 */
/**
 * Handle scripted events. Returns a new set of fired event indices.
 *
 * @param {object}   scenario      — scenario config
 * @param {Set}      firedEvents   — indices of events already fired (mutated in place)
 * @param {number}   simT          — current simulated time
 * @param {boolean}  firstRedSeen  — whether first_red_zone trigger has been observed
 * @param {object}   layout        — mutable layout (openings will be modified)
 * @param {Array}    agents        — current agent array
 * @param {Array}    exits_m       — exits in meters
 * @param {object}   focusState    — { isFocusMode, focusCondition, focusPoint_m }
 * @param {number}   pxM           — pixels per meter
 */
function processScriptedEvents(scenario, firedEvents, simT, firstRedSeen, layout, agents, exits_m, focusState, pxM) {
  for (let i = 0; i < scenario.scriptedEvents.length; i++) {
    if (firedEvents.has(i)) continue
    const ev = scenario.scriptedEvents[i]

    let shouldFire = false
    if (ev.trigger === 'time' && simT >= ev.atSec) {
      shouldFire = true
    } else if (ev.trigger === 'first_red_zone' && firstRedSeen) {
      shouldFire = true
    }

    if (!shouldFire) continue
    firedEvents.add(i)

    switch (ev.action) {
      case 'openGate':
        openGate(layout, ev.gateId)
        break
      case 'closeGate': {
        const op = (layout.openings || []).find(o => o.id === ev.gateId)
        if (op) op.isOpen = false
        break
      }
      case 'triggerEmergency':
        sfmTriggerEmergency(agents, exits_m, DEFAULT_SFM_PARAMS)
        break
      case 'setFocusMode':
      case 'triggerFocus': {
        if (focusState) {
          focusState.isFocusMode = true
          focusState.focusCondition = ev.condition || 'normal'
          if (ev.focusPoint) {
            focusState.focusPoint_m = { x: ev.focusPoint.x / pxM, y: ev.focusPoint.y / pxM }
          }
          setFocusTarget(agents, focusState.focusPoint_m, focusState.focusCondition, DEFAULT_SFM_PARAMS)
        }
        break
      }
      case 'disableFocusMode': {
        if (focusState) {
          focusState.isFocusMode = false
          for (const a of agents) {
            a.isFocus = false
            a.isPanic = false
            a.desiredSpeed = DEFAULT_SFM_PARAMS.desiredSpeed * (0.85 + Math.random() * 0.3)
            if (exits_m.length > 0) {
              a.goal = { ...exits_m[Math.floor(Math.random() * exits_m.length)].center_m }
            }
          }
        }
        break
      }
      default:
        console.warn('[ScenarioRunner] Unknown action:', ev.action)
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a single scenario headlessly and return the time series + final stats.
 *
 * @param {object}  scenarioConfig — one entry from scenarios.js SCENARIOS map
 * @param {object}  venueLayout    — the current venue layout object
 * @param {function} [onProgress]  — optional callback(fractionDone: 0–1)
 * @returns {{ scenarioId, label, timeSeries, finalStats }}
 */
export function runScenario(scenarioConfig, venueLayout, onProgress) {
  const tStart = performance.now()

  // 1. Clone layout (never mutate the user's working layout)
  const layout = cloneLayout(venueLayout)
  applyInitialGateState(layout, scenarioConfig)

  const pxM = layout.scale?.px_per_meter || 13.363
  const canvasW = layout.canvasWidth  || CANVAS_W
  const canvasH = layout.canvasHeight || CANVAS_H

  // 2. Convert geometry to meters
  const exits_m  = convertExitsToMeters(layout.exits, pxM)
  const spawns_m = convertSpawnsToMeters(layout.spawns, pxM)

  if (exits_m.length === 0 || spawns_m.length === 0) {
    console.warn('[ScenarioRunner] No exits or spawns — returning empty time series')
    return {
      scenarioId:  scenarioConfig.id,
      label:       scenarioConfig.label,
      timeSeries:  [],
      finalStats:  { agentCount: 0, peakDensity: 0, wallClockMs: 0 },
    }
  }

  // 3. Build grid (calibrated to 3.5 sq.m per 25px cell)
  const grid = buildGrid(canvasW, canvasH, pxM)

  // 4. Boundary
  const boundary_m = {
    minX: 0,
    maxX: canvasW / pxM,
    minY: 0,
    maxY: canvasH / pxM,
  }

  // 5. Focus mode configuration
  const rawFocus = layout.focusPoint || { x: 355, y: 195 }
  const focusState = {
    isFocusMode:    Boolean(scenarioConfig.isFocusMode || scenarioConfig.focusMode),
    focusCondition: scenarioConfig.focusCondition || 'normal',
    focusPoint_m:   { x: rawFocus.x / pxM, y: rawFocus.y / pxM },
  }

  // 6. Simulation state
  resetAgentIds()
  const agents        = []
  let simT            = 0
  let spawnAccum      = {}  // { spawnId: accumulator }
  const firedEvents   = new Set()
  let firstRedSeen    = false
  let peakDensity     = 0

  // 7. Logger
  const logger = createLogger()
  logger.start(LOG_INTERVAL_SEC)

  const totalSteps  = Math.ceil(scenarioConfig.durationSec / HEADLESS_DT)
  const maxAgents   = scenarioConfig.maxAgents || 600
  const spawnRate   = scenarioConfig.spawnRatePerSec || 5

  // 8. Main headless loop
  for (let step = 0; step < totalSteps; step++) {
    const dt = HEADLESS_DT

    // Rebuild wall segs each step (openings may change on scripted events)
    const buildingPolys_m = extractBuildingPolygons(layout.walls, pxM)
    const wallSegs        = buildWallSegs(layout, pxM)

    // --- Spawn agents ---
    if (agents.length < maxAgents && exits_m.length > 0 && spawns_m.length > 0) {
      for (const sp_m of spawns_m) {
        if (!spawnAccum[sp_m.id]) spawnAccum[sp_m.id] = 0
        spawnAccum[sp_m.id] += dt * spawnRate

        while (spawnAccum[sp_m.id] >= 1 && agents.length < maxAgents) {
          spawnAccum[sp_m.id] -= 1
          const goalExit = chooseGoalExit(sp_m, exits_m)
          const agent = spawnAgent(sp_m, goalExit, DEFAULT_SFM_PARAMS, null, buildingPolys_m, wallSegs)

          // If focus mode is active, override goal to the focus target
          if (focusState.isFocusMode) {
            agent.isFocus = true
            const isRushed = focusState.focusCondition === 'rushed' || focusState.focusCondition === 'surged'
            agent.isPanic = isRushed
            agent.desiredSpeed = isRushed
              ? DEFAULT_SFM_PARAMS.desiredSpeed * (DEFAULT_SFM_PARAMS.rushedMultiplier || 2.0)
              : DEFAULT_SFM_PARAMS.desiredSpeed * (0.85 + Math.random() * 0.3)
            agent.goal = { x: focusState.focusPoint_m.x, y: focusState.focusPoint_m.y }
          }

          agents.push(agent)
        }
      }
    }

    // --- SFM physics step ---
    if (agents.length > 0) {
      sfmStep(agents, wallSegs, exits_m, dt, DEFAULT_SFM_PARAMS, boundary_m, buildingPolys_m)
    }

    // --- Remove exited agents ---
    for (let i = agents.length - 1; i >= 0; i--) {
      if (agents[i].reachedExit) agents.splice(i, 1)
    }

    // --- Advance sim time ---
    simT += dt

    // --- Density for event detection ---
    let density = null
    if (agents.length > 0) {
      density = computeDensity(agents, grid, pxM)
      const mx = density.reduce((m, v) => Math.max(m, v), 0)
      if (mx > peakDensity) peakDensity = mx
      if (!firstRedSeen && mx >= RED_THRESHOLD) {
        firstRedSeen = true
      }
    }

    // --- Scripted events ---
    processScriptedEvents(scenarioConfig, firedEvents, simT, firstRedSeen, layout, agents, exits_m, focusState, pxM)

    // --- Log snapshot ---
    logger.maybeRecord(simT, agents, layout, canvasW, canvasH, pxM)

    // --- Progress callback (every 10% of steps) ---
    if (onProgress && step % Math.max(1, Math.floor(totalSteps / 20)) === 0) {
      onProgress(step / totalSteps)
    }
  }

  if (onProgress) onProgress(1.0)
  const timeSeries = logger.stop()
  const wallClockMs = performance.now() - tStart

  return {
    scenarioId: scenarioConfig.id,
    label:      scenarioConfig.label,
    timeSeries,
    finalStats: {
      agentCount:   agents.length,
      peakDensity:  Math.round(peakDensity * 100) / 100,
      wallClockMs:  Math.round(wallClockMs),
    },
  }
}

/**
 * Run multiple scenarios sequentially, yielding to the event loop between each
 * (async setTimeout yield = keeps the UI responsive without a Web Worker).
 *
 * @param {object[]}  scenarioConfigs  — array of scenario config objects
 * @param {object}    venueLayout      — current venue layout
 * @param {function}  onScenarioStart  — called with (scenarioId, index, total) before each run
 * @param {function}  onScenarioDone   — called with (result, index, total) after each run
 * @returns {Promise<object[]>}        — array of runScenario results in order
 */
export async function runScenariosSequential(
  scenarioConfigs,
  venueLayout,
  onScenarioStart,
  onScenarioDone,
) {
  const results = []

  for (let i = 0; i < scenarioConfigs.length; i++) {
    const sc = scenarioConfigs[i]

    if (onScenarioStart) onScenarioStart(sc.id, i, scenarioConfigs.length)

    // Yield to event loop before each heavy run so the UI can update
    await new Promise(r => setTimeout(r, 0))

    const result = runScenario(sc, venueLayout)
    results.push(result)

    console.log(
      `[ScenarioRunner] "${sc.label}" done — ` +
      `${result.finalStats.wallClockMs}ms wall-clock, ` +
      `${result.timeSeries.length} snapshots, ` +
      `peak density ${result.finalStats.peakDensity} p/m²`
    )

    if (onScenarioDone) onScenarioDone(result, i, scenarioConfigs.length)

    // Yield again after each run so React can re-render the progress indicator
    await new Promise(r => setTimeout(r, 0))
  }

  return results
}
