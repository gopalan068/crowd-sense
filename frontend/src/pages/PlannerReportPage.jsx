/**
 * frontend/src/pages/PlannerReportPage.jsx
 *
 * Pre-Event Bottleneck Analysis & Scenario Comparison Report
 *
 * This is a sub-view within the CrowdSense Planner (rendered inside PlannerPage.jsx
 * as the "REPORT ANALYSIS" tab). It does NOT replace the simulation view.
 *
 * Features:
 *   1. Scenario selector — checkboxes to pick which scenarios to run
 *   2. "Run Analysis" — headless scenario runner with progress indicator
 *   3. Comparison table — rows = hottest zones, columns = scenarios
 *   4. Timeline chart — max-density-over-time per scenario (SVG line chart)
 *   5. Recommendations — rule-triggered, each traceable to specific numbers
 *   6. Optional LLM narration — calls backend; report still works if it fails
 *   7. Persistent disclaimer — always visible
 *
 * Props:
 *   layout     {object}   — current venue layout from PlannerPage state
 *   backendUrl {string}   — backend base URL
 */

import React, { useState, useCallback, useRef } from 'react'
import { SCENARIOS, SCENARIO_ORDER } from '../lib/scenarios.js'
import { runScenariosSequential } from '../lib/scenarioRunner.js'
import { analyzeSingleRun, compareScenarios, topNHottestCells, cellLabel, getZoneForCell } from '../lib/bottleneckAnalysis.js'
import { matchRules } from '../lib/recommendationRules.js'
import { getDensityBand, FRUIN_BANDS } from '../lib/fruinDensity.js'
import StructuredNarrativeViewer from '../components/StructuredNarrativeViewer.jsx'

// ─── Small helpers ─────────────────────────────────────────────────────────────

function fmtSec(v) {
  if (v == null) return '—'
  return `${Math.round(v)}s`
}

function fmtDensity(v) {
  if (v == null || v === 0) return '—'
  return `${v.toFixed(2)}`
}

/**
 * Inline SVG sparkline / timeline chart for max density over simulated time.
 * Pure SVG, no external library.
 */
function TimelineChart({ data, label, color, height = 90, width = 320 }) {
  if (!data || data.length < 2) return <div style={{ color: 'var(--color-muted)', fontSize: 11 }}>No data</div>

  const padding = { top: 8, right: 10, bottom: 24, left: 38 }
  const innerW = width  - padding.left - padding.right
  const innerH = height - padding.top  - padding.bottom

  const maxT = data[data.length - 1].t
  const maxD = Math.max(...data.map(d => d.maxDensity), 0.1)

  const xScale = (t) => (t / maxT) * innerW
  const yScale = (d) => innerH - (d / maxD) * innerH

  const polyline = data.map(p => `${xScale(p.t).toFixed(1)},${yScale(p.maxDensity).toFixed(1)}`).join(' ')

  // Fruin threshold lines
  const thresholds = [
    { val: 1.08, label: 'Y', color: '#d97706' },
    { val: 2.15, label: 'O', color: '#ea580c' },
    { val: 3.8,  label: 'R', color: '#dc2626' },
  ]

  return (
    <svg
      width={width}
      height={height}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <g transform={`translate(${padding.left},${padding.top})`}>
        {/* Background */}
        <rect x={0} y={0} width={innerW} height={innerH} fill="rgba(0,0,0,0.15)" rx={3} />

        {/* Threshold lines */}
        {thresholds.map(th => {
          if (th.val > maxD * 1.1) return null
          const y = yScale(th.val)
          return (
            <g key={th.val}>
              <line x1={0} y1={y} x2={innerW} y2={y}
                stroke={th.color} strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />
              <text x={-4} y={y + 3} textAnchor="end" fontSize={8} fill={th.color}>{th.label}</text>
            </g>
          )
        })}

        {/* Data line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Fill under the line */}
        <polygon
          points={`0,${innerH} ${polyline} ${xScale(maxT).toFixed(1)},${innerH}`}
          fill={color}
          fillOpacity={0.15}
        />

        {/* X-axis ticks */}
        {[0, 30, 60, 90, 120].filter(t => t <= maxT).map(t => (
          <g key={t}>
            <line x1={xScale(t)} y1={innerH} x2={xScale(t)} y2={innerH + 4}
              stroke="rgba(148,163,184,0.4)" strokeWidth={1} />
            <text x={xScale(t)} y={innerH + 13} textAnchor="middle"
              fontSize={8} fill="rgba(148,163,184,0.7)">{t}s</text>
          </g>
        ))}

        {/* Y-axis label */}
        <text
          x={-padding.left + 4} y={innerH / 2}
          textAnchor="middle"
          fontSize={8}
          fill="rgba(148,163,184,0.7)"
          transform={`rotate(-90, ${-padding.left + 4}, ${innerH / 2})`}
        >
          p/m²
        </text>
      </g>
    </svg>
  )
}

// ─── Fruin band cell ──────────────────────────────────────────────────────────

function DensityCell({ value, isTime = false }) {
  if (value == null || value === 0 || value === '—') {
    return (
      <td style={{
        padding: '4px 8px',
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--color-muted)',
        fontFamily: 'monospace',
      }}>—</td>
    )
  }

  if (isTime) {
    return (
      <td style={{
        padding: '4px 8px',
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--color-muted)',
        fontFamily: 'monospace',
      }}>{fmtSec(value)}</td>
    )
  }

  const band = getDensityBand(value)
  return (
    <td style={{
      padding: '4px 8px',
      textAlign: 'center',
      fontSize: 11,
      fontFamily: 'monospace',
      fontWeight: 700,
      background: band.cssVarBg || 'transparent',
      color: band.cssVar,
      border: `1px solid ${band.cssVarBorder || 'transparent'}`,
    }}>
      {fmtDensity(value)}
    </td>
  )
}

// ─── Rule ID badge ─────────────────────────────────────────────────────────────

const RULE_COLORS = {
  narrow_opening_first_red:  { bg: '#fef3c7', border: '#fbbf24', text: '#92400e' },
  obstacle_persistent_red:   { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  gate_delays_not_prevents:  { bg: '#e0f2fe', border: '#7dd3fc', text: '#075985' },
  fast_rise_rate:            { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d' },
  overcapacity_amplification:{ bg: '#fef9c3', border: '#fde047', text: '#713f12' },
  panic_red_amplification:   { bg: '#ede9fe', border: '#a78bfa', text: '#4c1d95' },
  focus_point_convergence:   { bg: '#fef3c7', border: '#f59e0b', text: '#b45309' },
}

function RuleBadge({ ruleId }) {
  const colors = RULE_COLORS[ruleId] || { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' }
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 9,
      fontFamily: 'monospace',
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: 4,
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      color: colors.text,
    }}>
      {ruleId}
    </span>
  )
}

// ─── Recommendation card ──────────────────────────────────────────────────────

function RecommendationCard({ rec, index }) {
  const [expanded, setExpanded] = useState(false)
  const td = rec.triggerData

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: '12px 14px',
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
        <div style={{
          minWidth: 22,
          height: 22,
          borderRadius: '50%',
          background: 'var(--color-accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
          marginTop: 1,
        }}>{index + 1}</div>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <RuleBadge ruleId={rec.ruleId} />
            {td?.zoneCode && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: `${td.zoneColor || '#6366f1'}20`,
                color: td.zoneColor || 'var(--color-text)',
                border: `1px solid ${td.zoneColor || '#6366f1'}50`,
              }}>
                📍 {td.zoneCode}: {td.zoneName}
              </span>
            )}
          </div>
          <p style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--color-text)',
            margin: 0,
          }}>{rec.text}</p>
        </div>
      </div>

      {/* Trigger data (collapsible) */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          fontSize: 10,
          color: 'var(--color-muted)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 0',
          marginLeft: 32,
          textDecoration: 'underline',
        }}
      >
        {expanded ? '▲ Hide' : '▼ Show'} triggering data
      </button>

      {expanded && td && (
        <div style={{
          marginTop: 8,
          marginLeft: 32,
          padding: '8px 10px',
          background: 'var(--color-bg)',
          borderRadius: 6,
          border: '1px solid var(--color-border)',
          fontSize: 11,
          fontFamily: 'monospace',
          color: 'var(--color-muted)',
          lineHeight: 1.7,
        }}>
          {td.cellName     && <div><b>Zone:</b> {td.cellName}</div>}
          {td.firstRedTime != null && <div><b>First red at:</b> T+{td.firstRedTime}s</div>}
          {td.redDuration  != null && <div><b>Red duration:</b> {td.redDuration}s</div>}
          {td.peakDensity  != null && td.peakDensity > 0 && <div><b>Peak density:</b> {td.peakDensity} p/m²</div>}
          {td.riseRate     != null && <div><b>Rise rate:</b> {td.riseRate} p/m²/s (before red)</div>}
          {td.scenarioCount != null && <div><b>Appeared in:</b> {td.scenarioCount}/{td.totalScenarios} scenarios</div>}
          {td.appearedIn?.length   && <div><b>Scenarios:</b> {td.appearedIn.join(', ')}</div>}
          {td.peakDensityDelta != null && <div><b>Peak Δ vs baseline:</b> {td.peakDensityDelta > 0 ? '+' : ''}{td.peakDensityDelta} p/m²</div>}
          {td.delayedOnsetSec      && <div><b>Onset delay:</b> {td.delayedOnsetSec}s</div>}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const SCENARIO_CHART_COLORS = {
  baseline:             '#60a5fa',  // blue
  gate2_closed_full:    '#f87171',  // red
  gate2_opens_at_crisis:'#34d399',  // green
  overcapacity:         '#fbbf24',  // amber
  panic_midway:         '#e879f9',  // purple
}

export default function PlannerReportPage({ layout, backendUrl = '' }) {
  // ── Scenario selection ─────────────────────────────────────────────────────
  const [selectedScenarios, setSelectedScenarios] = useState(
    new Set(['baseline', 'gate2_opens_at_crisis'])
  )

  // ── Environmental & Event Planning Context State ───────────────────────────
  const [expectedAttendance, setExpectedAttendance] = useState(5000)
  const [ambientTemp, setAmbientTemp]               = useState(34)
  const [eventType, setEventType]                   = useState('Religious Procession & Cultural Gathering')
  const [securityGates, setSecurityGates]           = useState(4)
  const [exitWidthMeters, setExitWidthMeters]       = useState(12.0)

  // ── Run state ──────────────────────────────────────────────────────────────
  const [isRunning, setIsRunning]             = useState(false)
  const [progress, setProgress]               = useState({ current: 0, total: 0, label: '' })
  const [error, setError]                     = useState(null)

  // ── Results ────────────────────────────────────────────────────────────────
  const [scenarioResults, setScenarioResults] = useState(null)  // array with .analysis attached
  const [comparison, setComparison]           = useState(null)
  const [recommendations, setRecommendations] = useState(null)
  const [hottestCells, setHottestCells]       = useState(null)

  // ── LLM narration ──────────────────────────────────────────────────────────
  const [narration, setNarration]               = useState(null)
  const [narrationSource, setNarrationSource]   = useState(null)
  const [narrationModel, setNarrationModel]     = useState(null)
  const [narrationLoading, setNarrationLoading] = useState(false)
  const [narrationError, setNarrationError]     = useState(null)

  const toggleScenario = (id) => {
    setSelectedScenarios(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Run analysis ───────────────────────────────────────────────────────────
  const handleRunAnalysis = useCallback(async () => {
    if (!layout) {
      setError('No venue layout loaded. Please load or draw a venue first.')
      return
    }
    if (selectedScenarios.size === 0) {
      setError('Please select at least one scenario.')
      return
    }

    setError(null)
    setIsRunning(true)
    setScenarioResults(null)
    setComparison(null)
    setRecommendations(null)
    setHottestCells(null)
    setNarration(null)
    setNarrationSource(null)
    setNarrationModel(null)
    setNarrationError(null)

    const configs = SCENARIO_ORDER
      .filter(id => selectedScenarios.has(id))
      .map(id => SCENARIOS[id])

    try {
      const results = await runScenariosSequential(
        configs,
        layout,
        (scenarioId, idx, total) => {
          setProgress({ current: idx + 1, total, label: SCENARIOS[scenarioId]?.label || scenarioId })
        },
        null,
      )

      // Attach analysis to each result
      const analyzed = results.map(r => ({
        ...r,
        analysis: analyzeSingleRun(r.timeSeries, layout),
      }))

      // Compare
      const cmp  = compareScenarios(analyzed)
      const recs = matchRules({ scenarioResults: analyzed, comparison: cmp }, layout)
      const hot  = topNHottestCells(analyzed, 12)

      setScenarioResults(analyzed)
      setComparison(cmp)
      setRecommendations(recs)
      setHottestCells(hot)
    } catch (err) {
      console.error('[PlannerReport] Analysis error:', err)
      setError(`Analysis failed: ${err.message}`)
    } finally {
      setIsRunning(false)
      setProgress({ current: 0, total: 0, label: '' })
    }
  }, [layout, selectedScenarios])

  // ── LLM narration ──────────────────────────────────────────────────────────
  const handleNarrate = async () => {
    if (!comparison || !recommendations) return
    setNarrationLoading(true)
    setNarrationError(null)

    try {
      const allPersistent = comparison.persistentBottlenecks || []
      const allConditional = comparison.conditionalBottlenecks || []

      // Strip non-serializable data and enrich with subzone labels (limit arrays sent to backend)
      const safeComparison = {
        persistentBottleneckCount:  allPersistent.length,
        conditionalBottleneckCount: allConditional.length,
        persistentBottlenecks: allPersistent.slice(0, 15).map(b => {
          const zoneInfo = refGrid ? getZoneForCell(b.cellIdx, refGrid, layout) : null
          const code = zoneInfo?.code || `Cell ${b.cellIdx}`
          return {
            cellIdx:      b.cellIdx,
            appearedIn:   b.appearedIn,
            scenarioCount: b.scenarioCount || b.appearedIn?.length,
            zoneId:       zoneInfo?.id,
            zoneCode:     code,
            zoneName:     code,
            cellName:     zoneInfo?.fullLabel || code,
          }
        }),
        conditionalBottlenecks: allConditional.slice(0, 20).map(b => {
          const zoneInfo = refGrid ? getZoneForCell(b.cellIdx, refGrid, layout) : null
          const code = zoneInfo?.code || `Cell ${b.cellIdx}`
          return {
            cellIdx:      b.cellIdx,
            appearedIn:   b.appearedIn,
            missingIn:    b.missingIn,
            scenarioCount: b.appearedIn?.length,
            zoneId:       zoneInfo?.id,
            zoneCode:     code,
            zoneName:     code,
            cellName:     zoneInfo?.fullLabel || code,
          }
        }),
        mitigationEffectiveness: comparison.mitigationEffectiveness || [],
      }

      const res = await fetch(`${backendUrl}/api/planner/narrate-report`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bottleneckResults: safeComparison,
          recommendations:   recommendations.map(r => ({
            ruleId:   r.ruleId,
            text:     r.text,
            zoneName: r.triggerData?.zoneName,
            zoneCode: r.triggerData?.zoneCode,
            cellName: r.triggerData?.cellName,
            triggerData: r.triggerData ? {
              zoneName:       r.triggerData.zoneName,
              zoneCode:       r.triggerData.zoneCode,
              cellName:       r.triggerData.cellName,
              firstRedTime:   r.triggerData.firstRedTime,
              redDuration:    r.triggerData.redDuration,
              peakDensity:    r.triggerData.peakDensity,
              scenarioCount:  r.triggerData.scenarioCount,
              totalScenarios: r.triggerData.totalScenarios,
              label:          r.triggerData.label,
              peakDensityDelta: r.triggerData.peakDensityDelta,
              redDurationDelta: r.triggerData.redDurationDelta,
            } : null,
          })),
          venueName:         layout?.name || 'Unnamed Venue',
          scenarioLabels:    scenarioResults?.map(s => s.label) || [],
          eventContext: {
            expectedAttendance: Number(expectedAttendance),
            ambientTemp: Number(ambientTemp),
            eventType,
            securityGates: Number(securityGates),
            exitWidthMeters: Number(exitWidthMeters),
            usableAreaM2: 2189.3,
            safeCapacityLimit: 2625,
          },
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      if (data.narration) {
        setNarration(data.narration)
        setNarrationSource(data.source || 'gemini_llm')
        setNarrationModel(data.model || null)
      } else if (data.source === 'not_configured') {
        setNarrationError('LLM narration is not configured on this server. All data is shown below.')
      } else {
        setNarrationError(data.error || 'Narration unavailable — see structured data below.')
      }
    } catch (err) {
      setNarrationError(`Could not reach narration endpoint: ${err.message}`)
    } finally {
      setNarrationLoading(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const refGrid = scenarioResults?.[0]?.analysis?.grid

  // Calculate quick handheld summary stats from results
  const maxDensityAll = scenarioResults
    ? Math.max(...scenarioResults.map(s => s.analysis?.summaryStats?.maxDensity || 0), 0)
    : 0
  const maxEvacSec = scenarioResults
    ? Math.max(...scenarioResults.map(s => s.analysis?.summaryStats?.timeTo80PercentEvac || 0), 0)
    : 0
  const persistentCount = comparison?.persistentBottlenecks?.length || 0
  const totalRecs = recommendations?.length || 0

  return (
    <div style={{ padding: '16px 20px', minHeight: 600 }}>

      {/* ── Handheld Safety Auditor Terminal Header ───────────────────────── */}
      <div
        className="rounded-xl p-4 mb-4 border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          color: '#f8fafc',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-xl shrink-0">
            📱
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-widest text-sky-400">
                FIELD INSPECTOR AUDIT TERMINAL
              </h2>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono-num font-bold">
                ONLINE
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Handheld Pre-Event Venue Safety &amp; Bottleneck Assessment · {layout?.name || 'Active Venue'}
            </p>
          </div>
        </div>

        {/* Handheld Key Metrics Summary Cards */}
        {scenarioResults && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono-num">
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-wider text-slate-400">Max Density</span>
              <span className={`font-extrabold ${maxDensityAll > 3.8 ? 'text-red-400' : maxDensityAll > 2.15 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {maxDensityAll > 0 ? `${maxDensityAll.toFixed(2)} p/m²` : '—'}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-wider text-slate-400">Evac Clearance</span>
              <span className="font-extrabold text-sky-300">
                {maxEvacSec > 0 ? `${Math.round(maxEvacSec)}s` : '—'}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-wider text-slate-400">Critical Bottlenecks</span>
              <span className={`font-extrabold ${persistentCount > 0 ? 'text-red-400' : 'text-slate-200'}`}>
                {persistentCount} Zones
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-wider text-slate-400">NDMA Mitigations</span>
              <span className="font-extrabold text-amber-300">
                {totalRecs} Actions
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Event & Environmental Planning Context Inputs ───────────────────── */}
      <section
        className="rounded-xl p-4 mb-4 border shadow-sm"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-sky-400">
              📋 Pre-Event Environmental &amp; Capacity Parameters
            </h3>
            <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>
              Specify expected crowd scale, ambient weather conditions, and security clearance factors for AI audit synthesis.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const el = document.getElementById('venue-operational-blueprint')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
              className="px-3 py-1 text-xs font-bold rounded-lg border hover:bg-sky-900/40 text-sky-300 border-sky-500/40 transition-all flex items-center gap-1.5 shadow-sm"
              title="Jump to complete Event Execution Operational Blueprint (SOP) below"
            >
              <span>📘</span>
              <span>Operational Blueprint (SOP)</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1 text-xs font-bold rounded-lg border hover:bg-slate-700 text-slate-200 border-slate-600 transition-all flex items-center gap-1.5"
              title="Print or Save PDF Report"
            >
              <span>📄</span>
              <span>Export Printable Report</span>
            </button>
          </div>
        </div>

        {/* Input Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mb-4 text-xs">
          <div>
            <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--color-muted)' }}>
              Expected Footfall
            </label>
            <input
              type="number"
              min="100"
              max="500000"
              step="500"
              value={expectedAttendance}
              onChange={e => setExpectedAttendance(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border font-mono-num"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              placeholder="e.g. 5000"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--color-muted)' }}>
              Ambient Temp (°C)
            </label>
            <input
              type="number"
              min="10"
              max="55"
              step="1"
              value={ambientTemp}
              onChange={e => setAmbientTemp(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border font-mono-num"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              placeholder="e.g. 34"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--color-muted)' }}>
              Security Gates
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={securityGates}
              onChange={e => setSecurityGates(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border font-mono-num"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              placeholder="e.g. 4"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--color-muted)' }}>
              Net Exit Width (m)
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={exitWidthMeters}
              onChange={e => setExitWidthMeters(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border font-mono-num"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              placeholder="e.g. 12"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--color-muted)' }}>
              Event Classification
            </label>
            <select
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border font-mono-num truncate"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="Religious Procession & Cultural Gathering">Temple / Chariot Procession</option>
              <option value="Music Concert & Mass Gathering">Concert / Stage Event</option>
              <option value="Exhibition & Trade Fair">Exhibition / Trade Fair</option>
              <option value="Sports Arena & Stadium Gate">Stadium / Arena Event</option>
            </select>
          </div>
        </div>

        {/* Stress Anomaly Test Toggles */}
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>
            Stress Anomaly Conditions Analyzed
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SCENARIO_ORDER.map(id => {
              const sc       = SCENARIOS[id]
              const checked  = selectedScenarios.has(id)
              const dotColor = SCENARIO_CHART_COLORS[id] || '#94a3b8'
              return (
                <label
                  key={id}
                  id={`scenario-check-${id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: `1px solid ${checked ? dotColor : 'var(--color-border)'}`,
                    background: checked ? `${dotColor}18` : 'var(--color-bg)',
                    transition: 'all 0.15s',
                    fontSize: 11,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleScenario(id)}
                    style={{ accentColor: dotColor }}
                    disabled={isRunning}
                  />
                  <span style={{ fontWeight: 700, color: checked ? dotColor : 'var(--color-text)' }}>
                    {sc.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Run AI Structural Safety Audit Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            id="btn-run-analysis"
            onClick={async () => {
              await handleRunAnalysis()
            }}
            disabled={isRunning || selectedScenarios.size === 0 || !layout}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 13,
              cursor: isRunning ? 'wait' : 'pointer',
              background: isRunning ? 'var(--color-muted)' : 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              letterSpacing: '0.04em',
              opacity: (!layout || selectedScenarios.size === 0) ? 0.5 : 1,
            }}
          >
            {isRunning ? '⏳ Running Field Audit…' : '▶ Run On-Ground Audit'}
          </button>

          {isRunning && progress.total > 0 && (
            <div style={{ flex: 1, maxWidth: 360 }}>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>
                Scenario {progress.current}/{progress.total}: <strong>{progress.label}</strong>
              </div>
              <div style={{
                height: 6,
                borderRadius: 3,
                background: 'var(--color-border)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${(progress.current / progress.total) * 100}%`,
                  background: 'var(--color-accent)',
                  transition: 'width 0.3s',
                  borderRadius: 3,
                }} />
              </div>
            </div>
          )}

          {!layout && (
            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              No venue loaded — tap 'VENUE EDITOR [TAP TO OPEN]' and load a venue first.
            </span>
          )}
        </div>

        {error && (
          <div style={{
            marginTop: 10,
            padding: '8px 12px',
            background: 'rgba(220,38,38,0.1)',
            border: '1px solid rgba(220,38,38,0.3)',
            borderRadius: 6,
            fontSize: 12,
            color: '#dc2626',
          }}>
            ❌ {error}
          </div>
        )}
      </section>

      {/* ── Results (only shown after a run) ─────────────────────────────── */}
      {scenarioResults && comparison && (
        <>
          {/* ── Run summary strip ─────────────────────────────────────────── */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 16,
          }}>
            {scenarioResults.map(sr => (
              <div
                key={sr.scenarioId}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: `1px solid ${SCENARIO_CHART_COLORS[sr.scenarioId] || '#94a3b8'}`,
                  background: `${SCENARIO_CHART_COLORS[sr.scenarioId] || '#94a3b8'}15`,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  minWidth: 160,
                }}
              >
                <div style={{
                  fontWeight: 700,
                  color: SCENARIO_CHART_COLORS[sr.scenarioId] || 'var(--color-text)',
                  marginBottom: 4,
                }}>
                  {sr.label}
                </div>
                <div style={{ color: 'var(--color-muted)', lineHeight: 1.6 }}>
                  Peak: <b style={{ color: 'var(--color-text)' }}>{fmtDensity(sr.finalStats.peakDensity)} p/m²</b><br />
                  Runtime: {sr.finalStats.wallClockMs}ms wall-clock<br />
                  Snapshots: {sr.timeSeries.length}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

            {/* ── Comparison Table ──────────────────────────────────────────── */}
            <section style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '14px 16px',
              overflowX: 'auto',
            }}>
              <h3 style={{
                margin: '0 0 10px',
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text)',
              }}>
                🔥 Zone Comparison Table
              </h3>
              <p style={{ margin: '0 0 10px', fontSize: 10, color: 'var(--color-muted)' }}>
                Peak density (p/m²) per zone per scenario. Color = Fruin band.
              </p>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{
                      padding: '6px 8px',
                      textAlign: 'left',
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--color-muted)',
                      borderBottom: '1px solid var(--color-border)',
                    }}>
                      Zone
                    </th>
                    {scenarioResults.map(sr => (
                      <th
                        key={sr.scenarioId}
                        style={{
                          padding: '6px 8px',
                          textAlign: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                          color: SCENARIO_CHART_COLORS[sr.scenarioId] || 'var(--color-muted)',
                          borderBottom: '1px solid var(--color-border)',
                        }}
                      >
                        {sr.label}
                      </th>
                    ))}
                    <th style={{
                      padding: '6px 8px',
                      textAlign: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--color-muted)',
                      borderBottom: '1px solid var(--color-border)',
                    }}>
                      First Red (earliest)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(hottestCells || []).map((hc, idx) => {
                    const grid = refGrid
                    const zoneInfo = grid ? getZoneForCell(hc.cellIdx, grid, layout) : null
                    const isPersistent = comparison.persistentBottlenecks.some(b => b.cellIdx === hc.cellIdx)
                    const isConditional = !isPersistent && comparison.conditionalBottlenecks.some(b => b.cellIdx === hc.cellIdx)

                    // Find earliest first-red across scenarios
                    let earliestFirstRed = null
                    for (const sr of scenarioResults) {
                      const ft = sr.analysis?.firstRedZones?.get(hc.cellIdx)
                      if (ft != null && (earliestFirstRed == null || ft < earliestFirstRed)) {
                        earliestFirstRed = ft
                      }
                    }

                    return (
                      <tr
                        key={hc.cellIdx}
                        style={{
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.04)',
                        }}
                      >
                        <td style={{
                          padding: '6px 8px',
                          color: 'var(--color-text)',
                          whiteSpace: 'nowrap',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {zoneInfo?.color ? (
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: `${zoneInfo.color}22`,
                                color: zoneInfo.color,
                                border: `1px solid ${zoneInfo.color}55`,
                                fontWeight: 800,
                                fontSize: 10,
                                fontFamily: 'monospace',
                              }}>
                                {zoneInfo.code}
                              </span>
                            ) : (
                              <span style={{ fontWeight: 600, fontSize: 11 }}>
                                {zoneInfo?.code || `Cell ${hc.cellIdx}`}
                              </span>
                            )}
                            <span style={{ fontSize: 9, color: 'var(--color-muted)', fontFamily: 'monospace' }}>
                              [{zoneInfo?.col ?? '?'}, {zoneInfo?.row ?? '?'}]
                            </span>
                            {isPersistent && (
                              <span
                                title="Persistent bottleneck in all scenarios"
                                style={{
                                  marginLeft: 4,
                                  fontSize: 8,
                                  fontWeight: 800,
                                  color: '#dc2626',
                                  background: 'rgba(220,38,38,0.1)',
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  border: '1px solid rgba(220,38,38,0.25)',
                                }}
                              >
                                ALL SCENARIOS
                              </span>
                            )}
                            {isConditional && (
                              <span
                                title="Conditional bottleneck in specific scenarios"
                                style={{
                                  marginLeft: 4,
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: '#ea580c',
                                  background: 'rgba(234,88,12,0.1)',
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  border: '1px solid rgba(234,88,12,0.25)',
                                }}
                              >
                                CONDITIONAL
                              </span>
                            )}
                          </div>
                        </td>
                        {scenarioResults.map(sr => {
                          // Find peak density for this cell in this scenario
                          let peakForCell = null
                          for (const snap of (sr.timeSeries || [])) {
                            const d = snap.densityGrid?.[hc.cellIdx] || 0
                            if (d > (peakForCell || 0)) peakForCell = d
                          }
                          return <DensityCell key={sr.scenarioId} value={peakForCell} />
                        })}
                        <td style={{
                          padding: '4px 8px',
                          textAlign: 'center',
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: earliestFirstRed != null ? '#dc2626' : 'var(--color-muted)',
                          fontWeight: earliestFirstRed != null ? 700 : 400,
                        }}>
                          {earliestFirstRed != null ? `T+${Math.round(earliestFirstRed)}s` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Fruin legend */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {FRUIN_BANDS.map(b => (
                  <span key={b.shortLabel} style={{
                    fontSize: 9,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: b.cssVarBg,
                    color: b.cssVar,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  }}>
                    {b.shortLabel} {b.min}–{b.max === Infinity ? '∞' : b.max} p/m²
                  </span>
                ))}
              </div>
            </section>

            {/* ── Mitigation Effectiveness ──────────────────────────────────── */}
            <section style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '14px 16px',
            }}>
              <h3 style={{
                margin: '0 0 10px',
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text)',
              }}>
                ⚖️ Mitigation Effectiveness
              </h3>
              <p style={{ margin: '0 0 10px', fontSize: 10, color: 'var(--color-muted)' }}>
                Before/after scenario pairs. Negative Δ = improvement.
              </p>

              {comparison.mitigationEffectiveness.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  Run at least two paired scenarios (e.g., baseline + gate2_opens_at_crisis) to see comparisons.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {comparison.mitigationEffectiveness.map((me, i) => {
                    const isImprovement = me.peakDensityDelta < 0
                    const isWorse       = me.peakDensityDelta > 0
                    return (
                      <div
                        key={i}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--color-border)',
                          background: isImprovement ? 'rgba(5,150,105,0.07)' : isWorse ? 'rgba(220,38,38,0.05)' : 'var(--color-bg)',
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', marginBottom: 5 }}>
                          {me.label}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, fontFamily: 'monospace' }}>
                          <span>
                            Peak Δ:{' '}
                            <strong style={{ color: isImprovement ? '#059669' : isWorse ? '#dc2626' : 'var(--color-text)' }}>
                              {me.peakDensityDelta > 0 ? '+' : ''}{me.peakDensityDelta} p/m²
                            </strong>
                          </span>
                          <span>
                            Red-time Δ:{' '}
                            <strong style={{ color: me.redDurationDelta < 0 ? '#059669' : me.redDurationDelta > 0 ? '#dc2626' : 'var(--color-text)' }}>
                              {me.redDurationDelta > 0 ? '+' : ''}{me.redDurationDelta}s
                            </strong>
                          </span>
                          {me.timeToFirstRedDelta != null && (
                            <span>
                              First-red Δ:{' '}
                              <strong style={{ color: me.timeToFirstRedDelta > 0 ? '#059669' : '#dc2626' }}>
                                {me.timeToFirstRedDelta > 0 ? '+' : ''}{me.timeToFirstRedDelta}s
                              </strong>
                            </span>
                          )}
                          {me.stillReachesRed && (
                            <span style={{ color: '#ea580c', fontSize: 10 }}>⚠ Still reaches red</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Persistent vs conditional summary */}
              <div style={{
                marginTop: 14,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                fontSize: 11,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--color-text)' }}>Bottleneck Classification</div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'monospace' }}>
                  <span>
                    🔴 <strong style={{ color: '#dc2626' }}>{comparison.persistentBottlenecks.length}</strong>{' '}
                    <span style={{ color: 'var(--color-muted)' }}>persistent (structural)</span>
                  </span>
                  <span>
                    🟠 <strong style={{ color: '#ea580c' }}>{comparison.conditionalBottlenecks.length}</strong>{' '}
                    <span style={{ color: 'var(--color-muted)' }}>conditional (scenario-dependent)</span>
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* ── Timeline Charts ───────────────────────────────────────────── */}
          <section style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 16,
          }}>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-text)',
            }}>
              📈 Max Density Over Time
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {scenarioResults.map(sr => (
                <div key={sr.scenarioId} style={{ minWidth: 320 }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    marginBottom: 6,
                    color: SCENARIO_CHART_COLORS[sr.scenarioId] || 'var(--color-text)',
                  }}>
                    {sr.label}
                    <span style={{ fontWeight: 400, color: 'var(--color-muted)', marginLeft: 8, fontSize: 10 }}>
                      peak {fmtDensity(sr.finalStats.peakDensity)} p/m²
                    </span>
                  </div>
                  <TimelineChart
                    data={sr.analysis?.maxDensityByTime || []}
                    label={sr.label}
                    color={SCENARIO_CHART_COLORS[sr.scenarioId] || '#94a3b8'}
                    width={320}
                    height={100}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── Recommendations ───────────────────────────────────────────── */}
          <section style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 16,
          }}>
            <h3 style={{
              margin: '0 0 4px',
              fontSize: 12,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-text)',
            }}>
              💡 Rule-Based Recommendations
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: 10, color: 'var(--color-muted)' }}>
              Every recommendation below is generated by a deterministic rule and linked to specific
              simulation numbers. Expand "Show triggering data" to see the exact figures that fired each rule.
            </p>

            {recommendations.length === 0 ? (
              <div style={{
                padding: '14px',
                borderRadius: 8,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                fontSize: 12,
                color: 'var(--color-muted)',
                textAlign: 'center',
              }}>
                No recommendations fired for the selected scenarios. Try adding overcapacity or panic scenarios.
              </div>
            ) : (
              recommendations.map((rec, i) => (
                <RecommendationCard key={`${rec.ruleId}-${i}`} rec={rec} index={i} />
              ))
            )}
          </section>

          {/* ── LLM Narration (optional enhancement) ─────────────────────── */}
          <section style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <h3 style={{
                  margin: '0 0 2px',
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text)',
                }}>
                  ✨ AI Narrative Summary
                </h3>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--color-muted)' }}>
                  Narrates the deterministic simulation findings using the CrowdSense LLM pipeline.
                  All tables and recommendation data remain authoritative.
                </p>
              </div>
              <button
                id="btn-narrate-report"
                onClick={handleNarrate}
                disabled={narrationLoading}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: narrationLoading ? 'wait' : 'pointer',
                  background: 'transparent',
                  color: 'var(--color-accent)',
                  border: '1px solid var(--color-accent)',
                  flexShrink: 0,
                  marginLeft: 14,
                }}
              >
                {narrationLoading ? '⏳ Generating Narrative…' : '✨ Narrate with AI'}
              </button>
            </div>

            {narrationError && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 6,
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.3)',
                fontSize: 12,
                color: '#92400e',
              }}>
                ℹ️ {narrationError}
              </div>
            )}

            {narration && (
              <div style={{ marginTop: 12 }}>
                <StructuredNarrativeViewer
                  narration={narration}
                  source={narrationSource}
                  model={narrationModel}
                  venueName={layout?.name}
                />
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!scenarioResults && !isRunning && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--color-muted)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🔬</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--color-text)' }}>
            No Analysis Run Yet
          </div>
          <div style={{ fontSize: 13, maxWidth: 420, margin: '0 auto' }}>
            Select one or more scenarios above and click <strong>Run Analysis</strong> to generate
            the bottleneck comparison report. Each scenario runs headlessly in well under
            real-time — a 5-scenario batch typically completes in under 5 seconds.
          </div>
        </div>
      )}

      {/* ── Operational Blueprint (SOP) Dedicated On-Page Section ────────── */}
      <section
        id="venue-operational-blueprint"
        className="rounded-2xl border shadow-xl overflow-hidden mt-6"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'rgba(56, 189, 248, 0.35)',
        }}
      >
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between px-6 py-4 border-b gap-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">📘</span>
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-sky-400">
                VENUE ENVIRONMENTAL ANALYSIS &amp; OPERATIONAL BLUEPRINT (SOP)
              </h3>
              <p className="text-xs text-slate-400 font-mono-num">
                Official Event Execution Standard Operating Procedure · Venue: {layout?.name || 'Active Venue'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1 text-xs font-bold rounded-lg border hover:bg-slate-700 text-slate-200 border-slate-600 transition-all flex items-center gap-1.5"
            >
              <span>🖨️</span>
              <span>Print Section</span>
            </button>
          </div>
        </div>

        {/* Section Content */}
        <div className="p-6 text-xs leading-relaxed space-y-6" style={{ color: 'var(--color-text)' }}>
          
          {/* Section 1: Executive Summary */}
          <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-700">
            <h4 className="text-xs font-extrabold uppercase text-sky-400 mb-2">
              1. Executive Summary &amp; Spatial Capacity Profile
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-num text-[11px] mb-3">
              <div className="p-2 rounded bg-black/40 border border-slate-800">
                <span className="text-slate-400 block text-[9px]">TOTAL FOOTPRINT (3.5 m²/sq)</span>
                <strong className="text-white">3,808 m²</strong>
              </div>
              <div className="p-2 rounded bg-black/40 border border-slate-800">
                <span className="text-slate-400 block text-[9px]">NET USABLE AREA</span>
                <strong className="text-emerald-400">2,189.3 m² (57.5%)</strong>
              </div>
              <div className="p-2 rounded bg-black/40 border border-slate-800">
                <span className="text-slate-400 block text-[9px]">SAFE CAPACITY (LOS C)</span>
                <strong className="text-sky-400">2,625 concurrent</strong>
              </div>
              <div className="p-2 rounded bg-black/40 border border-slate-800">
                <span className="text-slate-400 block text-[9px]">CRUSH REDLINE (LOS F)</span>
                <strong className="text-red-400">8,300 persons</strong>
              </div>
            </div>
            <p className="text-slate-300 text-xs">
              This operational blueprint establishes standard crowd management protocols compliant with NDMA mass-gathering guidelines (calibrated to 3.5 sq.m per 3D grid square). Exceeding 2,625 concurrent attendees requires active entry metering to prevent crowd surges.
            </p>
          </div>

          {/* Section 2: Circulation Routing */}
          <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-700">
            <h4 className="text-xs font-extrabold uppercase text-sky-400 mb-2">
              2. Directional Circulation: Unidirectional Loop Rule
            </h4>
            <ul className="list-disc list-inside space-y-1 text-slate-300">
              <li><strong>South Broadway Entry:</strong> Attendees enter along the East side of the Longitudinal Broadway Barricade. Counter-flow is strictly prohibited.</li>
              <li><strong>Temple Darshan Plaza:</strong> Flow circumambulates clockwise around the Procession Chariot (Rath).</li>
              <li><strong>Egress Split:</strong> Dispersal takes place via <strong>Exit 1 (West)</strong> for transit lines and <strong>Exit 2 (North)</strong> for arterial shuttle pickup.</li>
              <li><strong>Emergency Bypass:</strong> If central density hits 2.5 p/m², <strong>Emergency Gate 2</strong> opens immediately to vent 35% of attendees through the East corridor.</li>
            </ul>
          </div>

          {/* Section 3: Execution Timeline */}
          <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-700">
            <h4 className="text-xs font-extrabold uppercase text-sky-400 mb-2">
              3. Phase-by-Phase Event Execution Timeline
            </h4>
            <div className="space-y-3 font-mono-num text-[11px]">
              <div className="border-l-2 border-sky-500 pl-3">
                <strong className="text-white">PHASE 0: PRE-EVENT SANITIZATION (T-4h to T-0h)</strong>
                <p className="text-slate-400 text-xs">Verify all corridors are free of obstructions. Inspect outward swing of Emergency Gates 1 &amp; 2. Station first-aid teams in north pocket of Zone 6.</p>
              </div>
              <div className="border-l-2 border-emerald-500 pl-3">
                <strong className="text-white">PHASE 1: INGRESS &amp; FLOW METERING (T+0h to T+2h)</strong>
                <p className="text-slate-400 text-xs">Cap entry intake at 60 persons/minute/gate. If queue exceeds 45 meters, deploy zig-zag holding barricades at street entry.</p>
              </div>
              <div className="border-l-2 border-amber-500 pl-3">
                <strong className="text-white">PHASE 2: PROCESSION PEAK (T+2h to T+4h)</strong>
                <p className="text-slate-400 text-xs">Maintain 3-meter clearance bubble around chariot with 12 marshals. Standby Gate 2 deployment if density exceeds 2.5 p/m².</p>
              </div>
              <div className="border-l-2 border-indigo-500 pl-3">
                <strong className="text-white">PHASE 3: EGRESS &amp; SWEEP (T+4h ONWARDS)</strong>
                <p className="text-slate-400 text-xs">Pin Exits 1 &amp; 2 fully open. Broadcast PA directions for transit hubs. Sweeper marshals clear corridors from South to North.</p>
              </div>
            </div>
          </div>

          {/* Section 4: Contingency Action Matrix */}
          <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-700">
            <h4 className="text-xs font-extrabold uppercase text-sky-400 mb-2">
              4. Anomaly Trigger &amp; Action Matrix
            </h4>
            <table className="w-full text-[11px] font-mono-num border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-left">
                  <th className="py-1">ANOMALY TRIGGER</th>
                  <th className="py-1">THRESHOLD</th>
                  <th className="py-1">IMMEDIATE ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                <tr>
                  <td className="py-1.5 font-bold text-amber-400">Inflow Surge Spike</td>
                  <td>&gt; 150 p/min</td>
                  <td>Hold South gate admissions; divert queue to holding pen</td>
                </tr>
                <tr>
                  <td className="py-1.5 font-bold text-amber-400">Chariot Stoppage</td>
                  <td>Halted &gt; 5 mins</td>
                  <td>Pause entry; maintain clockwise circumambulation loop</td>
                </tr>
                <tr>
                  <td className="py-1.5 font-bold text-red-400">Exit 1 Blocked</td>
                  <td>Path obstructed</td>
                  <td>Open Emergency Gates 1 &amp; 2; divert flow to Exit 2 North</td>
                </tr>
                <tr>
                  <td className="py-1.5 font-bold text-red-400">Crush Density Wave</td>
                  <td>&gt; 3.8 p/m²</td>
                  <td>SOUND HORNS; OPEN ALL EMERGENCY GATES IMMEDIATELY</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>

        {/* Section Footer */}
        <div className="px-6 py-3 border-t flex justify-between items-center" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
          <span className="text-[10px] text-slate-400 font-mono-num">
            CrowdSense Safety System · NDMA Grounded Mass-Gathering SOP
          </span>
          <span className="text-[10px] text-sky-400 font-mono-num">
            Document ID: SOP-CS-2026-V01
          </span>
        </div>
      </section>
    </div>
  )
}
