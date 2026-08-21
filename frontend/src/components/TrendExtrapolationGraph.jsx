/**
 * frontend/src/components/TrendExtrapolationGraph.jsx
 * Real-Time Density History & Linear Projection Trend Extrapolation Graph.
 *
 * Implements Section 4 Feature 9 & Section 5 formula breakdown:
 *   - Labeled strictly "Trend Extrapolation" (NEVER "AI prediction").
 *   - Renders density curve, projected trajectory line to red threshold.
 *   - Includes expandable "How is this computed?" modal with normalized score breakdown.
 */
import React, { useState } from 'react'

export default function TrendExtrapolationGraph({ zoneData }) {
  const [showFormulaModal, setShowFormulaModal] = useState(false)

  if (!zoneData) {
    return null
  }

  const {
    zone_id = 'zone_1',
    zone_type = 'general',
    density = 0,
    trend_slope = 0,
    eta_to_red_min = null,
    red_threshold = 3.5,
    risk_score = 0,
    breakdown = {
      density_raw: density,
      density_norm: Math.min(1.0, density / red_threshold),
      density_weight: 0.50,

      trend_slope_raw: trend_slope,
      trend_norm: Math.min(1.0, Math.max(0.0, trend_slope / 2.0)),
      trend_weight: 0.30,

      flow_convergence_raw: 0.0,
      flow_convergence_norm: 0.0,
      flow_convergence_weight: 0.10,

      flow_turbulence_raw: 0.0,
      flow_turbulence_norm: 0.0,
      flow_turbulence_weight: 0.10,
    },
    history = [],
  } = zoneData

  // Format history points for SVG path
  const points = history.length > 0 ? history : [{ density, timestamp: Date.now() }]
  const maxDensityScale = Math.max(red_threshold * 1.2, 4.0)

  // Compute SVG polyline coordinates
  const svgWidth = 600
  const svgHeight = 160
  const padding = 25

  const coords = points.map((p, index) => {
    const x = padding + (index / Math.max(1, points.length - 1)) * (svgWidth - padding * 2)
    const y = svgHeight - padding - (p.density / maxDensityScale) * (svgHeight - padding * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const pathD = `M ${coords.join(' L ')}`
  const redY = svgHeight - padding - (red_threshold / maxDensityScale) * (svgHeight - padding * 2)

  return (
    <div
      className="rounded-xl border shadow-sm p-5 flex flex-col space-y-4"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📈</span>
          <div>
            <h3 className="font-bold text-sm tracking-wide uppercase flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              Density Trend Extrapolation via Linear Projection
              <span className="text-[10px] font-mono-num font-bold px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
                ZONE: {zone_id} ({zone_type.toUpperCase()})
              </span>
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              Surfaces density trajectory &amp; projects rate of rise against zone threshold limit.
            </p>
          </div>
        </div>

        {/* Action Button: How is this computed? */}
        <button
          onClick={() => setShowFormulaModal(!showFormulaModal)}
          className="px-3 py-1.5 rounded-lg border font-bold text-xs shadow-xs transition-all hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center gap-1 font-mono-num"
          style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          <span>📊</span> HOW IS THIS COMPUTED?
        </button>
      </div>

      {/* Main Extrapolation Chart Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">

        {/* SVG Chart Box (8 cols) */}
        <div className="lg:col-span-8 relative bg-slate-950 p-3 rounded-xl border border-slate-800 overflow-hidden">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-40 overflow-visible">
            {/* Grid Lines */}
            <line x1={padding} y1={redY} x2={svgWidth - padding} y2={redY} stroke="#EF4444" strokeDasharray="4 4" strokeWidth="1.5" />
            <text x={svgWidth - padding - 80} y={redY - 6} fill="#EF4444" fontSize="10" fontWeight="bold" fontFamily="monospace">
              RED LIMIT ({red_threshold} p/m²)
            </text>

            {/* Historical Polyline */}
            <path d={pathD} fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* Projected Linear Trajectory if slope > 0 */}
            {trend_slope > 0 && coords.length > 0 && (
              <line
                x1={coords[coords.length - 1].split(',')[0]}
                y1={coords[coords.length - 1].split(',')[1]}
                x2={svgWidth - padding}
                y2={redY}
                stroke="#F97316"
                strokeDasharray="3 3"
                strokeWidth="2"
              />
            )}
          </svg>
        </div>

        {/* Extrapolation Summary Box (4 cols) */}
        <div className="lg:col-span-4 p-4 rounded-xl border space-y-3 flex flex-col justify-between"
             style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
              Extrapolation Projection
            </p>
            <div className="text-xl font-bold font-mono-num mt-1">
              {eta_to_red_min === 0 ? (
                <span className="text-red-600 font-extrabold flex items-center gap-1">
                  <span>🛑</span> CRITICAL THRESHOLD BREACHED
                </span>
              ) : eta_to_red_min ? (
                <span className="text-amber-600 dark:text-amber-400 font-extrabold">
                  Crosses red threshold in ~{eta_to_red_min} min
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  ✓ Density Slope Stable
                </span>
              )}
            </div>
          </div>

          <div className="pt-2 border-t text-xs font-mono-num space-y-1" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
            <div className="flex justify-between">
              <span>Rate of Rise (Slope):</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {trend_slope > 0 ? `+${trend_slope.toFixed(2)}` : trend_slope.toFixed(2)} p/m²/min
              </span>
            </div>
            <div className="flex justify-between">
              <span>Composite Risk Score:</span>
              <span className="font-bold text-sky-600 dark:text-sky-400">{risk_score.toFixed(2)} / 1.00</span>
            </div>
          </div>
        </div>

      </div>

      {/* Expandable "How is this computed?" Section 5 Breakdown Modal */}
      {showFormulaModal && (
        <div className="p-4 rounded-xl border space-y-3 bg-slate-900 text-slate-100 font-mono-num text-xs animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
            <span className="font-bold text-sky-400 text-sm">
              Section 5 Composite Risk Score Calculation Formula
            </span>
            <button
              onClick={() => setShowFormulaModal(false)}
              className="text-slate-400 hover:text-white font-bold px-2 py-0.5 rounded bg-slate-800"
            >
              ✕ CLOSE
            </button>
          </div>

          <p className="text-slate-300">
            Formula: <code className="text-amber-400">risk_score = (density_norm × 0.50) + (trend_norm × 0.30) + (convergence × 0.10) + (turbulence × 0.10)</code>
          </p>

          {/* Breakdown Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-800 text-[11px]">
              <thead>
                <tr className="bg-slate-800 text-slate-300">
                  <th className="p-2 border border-slate-700">Metric Signal</th>
                  <th className="p-2 border border-slate-700">Raw Physical Value</th>
                  <th className="p-2 border border-slate-700">Normalized (0.00–1.00)</th>
                  <th className="p-2 border border-slate-700">Weight</th>
                  <th className="p-2 border border-slate-700">Weighted Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <tr>
                  <td className="p-2 font-bold text-sky-400">1. Density</td>
                  <td className="p-2">{breakdown.density_raw.toFixed(2)} p/m²</td>
                  <td className="p-2">{breakdown.density_norm.toFixed(2)}</td>
                  <td className="p-2">50%</td>
                  <td className="p-2 font-bold text-emerald-400">{(breakdown.density_norm * 0.50).toFixed(3)}</td>
                </tr>
                <tr>
                  <td className="p-2 font-bold text-sky-400">2. Rate of Rise (Slope)</td>
                  <td className="p-2">{breakdown.trend_slope_raw.toFixed(2)} p/m²/min</td>
                  <td className="p-2">{breakdown.trend_norm.toFixed(2)}</td>
                  <td className="p-2">30%</td>
                  <td className="p-2 font-bold text-emerald-400">{(breakdown.trend_norm * 0.30).toFixed(3)}</td>
                </tr>
                <tr>
                  <td className="p-2 font-bold text-sky-400">3. Flow Convergence</td>
                  <td className="p-2">{breakdown.flow_convergence_raw.toFixed(2)} (Tier 2)</td>
                  <td className="p-2">{breakdown.flow_convergence_norm.toFixed(2)}</td>
                  <td className="p-2">10%</td>
                  <td className="p-2 font-bold text-slate-400">0.000</td>
                </tr>
                <tr>
                  <td className="p-2 font-bold text-sky-400">4. Flow Turbulence</td>
                  <td className="p-2">{breakdown.flow_turbulence_raw.toFixed(2)} (Tier 2)</td>
                  <td className="p-2">{breakdown.flow_turbulence_norm.toFixed(2)}</td>
                  <td className="p-2">10%</td>
                  <td className="p-2 font-bold text-slate-400">0.000</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 font-bold">
                  <td colSpan={4} className="p-2 text-right">TOTAL COMPOSITE RISK SCORE:</td>
                  <td className="p-2 text-sky-300 text-sm">{risk_score.toFixed(2)} / 1.00</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
