/**
 * frontend/src/lib/recommendationRules.js
 *
 * Deterministic, inspectable rule table for the CrowdSense Planner
 * Pre-Event Bottleneck Analysis module.
 *
 * Each rule is a plain object with:
 *   id:             unique string identifier
 *   condition(ctx): returns true if the rule applies
 *   recommend(ctx): returns recommendation text string
 *
 * Every recommendation is traceable back to specific numbers in `ctx`.
 * The LLM (if used) only narrates these results — it never generates
 * the safety judgment itself.
 *
 * Usage:
 *   const recommendations = matchRules(analysisBundle, venueLayout)
 *
 *   Each returned recommendation:
 *   {
 *     ruleId:       string,
 *     text:         string,
 *     triggerData:  object  (the specific numbers that fired the rule)
 *   }
 */

import { FRUIN_THRESHOLDS, getDensityBand } from './fruinDensity.js'
import { cellLabel, cellIdxToPixelCenter } from './bottleneckAnalysis.js'

/** p/m²/s — density rising faster than this in the 10s before first red = "fast spike" */
export const THRESHOLD_FAST_RISE = 0.28

/** Minimum red duration (seconds) to consider a zone "persistently critical" */
const MIN_PERSISTENT_RED_SEC = 20

/** Fruin red threshold (people / m²) */
const RED_T = FRUIN_THRESHOLDS[2]   // 3.8

// ─── Rule definitions ─────────────────────────────────────────────────────────

/**
 * Rules are evaluated against a "zone context" object shaped as:
 * {
 *   cellIdx:       number,
 *   cellName:      string,       // human-readable label e.g. "Cell [12,8]"
 *   firstRedTime:  number|null,  // simulated seconds
 *   firstRedRank:  number,       // 0 = earliest cell to go red across all scenarios
 *   redDuration:   number,       // total seconds in red (across best scenario)
 *   riseRate:      number|null,  // p/m²/s before first red
 *   peakDensity:   number,
 *   scenarioCount: number,       // how many scenarios showed red here
 *   totalScenarios: number,
 *   isPersistent:  boolean,      // red in ALL scenarios
 *   isConditional: boolean,      // red in SOME scenarios
 *   appearedIn:    string[],     // scenario IDs
 *   missingIn:     string[],     // scenario IDs
 *   nearOpening:   boolean,      // grid cell is near an opening pixel region
 *   nearBarricade: boolean,
 * }
 *
 * Comparison context:
 * {
 *   type:              'gate_open_vs_closed' | 'baseline_vs_overcapacity' | …
 *   label:             string,
 *   baseline:          string,   // scenario ID
 *   comparison:        string,
 *   peakDensityDelta:  number,   // negative = improvement
 *   redDurationDelta:  number,
 *   timeToFirstRedDelta: number|null,
 *   delayedOnsetSec:   number,
 *   stillReachesRed:   boolean,
 *   gateName:          string,
 * }
 */

export const RULES = [
  // ── Rule 1: First cell to reach red (structural chokepoint) ───────────────
  {
    id: 'narrow_opening_first_red',
    condition: (ctx) =>
      ctx.firstRedRank === 0 &&
      ctx.firstRedTime !== null &&
      ctx.scenarioCount >= Math.max(1, Math.floor(ctx.totalScenarios * 0.5)),
    recommend: (ctx) =>
      `${ctx.cellName} is consistently the first area to reach critical density ` +
      `(first red at T+${ctx.firstRedTime}s in ${ctx.scenarioCount}/${ctx.totalScenarios} scenarios, ` +
      `peak ${ctx.peakDensity.toFixed(2)} p/m²). ` +
      (ctx.nearOpening
        ? `This area is adjacent to an opening/gate — a classic narrow-entry chokepoint. ` +
          `Consider widening this passage or adding a parallel opening before the event.`
        : `This is a structural flow bottleneck. Review the crowd path geometry near this cell ` +
          `and consider redistribution barriers or additional space clearance.`),
  },

  // ── Rule 2: Persistent red near obstacle ──────────────────────────────────
  {
    id: 'obstacle_persistent_red',
    condition: (ctx) =>
      ctx.nearBarricade &&
      ctx.redDuration >= MIN_PERSISTENT_RED_SEC &&
      ctx.isPersistent,
    recommend: (ctx) =>
      `Density remains critical near a barricade/obstacle at ${ctx.cellName} for ` +
      `${ctx.redDuration.toFixed(0)}s cumulative (across ${ctx.scenarioCount} scenarios). ` +
      `The obstacle is creating a sustained flow restriction. Consider repositioning this ` +
      `barricade outside peak-flow paths, or scheduling its placement after peak arrival ends.`,
  },

  // ── Rule 3: Gate delays but does not prevent red zone ────────────────────
  {
    id: 'gate_delays_not_prevents',
    condition: (ctx) =>
      ctx.type === 'gate_comparison' &&
      ctx.delayedOnsetSec > 0 &&
      ctx.stillReachesRed,
    recommend: (ctx) =>
      `${ctx.label}: closing the gate delays critical density onset by ` +
      `${ctx.delayedOnsetSec.toFixed(0)}s but does not prevent it ` +
      `(red zone still reached at T+${ctx.compFirstRed?.toFixed(0) ?? '?'}s). ` +
      `Recommend designating this gate as an active overflow valve (open proactively ` +
      `at green→yellow transition) rather than reserving it for emergency-only use.`,
  },

  // ── Rule 4: Fast density rise rate → staggered entry needed ──────────────
  {
    id: 'fast_rise_rate',
    condition: (ctx) =>
      ctx.riseRate !== null &&
      ctx.riseRate > THRESHOLD_FAST_RISE &&
      ctx.firstRedTime !== null,
    recommend: (ctx) =>
      `${ctx.cellName} crosses from safe to critical density at a fast rate ` +
      `(${ctx.riseRate.toFixed(3)} p/m²/s in the 10s before first red at T+${ctx.firstRedTime}s). ` +
      `This indicates a rapid surge rather than gradual buildup. ` +
      `Recommend staggered entry timing or per-gate capacity caps at nearby spawn points ` +
      `to slow the arrival rate before it reaches this threshold.`,
  },

  // ── Rule 5: Overcapacity dramatically worsens peak density ───────────────
  {
    id: 'overcapacity_amplification',
    condition: (ctx) =>
      ctx.type === 'overcapacity_comparison' &&
      ctx.peakDensityDelta > 1.5,
    recommend: (ctx) =>
      `Under overcapacity arrival rates (${ctx.label}), peak density increases by ` +
      `${ctx.peakDensityDelta.toFixed(2)} p/m² vs baseline. ` +
      `This venue has limited capacity to absorb surge arrivals. ` +
      `Recommend setting a hard gate-count limit and deploying queue management ` +
      `before the event reaches peak arrival window.`,
  },

  // ── Rule 6: Panic triggers severe red-duration increase ──────────────────
  {
    id: 'panic_red_amplification',
    condition: (ctx) =>
      ctx.type === 'panic_comparison' &&
      ctx.redDurationDelta > 30,
    recommend: (ctx) =>
      `Panic activation at T+60s increases total critical-density cell-seconds by ` +
      `${ctx.redDurationDelta.toFixed(0)}s compared to baseline. ` +
      `This confirms that egress paths are not adequately distributed for emergency loads. ` +
      `Recommend pre-positioning crowd stewards near high-density zones to guide ` +
      `orderly egress before panic propagates.`,
  },

  // ── Rule 7: Focus Point Convergence Accumulation ─────────────────────────
  {
    id: 'focus_point_convergence',
    condition: (ctx) =>
      ctx.type === 'focus_comparison' &&
      (ctx.peakDensityDelta > 1.2 || ctx.redDurationDelta > 20),
    recommend: (ctx) =>
      `Focus point attraction (${ctx.label}) concentrates crowd flow, elevating peak density by ` +
      `${ctx.peakDensityDelta.toFixed(2)} p/m² around the attraction target. ` +
      `Recommend implementing radial buffer cordons, circular one-way queuing conduits, ` +
      `and timed viewing batches to prevent localized compression near the focus area.`,
  },
]

// ─── matchRules ───────────────────────────────────────────────────────────────

/**
 * Run all rules against the analysis bundle and return triggered recommendations.
 *
 * @param {object} analysisBundle
 *   {
 *     scenarioResults:    Array<{ scenarioId, label, timeSeries, analysis }>
 *     comparison:         { persistentBottlenecks, conditionalBottlenecks, mitigationEffectiveness }
 *   }
 * @param {object} venueLayout  — venue layout (for proximity checks)
 * @returns {Array<{ ruleId, text, triggerData }>}
 */
export function matchRules(analysisBundle, venueLayout) {
  const { scenarioResults, comparison } = analysisBundle
  if (!scenarioResults?.length || !comparison) return []

  const recommendations = []
  const seen = new Set()  // deduplicate by ruleId + cellIdx

  const totalScenarios = scenarioResults.length
  const pxM = venueLayout?.scale?.px_per_meter || 25

  // --- Build zone contexts from analysis results ---

  // Collect all cells that ever went red, with their stats
  const allRedCells = new Map()   // cellIdx → { firstRedTime[], redDuration, riseRate, peakDensity, scenarioCount, appearedIn }

  for (const sr of scenarioResults) {
    if (!sr.analysis) continue
    const { firstRedZones, redDurationPerCell, riseRatePerCell, peakDensity: pk } = sr.analysis

    for (const [ci, firstT] of firstRedZones) {
      if (!allRedCells.has(ci)) {
        allRedCells.set(ci, {
          firstRedTimes:  [],
          maxRedDuration: 0,
          maxRiseRate:    null,
          maxPeak:        0,
          appearedIn:     [],
        })
      }
      const entry = allRedCells.get(ci)
      entry.firstRedTimes.push(firstT)
      entry.maxRedDuration = Math.max(entry.maxRedDuration, redDurationPerCell.get(ci) || 0)
      const rr = riseRatePerCell.get(ci)
      if (rr !== undefined) entry.maxRiseRate = Math.max(entry.maxRiseRate ?? -Infinity, rr)
      entry.maxPeak = Math.max(entry.maxPeak, pk.cellIdx === ci ? pk.value : 0)
      entry.appearedIn.push(sr.scenarioId)
    }
  }

  // Sort cells by earliest firstRedTime (across any scenario) for rank assignment
  const cellsSortedByFirstRed = [...allRedCells.entries()]
    .map(([ci, e]) => ({
      ci,
      earliestFirstRed: Math.min(...e.firstRedTimes),
      ...e,
    }))
    .sort((a, b) => a.earliestFirstRed - b.earliestFirstRed)

  // --- Proximity helpers ---

  /**
   * Check if pixel center of a cell is within 3m of any opening segment.
   */
  function isNearOpening(ci, grid) {
    const px = cellIdxToPixelCenter(ci, grid)
    const thresholdPx = 3 * pxM  // 3 meters
    for (const op of (venueLayout?.openings || [])) {
      // Check distance from pixel center to opening segment midpoint
      const mx = (op.a.x + op.b.x) / 2
      const my = (op.a.y + op.b.y) / 2
      const d  = Math.hypot(px.x - mx, px.y - my)
      if (d < thresholdPx) return true
    }
    return false
  }

  function isNearBarricade(ci, grid) {
    const px = cellIdxToPixelCenter(ci, grid)
    const thresholdPx = 2.5 * pxM  // 2.5 meters
    for (const bar of (venueLayout?.barricades || [])) {
      const mx = (bar.a.x + bar.b.x) / 2
      const my = (bar.a.y + bar.b.y) / 2
      const d  = Math.hypot(px.x - mx, px.y - my)
      if (d < thresholdPx) return true
    }
    return false
  }

  // Use first scenario's grid for cell ↔ coordinate mapping
  const refGrid = scenarioResults[0]?.analysis?.grid
  if (!refGrid) return []

  // --- Evaluate zone-level rules ---
  for (let rank = 0; rank < cellsSortedByFirstRed.length; rank++) {
    const entry = cellsSortedByFirstRed[rank]
    const ci    = entry.ci
    const isPersistent  = comparison.persistentBottlenecks.some(b => b.cellIdx === ci)
    const isConditional = !isPersistent && comparison.conditionalBottlenecks.some(b => b.cellIdx === ci)
    const appearedInSet = new Set(entry.appearedIn)
    const missingIn     = scenarioResults.map(sr => sr.scenarioId).filter(id => !appearedInSet.has(id))

    const ctx = {
      cellIdx:       ci,
      cellName:      cellLabel(ci, refGrid),
      firstRedTime:  Math.round(entry.earliestFirstRed * 10) / 10,
      firstRedRank:  rank,
      redDuration:   Math.round(entry.maxRedDuration * 10) / 10,
      riseRate:      entry.maxRiseRate !== null ? Math.round(entry.maxRiseRate * 1000) / 1000 : null,
      peakDensity:   Math.round(entry.maxPeak * 100) / 100,
      scenarioCount: entry.appearedIn.length,
      totalScenarios,
      isPersistent,
      isConditional,
      appearedIn:    entry.appearedIn,
      missingIn,
      nearOpening:   isNearOpening(ci, refGrid),
      nearBarricade: isNearBarricade(ci, refGrid),
    }

    for (const rule of RULES) {
      if (rule.condition.length > 1) continue  // skip comparison-context rules here
      if (!rule.condition(ctx)) continue

      const key = `${rule.id}:${ci}`
      if (seen.has(key)) continue
      seen.add(key)

      recommendations.push({
        ruleId:      rule.id,
        text:        rule.recommend(ctx),
        triggerData: ctx,
      })
    }
  }

  // --- Evaluate comparison-level rules ---
  const byId = {}
  for (const sr of scenarioResults) byId[sr.scenarioId] = sr

  for (const me of comparison.mitigationEffectiveness) {
    // Gate comparison
    if (
      (me.baseline === 'gate2_closed_full' && me.comparison === 'gate2_opens_at_crisis') ||
      (me.baseline === 'baseline' && me.comparison === 'gate2_opens_at_crisis')
    ) {
      const ctx = {
        type:              'gate_comparison',
        label:             me.label,
        baseline:          me.baseline,
        comparison:        me.comparison,
        peakDensityDelta:  me.peakDensityDelta,
        redDurationDelta:  me.redDurationDelta,
        timeToFirstRedDelta: me.timeToFirstRedDelta,
        delayedOnsetSec:   me.timeToFirstRedDelta ? Math.abs(me.timeToFirstRedDelta) : 0,
        stillReachesRed:   me.stillReachesRed,
        compFirstRed:      me.compFirstRed,
        gateName:          'Emergency Gate',
      }
      for (const rule of RULES) {
        if (!rule.condition(ctx)) continue
        const key = `${rule.id}:${me.baseline}:${me.comparison}`
        if (seen.has(key)) continue
        seen.add(key)
        recommendations.push({ ruleId: rule.id, text: rule.recommend(ctx), triggerData: ctx })
      }
    }

    // Overcapacity comparison
    if (me.baseline === 'baseline' && me.comparison === 'overcapacity') {
      const ctx = {
        type:             'overcapacity_comparison',
        label:            me.label,
        peakDensityDelta: me.peakDensityDelta,
        redDurationDelta: me.redDurationDelta,
      }
      for (const rule of RULES) {
        if (!rule.condition(ctx)) continue
        const key = `${rule.id}:overcapacity`
        if (seen.has(key)) continue
        seen.add(key)
        recommendations.push({ ruleId: rule.id, text: rule.recommend(ctx), triggerData: ctx })
      }
    }

    // Focus point comparison (Normal & Surged)
    if (
      (me.baseline === 'baseline' && (me.comparison === 'focus_normal' || me.comparison === 'focus_surged')) ||
      (me.baseline === 'focus_normal' && me.comparison === 'focus_surged')
    ) {
      const ctx = {
        type:             'focus_comparison',
        label:            me.label,
        baseline:         me.baseline,
        comparison:       me.comparison,
        peakDensityDelta: me.peakDensityDelta,
        redDurationDelta: me.redDurationDelta,
      }
      for (const rule of RULES) {
        if (!rule.condition(ctx)) continue
        const key = `${rule.id}:${me.baseline}:${me.comparison}`
        if (seen.has(key)) continue
        seen.add(key)
        recommendations.push({ ruleId: rule.id, text: rule.recommend(ctx), triggerData: ctx })
      }
    }

    // Panic comparison
    if (me.baseline === 'baseline' && me.comparison === 'panic_midway') {
      const ctx = {
        type:             'panic_comparison',
        label:            me.label,
        peakDensityDelta: me.peakDensityDelta,
        redDurationDelta: me.redDurationDelta,
      }
      for (const rule of RULES) {
        if (!rule.condition(ctx)) continue
        const key = `${rule.id}:panic`
        if (seen.has(key)) continue
        seen.add(key)
        recommendations.push({ ruleId: rule.id, text: rule.recommend(ctx), triggerData: ctx })
      }
    }
  }

  return recommendations
}
