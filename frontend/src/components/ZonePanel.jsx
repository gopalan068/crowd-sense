/**
 * frontend/src/components/ZonePanel.jsx
 * Operational Zone Panel displaying live stream preview, density metrics, and intensity overlay.
 */
import React from 'react'
import ZoneIntensityOverlay from './ZoneIntensityOverlay'

export default function ZonePanel({ zoneData, webcamActive, onToggleWebcam }) {
  if (!zoneData) {
    return (
      <div
        className="rounded-xl p-8 border text-center flex flex-col items-center justify-center min-h-[300px]"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="w-10 h-10 rounded-full border-4 border-t-sky-600 animate-spin mb-3" />
        <p className="font-semibold text-lg" style={{ color: 'var(--color-text)' }}>
          Awaiting Zone Stream Data…
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
          Start the CV service or toggle the Synthetic Data Generator.
        </p>
      </div>
    )
  }

  const {
    zone_id = 'zone_1',
    zone_type = 'general',
    people_count = 0,
    area_sqm = 20,
    density = 0,
    risk_level = 'green',
    risk_score = 0,
    trend_slope = 0,
    eta_to_red_min = null,
    timestamp = new Date().toISOString(),
  } = zoneData

  return (
    <div
      className="rounded-xl border shadow-sm overflow-hidden flex flex-col"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Zone Header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-hover)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono-num px-2 py-0.5 rounded font-bold uppercase tracking-wider border"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
            ZONE: {zone_id}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold uppercase"
                style={{ background: zone_type === 'corridor' ? '#FEE2E2' : '#E0F2FE', color: zone_type === 'corridor' ? '#991B1B' : '#075985' }}>
            {zone_type} TYPE
          </span>
        </div>

        <div className="text-xs font-mono-num" style={{ color: 'var(--color-muted)' }}>
          UPDATED: {new Date(timestamp).toLocaleTimeString()}
        </div>
      </div>

      {/* Main Content Grid: Video Feed Left + Metrics Right */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Video / Visual Stream Box (8 Cols) */}
        <div className="lg:col-span-7 relative min-h-[260px] rounded-xl overflow-hidden bg-slate-900 border border-slate-700 flex items-center justify-center">
          {/* Simulated or Live Camera Feed Overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40">
            {/* Grid pattern lines representing camera calibration */}
            <div className="absolute inset-0 opacity-15"
                 style={{ backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

            <div className="text-center p-4 z-10">
              <div className="text-4xl mb-2">📹</div>
              <p className="text-xs font-mono-num text-slate-300 font-semibold uppercase tracking-wider">
                LIVE CAMERA FEED — {zone_id}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Area Footprint: {area_sqm} m² | Frame Rate: 30 FPS
              </p>
            </div>
          </div>

          {/* Integrated Zone Intensity Overlay */}
          <ZoneIntensityOverlay riskLevel={risk_level} density={density} riskScore={risk_score} />
        </div>

        {/* Metrics Column (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
          {/* Main Density Readout Card */}
          <div className="p-4 rounded-xl border flex items-center justify-between"
               style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
            <div>
              <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Current Density
              </p>
              <div className="text-3xl font-extrabold font-mono-num mt-1" style={{ color: 'var(--color-text)' }}>
                {density.toFixed(2)}
                <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-muted)' }}>people / m²</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold font-mono-num" style={{ color: 'var(--color-text)' }}>
                {people_count}
              </span>
              <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Headcount
              </p>
            </div>
          </div>

          {/* Metric Sub-Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Trend Slope */}
            <div className="p-3 rounded-lg border" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
              <p className="text-[11px] uppercase font-bold tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Rate of Rise (Slope)
              </p>
              <p className="text-lg font-bold font-mono-num mt-0.5"
                 style={{ color: trend_slope > 0.5 ? 'var(--risk-orange)' : 'var(--color-text)' }}>
                {trend_slope > 0 ? `+${trend_slope.toFixed(2)}` : trend_slope.toFixed(2)}
                <span className="text-[10px] font-normal ml-1" style={{ color: 'var(--color-muted)' }}>p/m²/min</span>
              </p>
            </div>

            {/* ETA to Red */}
            <div className="p-3 rounded-lg border" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
              <p className="text-[11px] uppercase font-bold tracking-wider" style={{ color: 'var(--color-muted)' }}>
                ETA to Red Threshold
              </p>
              <p className="text-lg font-bold font-mono-num mt-0.5" style={{ color: 'var(--color-text)' }}>
                {eta_to_red_min === 0 ? (
                  <span style={{ color: 'var(--risk-red)' }}>CRITICAL NOW</span>
                ) : eta_to_red_min ? (
                  `~${eta_to_red_min} min`
                ) : (
                  <span style={{ color: 'var(--risk-green)' }}>STABLE</span>
                )}
              </p>
            </div>
          </div>

          {/* Operational Area Summary */}
          <div className="p-3 rounded-lg border text-xs flex justify-between items-center"
               style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
            <span>Calibrated Ground Area:</span>
            <span className="font-mono-num font-bold text-slate-800 dark:text-slate-200">{area_sqm} m²</span>
          </div>
        </div>

      </div>
    </div>
  )
}
