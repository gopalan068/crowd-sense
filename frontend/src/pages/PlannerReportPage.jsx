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
import { analyzeSingleRun, compareScenarios, topNHottestCells, cellLabel } from '../lib/bottleneckAnalysis.js'
import { matchRules } from '../lib/recommendationRules.js'
import { getDensityBand, FRUIN_BANDS } from '../lib/fruinDensity.js'

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
          <div style={{ marginBottom: 5 }}>
            <RuleBadge ruleId={rec.ruleId} />
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
      // Strip non-serializable data (Float32Array densityGrids) before sending
      const safeComparison = {
        persistentBottlenecks:  comparison.persistentBottlenecks,
        conditionalBottlenecks: comparison.conditionalBottlenecks,
        mitigationEffectiveness: comparison.mitigationEffectiveness,
      }

      const res = await fetch(`${backendUrl}/api/planner/narrate-report`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bottleneckResults: safeComparison,
          recommendations:   recommendations.map(r => ({ ruleId: r.ruleId, text: r.text })),
          venueName:         layout?.name || 'Unnamed Venue',
          scenarioLabels:    scenarioResults?.map(s => s.label) || [],
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

  return (
    <div style={{ padding: '16px 20px', minHeight: 600 }}>

      {/* ── Persistent Disclaimer ────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(251,191,36,0.10)',
        border: '1px solid rgba(251,191,36,0.35)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 18,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.55, color: 'var(--color-text)' }}>
          <strong>Planning Aid — Not a Certified Risk Assessment.</strong>{' '}
          Findings and recommendations are generated from simplified crowd-physics simulation
          under stated assumptions, cross-referenced against established crowd-safety mitigation practices.
          Scenarios use the Social Force Model (Helbing &amp; Molnár, 1995) with parameters that are{' '}
          <em>not</em> empirically calibrated for this specific venue. Treat all outputs as planning
          inputs requiring expert review — not as engineering certification.
        </p>
      </div>

      {/* ── Scenario Selector ─────────────────────────────────────────────── */}
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
          🔬 Scenario Configuration
        </h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
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
                  alignItems: 'flex-start',
                  gap: 8,
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${checked ? dotColor : 'var(--color-border)'}`,
                  background: checked ? `${dotColor}18` : 'var(--color-bg)',
                  transition: 'all 0.15s',
                  maxWidth: 220,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleScenario(id)}
                  style={{ marginTop: 2, accentColor: dotColor }}
                  disabled={isRunning}
                />
                <div>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: checked ? dotColor : 'var(--color-text)',
                    marginBottom: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                    {sc.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)', lineHeight: 1.4 }}>
                    {sc.description.slice(0, 80)}{sc.description.length > 80 ? '…' : ''}
                  </div>
                </div>
              </label>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            id="btn-run-analysis"
            onClick={handleRunAnalysis}
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
            {isRunning ? '⏳ Running…' : '▶ Run Analysis'}
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
              No venue loaded — open the SIM tab and load a venue first.
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
                    const label = grid ? cellLabel(hc.cellIdx, grid) : `Cell ${hc.cellIdx}`
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
                          padding: '4px 8px',
                          fontSize: 10,
                          fontFamily: 'monospace',
                          color: 'var(--color-text)',
                          whiteSpace: 'nowrap',
                        }}>
                          {label}
                          {isPersistent && <span title="Persistent bottleneck" style={{ marginLeft: 4, fontSize: 9, color: '#dc2626' }}>●ALL</span>}
                          {isConditional && <span title="Conditional bottleneck" style={{ marginLeft: 4, fontSize: 9, color: '#ea580c' }}>◐SOME</span>}
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
              <div style={{
                marginTop: 10,
                padding: '14px 16px',
                borderRadius: 8,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                fontSize: 13,
                lineHeight: 1.7,
                color: 'var(--color-text)',
                whiteSpace: 'pre-wrap',
              }}>
                {/* Pipeline Source Badge */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 9px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  marginBottom: 12,
                  background: narrationSource === 'gemini_llm' ? 'rgba(59,130,246,0.15)' : narrationSource === 'groq_llm' ? 'rgba(249,115,22,0.15)' : 'rgba(107,114,128,0.15)',
                  color: narrationSource === 'gemini_llm' ? '#3b82f6' : narrationSource === 'groq_llm' ? '#f97316' : 'var(--color-muted)',
                  border: `1px solid ${narrationSource === 'gemini_llm' ? 'rgba(59,130,246,0.3)' : narrationSource === 'groq_llm' ? 'rgba(249,115,22,0.3)' : 'var(--color-border)'}`,
                }}>
                  {narrationSource === 'gemini_llm' && `✨ Google Gemini (${narrationModel || 'gemini-3.5-flash'})`}
                  {narrationSource === 'groq_llm' && `⚡ Groq LLM (${narrationModel || 'openai/gpt-oss-120b'})`}
                  {narrationSource === 'deterministic_fallback' && `📋 Deterministic Local Synthesis`}
                  {narrationSource !== 'gemini_llm' && narrationSource !== 'groq_llm' && narrationSource !== 'deterministic_fallback' && `AI Synthesis (${narrationModel || narrationSource})`}
                </div>

                <div>{narration}</div>

                <div style={{
                  marginTop: 12,
                  fontSize: 10,
                  color: 'var(--color-muted)',
                  fontStyle: 'italic',
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: 8,
                }}>
                  This narrative was generated by the CrowdSense LLM pipeline summarizing the above deterministic simulation findings.
                  The tables and rules above are the authoritative ground truth.
                </div>
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
    </div>
  )
}
