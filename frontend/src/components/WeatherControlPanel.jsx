/**
 * frontend/src/components/WeatherControlPanel.jsx
 * Dashboard environmental monitoring panel and presenter demo control bar.
 * Allows presenters to toggle simulated environmental presets live during demo runs.
 */
import React, { useState } from 'react'

const PRESET_OPTIONS = [
  {
    id: 'clear',
    icon: '☀️',
    label: 'CLEAR',
    desc: 'Normal Thresholds (1.0x)',
    bgColor: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
    activeBg: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30',
  },
  {
    id: 'extreme_heat',
    icon: '🔥',
    label: 'EXTREME HEAT',
    desc: 'Tighten Density (-25%)',
    bgColor: 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400',
    activeBg: 'bg-amber-600 text-white shadow-md shadow-amber-600/30',
  },
  {
    id: 'heavy_rain',
    icon: '🌧️',
    label: 'HEAVY RAIN',
    desc: 'Flow Sensitivity (1.5x)',
    bgColor: 'bg-sky-500/10 border-sky-500/40 text-sky-600 dark:text-sky-400',
    activeBg: 'bg-sky-600 text-white shadow-md shadow-sky-600/30',
  },
]

export default function WeatherControlPanel({ weatherState, backendUrl, pipelineActive = true, onTogglePipeline }) {
  const [loadingPreset, setLoadingPreset] = useState(null)
  const [togglingPipeline, setTogglingPipeline] = useState(false)

  const currentCondition = weatherState?.condition || 'clear'

  const handleSelectPreset = async (presetId) => {
    if (loadingPreset || presetId === currentCondition) return
    setLoadingPreset(presetId)

    try {
      const res = await fetch(`${backendUrl}/api/conditions/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition: presetId }),
      })
      if (!res.ok) {
        console.error('[WeatherControlPanel] Error setting condition preset:', res.statusText)
      }
    } catch (err) {
      console.error('[WeatherControlPanel] Network error setting weather preset:', err)
    } finally {
      setLoadingPreset(null)
    }
  }

  const handlePipelineToggle = async () => {
    if (togglingPipeline) return
    setTogglingPipeline(true)
    if (onTogglePipeline) {
      await onTogglePipeline()
    } else {
      try {
        await fetch(`${backendUrl}/api/pipeline/toggle`, { method: 'POST' })
      } catch (err) {
        console.error('[WeatherControlPanel] Error toggling pipeline:', err)
      }
    }
    setTogglingPipeline(false)
  }

  // Gap #8 fix: wire POST /api/pipeline/set (explicit boolean set, previously uncalled)
  const handlePipelineForceSet = async (active) => {
    try {
      await fetch(`${backendUrl}/api/pipeline/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
    } catch (err) {
      console.error('[WeatherControlPanel] Error force-setting pipeline:', err)
    }
  }


  const activeOption = PRESET_OPTIONS.find((o) => o.id === currentCondition) || PRESET_OPTIONS[0]

  return (
    <div
      className="p-3.5 rounded-xl border shadow-sm space-y-3 font-mono-num transition-all"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Panel Top Row: Status Indicator & Mandatory Disclosure Label */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg border font-bold text-xs"
               style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
            <span className="text-base">{activeOption.icon}</span>
            <span className="uppercase tracking-wide">{weatherState?.label || activeOption.label}</span>
          </div>

          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
            <span>🌡️ {weatherState?.temperature_c ?? 28}°C</span>
            {weatherState?.precipitation_mm > 0 && (
              <span>🌧️ {weatherState.precipitation_mm} mm/h</span>
            )}
            <span className="hidden sm:inline opacity-70">
              (Density Factor: {weatherState?.density_factor ?? 1.0}x | Flow Factor: {weatherState?.flow_factor ?? 1.0}x)
            </span>
          </div>
        </div>

        {/* Right Side: Mandatory Honesty Label + Pipeline Master Status Badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
            <span>⚠️ SIMULATED CONDITIONS — MANUALLY SET FOR DEMONSTRATION</span>
          </div>
        </div>
      </div>

      {/* Presenter Demo Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider opacity-70" style={{ color: 'var(--color-text)' }}>
            PRESENTER CONTROLS:
          </span>

          {/* Master CV Pipeline Power Toggle Button */}
          <button
            onClick={handlePipelineToggle}
            disabled={togglingPipeline}
            title={pipelineActive ? 'Pause continuous CV processing (Freezes to static snapshot)' : 'Resume continuous live CV processing and streaming'}
            className={`px-3 py-1.5 rounded-lg border font-bold text-xs transition-all flex items-center gap-2 shadow-xs cursor-pointer ${
              pipelineActive
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30 animate-pulse'
            } ${togglingPipeline ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${pipelineActive ? 'bg-emerald-500 shadow-xs shadow-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>{pipelineActive ? '🟢 CV PIPELINE: LIVE' : '⏸️ CV PIPELINE: PAUSED'}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/10 dark:bg-black/40 font-normal">
              {pipelineActive ? 'Click to Pause' : 'Click to Resume'}
            </span>
          </button>
        </div>

        {/* Environmental Presets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full sm:w-auto">
          {PRESET_OPTIONS.map((opt) => {
            const isActive = currentCondition === opt.id
            const isLoading = loadingPreset === opt.id

            return (
              <button
                key={opt.id}
                onClick={() => handleSelectPreset(opt.id)}
                disabled={isLoading}
                title={`Switch environmental state to ${opt.label}`}
                className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all flex flex-col items-start gap-0.5 ${
                  isActive
                    ? opt.activeBg
                    : `${opt.bgColor} hover:brightness-110 opacity-80 hover:opacity-100`
                } ${isLoading ? 'animate-pulse opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-1.5 w-full">
                  <span>{opt.icon}</span>
                  <span className="truncate">{opt.label}</span>
                  {isActive && <span className="ml-auto text-[10px]">● LIVE</span>}
                </div>
                <span className={`text-[9px] font-normal ${isActive ? 'text-white/90' : 'opacity-80'}`}>
                  {opt.desc}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Advanced CV Override — Gap #8: POST /api/pipeline/set wired up */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-m)', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Advanced Override:
        </span>
        <button
          onClick={() => handlePipelineForceSet(true)}
          title="Force pipeline to ACTIVE state via POST /api/pipeline/set"
          style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid rgba(42,217,158,0.4)', background: 'rgba(42,217,158,0.08)', color: 'var(--green)', fontFamily: 'var(--font-m)', cursor: 'pointer' }}
        >
          ⏵ Force Start
        </button>
        <button
          onClick={() => handlePipelineForceSet(false)}
          title="Force pipeline to PAUSED state via POST /api/pipeline/set"
          style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid rgba(255,166,63,0.4)', background: 'rgba(255,166,63,0.08)', color: 'var(--orange)', fontFamily: 'var(--font-m)', cursor: 'pointer' }}
        >
          ⏸ Force Pause
        </button>
      </div>
    </div>
  )
}


