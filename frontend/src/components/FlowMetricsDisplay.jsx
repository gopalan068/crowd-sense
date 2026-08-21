/**
 * frontend/src/components/FlowMetricsDisplay.jsx
 * Visual gauges for OpenCV Optical Flow metrics (Convergence, Turbulence, Panic Signature).
 */
import React from 'react'

export default function FlowMetricsDisplay({ zoneData }) {
  if (!zoneData) return null

  const {
    zone_id = 'zone_1',
    flow_convergence = 0.0,
    flow_turbulence = 0.0,
    panic_signature = false,
  } = zoneData

  return (
    <div
      className="p-4 rounded-xl border flex flex-col space-y-3 font-mono-num"
      style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
          OpenCV Motion Flow Analysis — {zone_id}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded font-extrabold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
          FARNEBACK OPTICAL FLOW
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Flow Convergence */}
        <div className="p-2.5 rounded-lg border bg-slate-900 text-slate-100 space-y-1 border-slate-800">
          <p className="text-[10px] uppercase font-bold text-slate-400">Flow Convergence</p>
          <p className="text-lg font-bold text-sky-400">{flow_convergence.toFixed(2)}</p>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-sky-500 h-full transition-all duration-300"
              style={{ width: `${Math.min(100, flow_convergence * 100)}%` }}
            />
          </div>
        </div>

        {/* Flow Turbulence */}
        <div className="p-2.5 rounded-lg border bg-slate-900 text-slate-100 space-y-1 border-slate-800">
          <p className="text-[10px] uppercase font-bold text-slate-400">Flow Turbulence</p>
          <p className="text-lg font-bold text-amber-400">{flow_turbulence.toFixed(2)}</p>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full transition-all duration-300"
              style={{ width: `${Math.min(100, flow_turbulence * 100)}%` }}
            />
          </div>
        </div>

        {/* Panic Signature */}
        <div
          className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all ${
            panic_signature
              ? 'bg-red-950 text-white border-red-500 animate-panic'
              : 'bg-slate-900 text-slate-100 border-slate-800'
          }`}
        >
          <p className="text-[10px] uppercase font-bold text-slate-400">Panic Signature</p>
          <span className={`text-xs font-extrabold px-2 py-1 rounded w-fit ${panic_signature ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
            {panic_signature ? '🛑 DETECTED' : '✓ STABLE'}
          </span>
        </div>
      </div>
    </div>
  )
}
