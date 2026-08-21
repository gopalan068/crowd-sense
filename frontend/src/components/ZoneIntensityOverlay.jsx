/**
 * frontend/src/components/ZoneIntensityOverlay.jsx
 * Zone-Level Density & Risk Intensity Indicator.
 *
 * Provides clear visual risk tint & intensity badge directly on the zone stream
 * without introducing bounding-box contract complexity.
 */
import React from 'react'

const RISK_CONFIGS = {
  green: {
    label: 'SAFE',
    icon: '✓',
    shape: 'SHIELD',
    badgeBg: 'var(--risk-green-bg)',
    borderColor: 'var(--risk-green-border)',
    textColor: 'var(--risk-green)',
    tintBg: 'rgba(16, 185, 129, 0.05)',
  },
  yellow: {
    label: 'CAUTION',
    icon: '▲',
    shape: 'TRIANGLE',
    badgeBg: 'var(--risk-yellow-bg)',
    borderColor: 'var(--risk-yellow-border)',
    textColor: 'var(--risk-yellow)',
    tintBg: 'rgba(245, 158, 11, 0.1)',
  },
  orange: {
    label: 'WARNING',
    icon: '◆',
    shape: 'DIAMOND',
    badgeBg: 'var(--risk-orange-bg)',
    borderColor: 'var(--risk-orange-border)',
    textColor: 'var(--risk-orange)',
    tintBg: 'rgba(249, 115, 22, 0.15)',
  },
  red: {
    label: 'CRITICAL',
    icon: '🛑',
    shape: 'OCTAGON',
    badgeBg: 'var(--risk-red-bg)',
    borderColor: 'var(--risk-red-border)',
    textColor: 'var(--risk-red)',
    tintBg: 'rgba(239, 68, 68, 0.2)',
  },
}

export default function ZoneIntensityOverlay({ riskLevel = 'green', density = 0, riskScore = 0 }) {
  const config = RISK_CONFIGS[riskLevel] || RISK_CONFIGS.green

  return (
    <div
      className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 rounded-xl transition-colors duration-300"
      style={{
        background: `radial-gradient(circle at center, transparent 40%, ${config.tintBg})`,
        border: `2px solid ${config.textColor}`,
      }}
    >
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold text-xs shadow-sm"
          style={{
            background: config.badgeBg,
            borderColor: config.borderColor,
            color: config.textColor,
          }}
        >
          <span className="text-sm">{config.icon}</span>
          <span className="tracking-wider">{config.label}</span>
          <span className="ml-1 text-[10px] font-normal opacity-80 font-mono-num">
            (Score: {riskScore.toFixed(2)})
          </span>
        </div>

        {/* Live indicator dot */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 backdrop-blur text-white text-xs font-mono-num">
          <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: config.textColor }} />
          LIVE ZONE DENSITY
        </div>
      </div>

      {/* Bottom Bar: Density Heat Meter */}
      <div className="w-full bg-black/60 backdrop-blur rounded-lg p-2.5 border border-white/10 flex items-center gap-3">
        <div className="text-white text-xs font-mono-num font-semibold shrink-0">
          DENSITY HEAT: {density.toFixed(2)} p/m²
        </div>
        <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden flex border border-white/20">
          <div
            className="h-full transition-all duration-500 rounded-full"
            style={{
              width: `${Math.min(100, (density / 4.5) * 100)}%`,
              background: config.textColor,
            }}
          />
        </div>
      </div>
    </div>
  )
}
