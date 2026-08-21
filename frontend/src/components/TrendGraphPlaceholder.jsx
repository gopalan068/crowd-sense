/**
 * frontend/src/components/TrendGraphPlaceholder.jsx
 * Reserved Card Slot for Density Trend Graph & Rate-of-Rise Extrapolation (Tier 2).
 */
import React from 'react'

export default function TrendGraphPlaceholder({ densityHistory = [] }) {
  return (
    <div
      className="rounded-xl border shadow-sm p-5 flex flex-col justify-between"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">📈</span>
          <h3 className="font-bold text-sm tracking-wide uppercase" style={{ color: 'var(--color-text)' }}>
            Density Trend Graph & Rate-of-Rise Extrapolation
          </h3>
        </div>
        <span className="text-xs font-mono-num font-semibold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          RESERVED SLOT
        </span>
      </div>

      <div className="py-6 flex flex-col items-center justify-center text-center">
        {/* Visual waveform placeholder */}
        <div className="w-full max-w-md h-16 flex items-end justify-between gap-1.5 px-4 mb-3 opacity-60">
          {[20, 35, 25, 45, 60, 50, 75, 90, 80, 100].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-sky-500 transition-all duration-300"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>

        <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
          Linear Extrapolation & Early Warning Trend Slot
        </p>
        <p className="text-[11px] mt-1 max-w-sm" style={{ color: 'var(--color-muted)' }}>
          Surfaces density rise trajectories and projects time-to-red thresholds based on historical readings.
        </p>
      </div>
    </div>
  )
}
