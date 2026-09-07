/**
 * frontend/src/lib/bottleneckAnalysis.js
 *
 * Post-processing bottleneck analysis for CrowdSense Planner scenario output.
 *
 * Consumes the time series produced by scenarioRunner.js and computes:
 *   - Per-cell first-red timestamps
 *   - Duration spent in red / orange Fruin bands
 *   - Peak density cell, value, and time
 *   - Rise rate (density increase per second) in the 10s before first red crossing
 *
 * Then compares across scenarios to find:
 *   - Persistent bottlenecks (red in every scenario — structural problem)
 *   - Conditional bottlenecks (red only in specific scenarios)
 *   - Mitigation effectiveness between paired scenarios
 *
 * All return values are plain serializable objects (no Float32Array) for easy
 * React state storage and JSON transmission.
 */

import { FRUIN_THRESHOLDS } from './fruinDensity.js'
import { buildGrid } from './densityGrid.js'

// ─── Fruin thresholds ─────────────────────────────────────────────────────────
const [YELLOW_T, ORANGE_T, RED_T] = FRUIN_THRESHOLDS   // 1.08, 2.15, 3.8 p/m²

// ─── Single-run analysis ──────────────────────────────────────────────────────

/**
 * Analyze a single scenario time series.
 *
 * @param {Array}  timeSeries — snapshot[] from scenarioRunner.runScenario()
 * @param {object} layout     — venue layout (for grid dimensions / scale)
 * @returns {object} analysisResult
 *   {
 *     scenarioId?:       string | undefined,
 *     grid:              { cols, rows, cellSizeM, cellSizePx, cellAreaM2 },
 *     firstRedZones:     Map<cellIdx, firstT>  (only cells that reached red)
 *     firstOrangeZones:  Map<cellIdx, firstT>
 *     redDurationPerCell:   Map<cellIdx, seconds>
 *     orangeDurationPerCell: Map<cellIdx, seconds>
 *     peakDensity:       { cellIdx, value, t }
 *     riseRatePerCell:   Map<cellIdx, ratePerSec>   (rate before first-red crossing)
 *     maxDensityByTime:  Array<{ t, maxDensity }>   (for timeline chart)
 *   }
 */
export function analyzeSingleRun(timeSeries, layout) {
  const pxM     = layout?.scale?.px_per_meter || 25
  const canvasW = layout?.canvasWidth  || 800
  const canvasH = layout?.canvasHeight || 850
  const grid    = buildGrid(canvasW, canvasH, pxM, 1.0)
  const nCells  = grid.cols * grid.rows

  // Use Maps for sparse storage (most cells stay empty)
  const firstRedZones     = new Map()   // cellIdx → firstT
  const firstOrangeZones  = new Map()
  const redDuration        = new Map()   // cellIdx → accumulated seconds in red
  const orangeDuration     = new Map()

  let peakValue  = 0
  let peakCellIdx = 0
  let peakT       = 0

  // For rise-rate: store density history per cell (only cells that get hot)
  // Shape: Map<cellIdx, [{t, d}]>
  const hotCellHistory = new Map()

  const maxDensityByTime = []

  for (let si = 0; si < timeSeries.length; si++) {
    const snap    = timeSeries[si]
    const density = snap.densityGrid   // Float32Array
    const t       = snap.t
    const dt      = si > 0 ? (t - timeSeries[si - 1].t) : 0.5

    let frameMax = 0

    for (let ci = 0; ci < nCells; ci++) {
      const d = density[ci]
      if (d <= 0) continue

      if (d > frameMax) frameMax = d

      // Peak tracking
      if (d > peakValue) {
        peakValue   = d
        peakCellIdx = ci
        peakT       = t
      }

      // First-red tracking
      if (d >= RED_T && !firstRedZones.has(ci)) {
        firstRedZones.set(ci, t)
      }

      // First-orange tracking
      if (d >= ORANGE_T && !firstOrangeZones.has(ci)) {
        firstOrangeZones.set(ci, t)
      }

      // Duration accumulation (only if dt > 0 — skip the zeroth snapshot)
      if (dt > 0) {
        if (d >= RED_T) {
          redDuration.set(ci, (redDuration.get(ci) || 0) + dt)
        } else if (d >= ORANGE_T) {
          orangeDuration.set(ci, (orangeDuration.get(ci) || 0) + dt)
        }
      }

      // Hot-cell history for rise rate (track if approaching or at orange+)
      if (d >= ORANGE_T) {
        if (!hotCellHistory.has(ci)) hotCellHistory.set(ci, [])
        hotCellHistory.get(ci).push({ t, d })
      }
    }

    maxDensityByTime.push({ t: Math.round(t * 10) / 10, maxDensity: Math.round(frameMax * 100) / 100 })
  }

  // --- Compute rise rates (average density increase rate in the 10s before first red) ---
  const riseRatePerCell = new Map()
  for (const [ci, firstT] of firstRedZones) {
    const history = hotCellHistory.get(ci)
    if (!history || history.length < 2) continue

    // Filter to the 10-second window before firstT
    const windowStart = firstT - 10
    const window = history.filter(p => p.t >= windowStart && p.t <= firstT)
    if (window.length < 2) continue

    const span      = window[window.length - 1].t - window[0].t
    const densityΔ  = window[window.length - 1].d  - window[0].d
    const rate      = span > 0.1 ? densityΔ / span : 0
    riseRatePerCell.set(ci, Math.round(rate * 1000) / 1000)
  }

  return {
    grid,
    firstRedZones,
    firstOrangeZones,
    redDurationPerCell:    redDuration,
    orangeDurationPerCell: orangeDuration,
    peakDensity:           { cellIdx: peakCellIdx, value: Math.round(peakValue * 100) / 100, t: Math.round(peakT * 10) / 10 },
    riseRatePerCell,
    maxDensityByTime,
  }
}

// ─── Multi-scenario comparison ────────────────────────────────────────────────

/**
 * Compare multiple scenario results.
 *
 * @param {Array} scenarioResults — array of { scenarioId, label, timeSeries, analysis }
 *                                  where analysis = result of analyzeSingleRun()
 * @returns {object}
 *   {
 *     persistentBottlenecks:  Array<{ cellIdx, scenarioCount, appearedIn: scenarioId[] }>
 *     conditionalBottlenecks: Array<{ cellIdx, appearedIn: scenarioId[], missingIn: scenarioId[] }>
 *     mitigationEffectiveness: Array<{ baseline, comparison, label, peakDensityDelta, redDurationDelta, timeToFirstRedDelta }>
 *   }
 */
export function compareScenarios(scenarioResults) {
  const n = scenarioResults.length
  if (n === 0) return { persistentBottlenecks: [], conditionalBottlenecks: [], mitigationEffectiveness: [] }

  // --- Build per-cell coverage map ---
  // cellCoverage: Map<cellIdx, Set<scenarioId>>
  const cellCoverage = new Map()

  for (const sr of scenarioResults) {
    const { analysis } = sr
    if (!analysis) continue
    for (const [ci] of analysis.firstRedZones) {
      if (!cellCoverage.has(ci)) cellCoverage.set(ci, new Set())
      cellCoverage.get(ci).add(sr.scenarioId)
    }
  }

  const allScenarioIds = scenarioResults.map(sr => sr.scenarioId)

  const persistentBottlenecks  = []
  const conditionalBottlenecks = []

  for (const [ci, scenarioSet] of cellCoverage) {
    const appearedIn = [...scenarioSet]
    const missingIn  = allScenarioIds.filter(id => !scenarioSet.has(id))

    if (scenarioSet.size === n) {
      // Red in every scenario → structural problem
      persistentBottlenecks.push({ cellIdx: ci, scenarioCount: n, appearedIn })
    } else {
      // Conditional bottleneck
      conditionalBottlenecks.push({ cellIdx: ci, appearedIn, missingIn })
    }
  }

  // Sort by how many scenarios the bottleneck appeared in (most common first)
  persistentBottlenecks.sort((a, b)  => b.scenarioCount - a.scenarioCount)
  conditionalBottlenecks.sort((a, b) => b.appearedIn.length - a.appearedIn.length)

  // --- Mitigation effectiveness: compare paired scenarios ---
  // Pairs with meaningful before/after relationship:
  const pairs = [
    { baseId: 'gate2_closed_full', compId: 'gate2_opens_at_crisis', label: 'Gate 2 Closed → Opens at Crisis' },
    { baseId: 'baseline',          compId: 'gate2_opens_at_crisis', label: 'Baseline → Gate 2 Opens at Crisis' },
    { baseId: 'baseline',          compId: 'overcapacity',          label: 'Baseline → Overcapacity' },
    { baseId: 'baseline',          compId: 'focus_normal',          label: 'Baseline → Focus Point (Normal)' },
    { baseId: 'baseline',          compId: 'focus_surged',          label: 'Baseline → Focus Surge (Rushed)' },
    { baseId: 'focus_normal',      compId: 'focus_surged',          label: 'Focus Normal → Focus Surge (Rushed)' },
    { baseId: 'baseline',          compId: 'panic_midway',          label: 'Baseline → Panic Midway' },
    { baseId: 'gate2_closed_full', compId: 'baseline',              label: 'Gate 2 Closed → Baseline (any open gates)' },
  ]

  const mitigationEffectiveness = []
  const byId = {}
  for (const sr of scenarioResults) byId[sr.scenarioId] = sr

  for (const pair of pairs) {
    const base = byId[pair.baseId]
    const comp = byId[pair.compId]
    if (!base?.analysis || !comp?.analysis) continue

    const basePeak = base.analysis.peakDensity.value
    const compPeak = comp.analysis.peakDensity.value

    // Aggregate total red duration across all cells
    const baseRedTotal = [...base.analysis.redDurationPerCell.values()].reduce((a, b) => a + b, 0)
    const compRedTotal = [...comp.analysis.redDurationPerCell.values()].reduce((a, b) => a + b, 0)

    // Time-to-first-red: earliest firstRedZones t across all cells
    const firstRedOf = (analysis) => {
      let earliest = Infinity
      for (const t of analysis.firstRedZones.values()) {
        if (t < earliest) earliest = t
      }
      return earliest === Infinity ? null : earliest
    }
    const baseFirstRed = firstRedOf(base.analysis)
    const compFirstRed = firstRedOf(comp.analysis)

    const timeToFirstRedDelta =
      baseFirstRed !== null && compFirstRed !== null
        ? Math.round((compFirstRed - baseFirstRed) * 10) / 10
        : null

    const stillReachesRed = comp.analysis.firstRedZones.size > 0

    mitigationEffectiveness.push({
      baseline:    pair.baseId,
      comparison:  pair.compId,
      label:       pair.label,
      peakDensityDelta:    Math.round((compPeak - basePeak) * 100) / 100,
      redDurationDelta:    Math.round((compRedTotal - baseRedTotal) * 10) / 10,
      timeToFirstRedDelta,
      baseFirstRed,
      compFirstRed,
      stillReachesRed,
      basePeak,
      compPeak,
    })
  }

  return { persistentBottlenecks, conditionalBottlenecks, mitigationEffectiveness }
}

// ─── Cell index ↔ grid coordinate & Zone helpers ────────────────────────────

/**
 * Default venue sectoring zones (8-subzone sectoring with longitudinal barrier split)
 */
export const DEFAULT_VENUE_ZONES = [
  {
    id: 'z1a_south_west',
    code: 'Zone 1A',
    name: 'South Broadway (West / Behind Barricade)',
    color: '#0284c7',
    bounds: { minX: 0, maxX: 275, minY: 580, maxY: 850 },
    description: 'South arrival lane west of central barricade',
  },
  {
    id: 'z1b_south_east',
    code: 'Zone 1B',
    name: 'South Broadway (East / Main Lane)',
    color: '#0ea5e9',
    bounds: { minX: 275, maxX: 600, minY: 580, maxY: 850 },
    description: 'South arrival main thoroughfare east of central barricade',
  },
  {
    id: 'z2a_mid_west',
    code: 'Zone 2A',
    name: 'Central Broadway (West / Behind Barricade)',
    color: '#8b5cf6',
    bounds: { minX: 0, maxX: 275, minY: 300, maxY: 580 },
    description: 'Mid-avenue channelized lane west of central barrier',
  },
  {
    id: 'z2b_mid_east',
    code: 'Zone 2B',
    name: 'Central Broadway (East / Main Avenue)',
    color: '#a855f7',
    bounds: { minX: 275, maxX: 600, minY: 300, maxY: 580 },
    description: 'Mid-avenue main corridor approaching Temple Forecourt',
  },
  {
    id: 'z3_temple',
    code: 'Zone 3',
    name: 'Temple Square & Chariot Basin',
    color: '#f59e0b',
    bounds: { minX: 180, maxX: 500, minY: 120, maxY: 300 },
    description: 'Gopuram plaza, Courtyard gate, and Chariot (Rath) focal point',
  },
  {
    id: 'z4_north',
    code: 'Zone 4',
    name: 'North Exit & Gate Concourse',
    color: '#10b981',
    bounds: { minX: 220, maxX: 580, minY: 0, maxY: 120 },
    description: 'Northern exit concourse and Emergency Gates 1 & 2',
  },
  {
    id: 'z5_west',
    code: 'Zone 5',
    name: 'North-West Feeder & West Exit',
    color: '#ec4899',
    bounds: { minX: 0, maxX: 220, minY: 0, maxY: 300 },
    description: 'North-West entry spawn and West evacuation gate',
  },
  {
    id: 'z6_east',
    code: 'Zone 6',
    name: 'East Flank Relief Corridor',
    color: '#6366f1',
    bounds: { minX: 500, maxX: 800, minY: 0, maxY: 580 },
    description: 'Eastern perimeter bypass and relief channel',
  },
]

/**
 * Convert a flat cell index to {col, row} grid coordinates.
 */
export function cellIdxToCoord(cellIdx, grid) {
  return {
    col: cellIdx % grid.cols,
    row: Math.floor(cellIdx / grid.cols),
  }
}

/**
 * Convert a cell index to pixel center coordinates.
 */
export function cellIdxToPixelCenter(cellIdx, grid) {
  const { col, row } = cellIdxToCoord(cellIdx, grid)
  return {
    x: (col + 0.5) * grid.cellSizePx,
    y: (row + 0.5) * grid.cellSizePx,
  }
}

/**
 * Identify which subzone a given pixel position belongs to.
 */
export function getZoneForPosition(pos, layout) {
  if (!pos) return null
  const zones = layout?.zones && layout.zones.length > 0 ? layout.zones : DEFAULT_VENUE_ZONES

  for (const zone of zones) {
    if (zone.bounds) {
      const { minX, maxX, minY, maxY } = zone.bounds
      if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
        return zone
      }
    }
  }

  // Fallback to closest zone center
  let best = zones[0]
  let minD = Infinity
  for (const zone of zones) {
    if (zone.bounds) {
      const cx = (zone.bounds.minX + zone.bounds.maxX) / 2
      const cy = (zone.bounds.minY + zone.bounds.maxY) / 2
      const d = Math.hypot(pos.x - cx, pos.y - cy)
      if (d < minD) {
        minD = d
        best = zone
      }
    }
  }
  return best || null
}

/**
 * Identify the subzone for a specific grid cell.
 */
export function getZoneForCell(cellIdx, grid, layout) {
  const pixelPos = cellIdxToPixelCenter(cellIdx, grid)
  const zone = getZoneForPosition(pixelPos, layout)
  const { col, row } = cellIdxToCoord(cellIdx, grid)
  if (!zone) {
    return {
      id: `cell_${col}_${row}`,
      code: `Cell [${col},${row}]`,
      name: `Cell [${col},${row}]`,
      color: '#94a3b8',
      label: `Cell [${col},${row}]`,
      fullLabel: `Cell [${col},${row}]`,
      col,
      row,
    }
  }
  return {
    ...zone,
    label: zone.code,
    fullLabel: `${zone.code} [${col},${row}]`,
    col,
    row,
  }
}

/**
 * Get a human-readable zone code label for a cell.
 */
export function cellLabel(cellIdx, grid, layout) {
  const info = getZoneForCell(cellIdx, grid, layout)
  return info.fullLabel || info.code || `Cell [${cellIdxToCoord(cellIdx, grid).col},${cellIdxToCoord(cellIdx, grid).row}]`
}

/**
 * Find the top-N hottest cells across all scenarios (by max red duration).
 *
 * @param {Array}  scenarioResults — with .analysis attached
 * @param {number} n               — how many cells to return
 * @returns {Array<{cellIdx, maxRedDuration, peakDensity}>}
 */
export function topNHottestCells(scenarioResults, n = 10) {
  const cellBest = new Map()  // cellIdx → { maxRedDuration, peakDensity }

  for (const sr of scenarioResults) {
    if (!sr.analysis) continue
    for (const [ci, dur] of sr.analysis.redDurationPerCell) {
      const prev = cellBest.get(ci) || { maxRedDuration: 0, peakDensity: 0 }
      cellBest.set(ci, {
        maxRedDuration: Math.max(prev.maxRedDuration, dur),
        peakDensity:    Math.max(prev.peakDensity, sr.analysis.peakDensity.cellIdx === ci ? sr.analysis.peakDensity.value : 0),
      })
    }
    // Also capture peak density cells that may not have crossed red
    const pk = sr.analysis.peakDensity
    if (!cellBest.has(pk.cellIdx)) {
      cellBest.set(pk.cellIdx, { maxRedDuration: 0, peakDensity: pk.value })
    } else {
      const prev = cellBest.get(pk.cellIdx)
      cellBest.set(pk.cellIdx, { ...prev, peakDensity: Math.max(prev.peakDensity, pk.value) })
    }
  }

  return [...cellBest.entries()]
    .map(([ci, stats]) => ({ cellIdx: ci, ...stats }))
    .sort((a, b) => b.maxRedDuration - a.maxRedDuration || b.peakDensity - a.peakDensity)
    .slice(0, n)
}
