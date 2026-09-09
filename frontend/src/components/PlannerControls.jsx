/**
 * frontend/src/components/PlannerControls.jsx
 *
 * Simulation control panel for the CrowdSense Planner module.
 * Optimized for the 3:2 layout ratio (2 parts width = ~40% screen width),
 * organizing controls into responsive side-by-side grids and prioritizing
 * primary simulation and emergency command buttons.
 */
import React from 'react'
import { getDensityBand } from '../lib/fruinDensity.js'

export default function PlannerControls({
  // Sim mode
  simMode,          // 'edit' | 'running' | 'paused'
  isEmergency,
  onStart,
  onPause,
  onReset,
  onTriggerEmergency,

  // Emergency Openings / Gates
  openings,               // array of emergency openings { id, name, a, b, isOpen }
  onToggleOpening,        // (id) => void
  onOpenAllOpenings,      // () => void
  onCloseAllOpenings,     // () => void

  // Focus mode
  focusPoint,
  isFocusMode,
  onToggleFocusMode,
  focusCondition,          // 'normal' | 'rushed'
  onFocusConditionChange,
  onSelectFocusTool,

  // Spawn controls
  spawnRate,
  onSpawnRateChange,
  maxAgents,
  onMaxAgentsChange,
  activeSpawnIds,         // Set of spawn IDs that are active
  spawns,                 // venue spawn points for per-spawn toggle
  onToggleSpawn,

  // Display controls
  heatmapOpacity,
  onHeatmapOpacityChange,
  showGrid,
  onShowGridChange,

  // Live stats
  agentCount,
  simTimeSec,
  maxDensityPpm2,
  fps,

  // Venue state
  hasVenue,
}) {
  const band = getDensityBand(maxDensityPpm2 || 0)
  const isRunning = simMode === 'running'
  const isPaused  = simMode === 'paused'
  const canRun    = hasVenue && (simMode === 'edit' || isPaused)
  const isActive  = isRunning || isPaused

  return (
    <div
      className="flex flex-col gap-3.5 text-xs font-mono-num"
      style={{ color: 'var(--color-text)' }}
    >

      {/* ── 1. Primary Command Deck (Execution & Emergency Action Row) ── */}
      <div className="rounded-xl p-3 border shadow-sm flex flex-col gap-2.5"
           style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between">
          <span className="font-extrabold uppercase tracking-wider text-[10px] text-slate-400">
            Execution Controls
          </span>
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
            isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
            isPaused  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
            'bg-slate-700/40 text-slate-400 border border-slate-700'
          }`}>
            State: {simMode}
          </span>
        </div>

        {/* Action buttons: Start / Pause / Reset in responsive command row */}
        <div className="flex items-center gap-2">
          <button
            id="planner-btn-start"
            onClick={onStart}
            disabled={!canRun}
            className={`flex-[2] py-2.5 px-3 rounded-lg font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm ${
              canRun
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-emerald-600/30'
                : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            <span>▶</span>
            <span>{isPaused ? 'RESUME' : 'START SIM'}</span>
          </button>

          <button
            id="planner-btn-pause"
            onClick={onPause}
            disabled={!isRunning}
            className={`flex-1 py-2.5 px-2 rounded-lg font-extrabold text-xs transition-all flex items-center justify-center gap-1 shadow-sm ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-500 text-white hover:shadow-amber-600/30'
                : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            <span>⏸</span>
            <span>PAUSE</span>
          </button>

          <button
            id="planner-btn-reset"
            onClick={onReset}
            className="flex-1 py-2.5 px-2 rounded-lg font-extrabold text-xs bg-slate-600 hover:bg-slate-500 text-white shadow-sm transition-all flex items-center justify-center gap-1 hover:shadow-slate-600/30"
          >
            <span>⏹</span>
            <span>RESET</span>
          </button>
        </div>

        {/* Emergency Trigger Button Bar */}
        <div className="flex flex-col gap-1 pt-1 border-t border-slate-700/40">
          <button
            id="planner-btn-emergency"
            onClick={onTriggerEmergency}
            disabled={!isActive}
            className={`w-full py-2.5 rounded-lg font-extrabold text-xs tracking-wider transition-all flex items-center justify-center gap-2 ${
              isEmergency
                ? 'bg-red-700 text-white animate-panic border-2 border-red-400 shadow-lg'
                : isActive
                ? 'bg-red-600 hover:bg-red-500 text-white border border-red-700 shadow-sm'
                : 'bg-slate-300 dark:bg-slate-700/60 text-slate-500 cursor-not-allowed border border-transparent'
            }`}
          >
            <span className="text-sm">🚨</span>
            <span>{isEmergency ? 'EMERGENCY ACTIVE — EVACUATING' : 'TRIGGER EMERGENCY SURGE'}</span>
          </button>

          {isEmergency && (
            <p className="text-center text-amber-500 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider animate-pulse pt-0.5">
              ⚠ All agents redirecting to nearest exit portals
            </p>
          )}
        </div>
      </div>

      {/* ── 2. Live Telemetry Strip (4-Col Grid in 40% Width) ─────────── */}
      {isActive && (
        <div
          className="rounded-xl p-3 border grid grid-cols-2 sm:grid-cols-4 gap-2.5 shadow-sm"
          style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        >
          <div className="p-2 rounded-lg bg-black/20 border border-slate-800">
            <p className="text-[9px] uppercase tracking-wider text-slate-400">Total Agents</p>
            <p className="text-lg font-extrabold text-white">{agentCount}</p>
          </div>
          <div className="p-2 rounded-lg bg-black/20 border border-slate-800">
            <p className="text-[9px] uppercase tracking-wider text-slate-400">Sim Elapsed</p>
            <p className="text-lg font-extrabold text-white">
              {Math.floor(simTimeSec / 60)}:{String(Math.floor(simTimeSec % 60)).padStart(2, '0')}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-black/20 border border-slate-800">
            <p className="text-[9px] uppercase tracking-wider text-slate-400">Engine Rate</p>
            <p className="text-lg font-extrabold text-sky-400">{fps} <span className="text-[10px] font-normal text-slate-400">fps</span></p>
          </div>
          <div className="p-2 rounded-lg bg-black/20 border border-slate-800">
            <p className="text-[9px] uppercase tracking-wider text-slate-400">Peak Density</p>
            <p className="text-lg font-extrabold" style={{ color: band.cssVar }}>
              {(maxDensityPpm2 || 0).toFixed(2)} <span className="text-[9px] font-normal">p/m²</span>
            </p>
          </div>
          <div className="col-span-2 sm:col-span-4 flex items-center justify-between px-1">
            <span className="text-[9px] uppercase tracking-wider text-slate-400">Fruin LOS Band:</span>
            <span
              className="px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide"
              style={{
                background: band.cssVarBg,
                color: band.cssVar,
                border: `1px solid ${band.cssVarBorder}`,
              }}
            >
              {band.shortLabel} — {band.label}
            </span>
          </div>
        </div>
      )}

      {/* ── 3. Side-by-Side Row 1: Inflow Pacing & Population Limit ────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Spawn Rate Slider */}
        <div className="rounded-xl p-3 border shadow-sm flex flex-col justify-between"
             style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="font-extrabold uppercase tracking-wider text-[10px] text-slate-400">
                Spawn Inflow
              </label>
              <span className="font-extrabold text-sm text-sky-400">
                {spawnRate} <span className="text-[9px] font-normal text-slate-400">p/sec</span>
              </span>
            </div>
            <input
              id="planner-spawn-rate"
              type="range" min={0} max={20} step={1}
              value={spawnRate}
              onChange={e => onSpawnRateChange(Number(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>
          <p className="text-[9px] text-slate-500 mt-2">Inflow rate per active gate</p>
        </div>

        {/* Population Cap Slider */}
        <div className="rounded-xl p-3 border shadow-sm flex flex-col justify-between"
             style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="font-extrabold uppercase tracking-wider text-[10px] text-slate-400">
                Population Cap
              </label>
              <span className={`font-extrabold text-sm ${maxAgents > 1000 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {maxAgents} <span className="text-[9px] font-normal text-slate-400">agents</span>
              </span>
            </div>
            <input
              id="planner-max-agents"
              type="range" min={50} max={1500} step={50}
              value={maxAgents}
              onChange={e => onMaxAgentsChange(Number(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>
          <p className="text-[9px] text-slate-500 mt-2">
            {maxAgents > 1000 ? '⚠ High agent load (>1000)' : 'Calibrated for NDMA safe band'}
          </p>
        </div>
      </div>

      {/* ── 4. Side-by-Side Row 2: Dynamic Gates & Focus Target ────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Dynamic Emergency Gates */}
        {openings && openings.length > 0 ? (
          <div
            className="rounded-xl p-3 border flex flex-col gap-2 transition-all shadow-sm"
            style={{
              background: 'rgba(239, 68, 68, 0.04)',
              borderColor: 'rgba(239, 68, 68, 0.25)',
            }}
          >
            <div className="flex justify-between items-center">
              <span className="font-extrabold uppercase tracking-wider text-[10px] text-red-400 flex items-center gap-1">
                <span>🚪</span> Emergency Gates
              </span>
              <div className="flex gap-1">
                <button
                  onClick={onOpenAllOpenings}
                  className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm"
                  title="Open all emergency gates"
                >
                  Open All
                </button>
                <button
                  onClick={onCloseAllOpenings}
                  className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-white transition-all shadow-sm"
                  title="Close all emergency gates"
                >
                  Close All
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 mt-0.5">
              {openings.map(op => (
                <div
                  key={op.id}
                  className="flex items-center justify-between p-1.5 rounded-lg border text-[10px] transition-all"
                  style={{
                    background: op.isOpen ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    borderColor: op.isOpen ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0 pr-1">
                    <span className="text-xs">{op.isOpen ? '🔓' : '🔒'}</span>
                    <span className="font-bold truncate text-slate-200">
                      {op.name || op.id}
                    </span>
                  </div>
                  <button
                    onClick={() => onToggleOpening(op.id)}
                    className={`px-2.5 py-1 rounded text-[9px] font-extrabold uppercase transition-all shadow-sm shrink-0 ${
                      op.isOpen
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                        : 'bg-red-600 hover:bg-red-500 text-white'
                    }`}
                  >
                    {op.isOpen ? 'OPEN' : 'CLOSED'}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              Open gates vent crowd pressure immediately.
            </p>
          </div>
        ) : (
          <div className="rounded-xl p-3 border flex flex-col justify-center items-center text-slate-500 text-center"
               style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
            <span className="text-lg mb-1">🚪</span>
            <span className="text-[10px]">No dynamic emergency gates defined in layout</span>
          </div>
        )}

        {/* Focus Mode & Crowd Attraction Target */}
        <div
          className="rounded-xl p-3 border flex flex-col gap-2.5 transition-all shadow-sm"
          style={{
            background: isFocusMode ? 'rgba(168,85,247,0.06)' : 'var(--color-bg)',
            borderColor: isFocusMode ? '#c084fc' : 'var(--color-border)',
          }}
        >
          <div className="flex justify-between items-center">
            <span className="font-extrabold uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-purple-400">
              <span>🎯</span> Focus Attraction
            </span>
            <button
              onClick={() => onToggleFocusMode()}
              className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition-all ${
                isFocusMode
                  ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-sm'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {isFocusMode ? '✓ ACTIVE' : 'ENABLE'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onFocusConditionChange('normal')}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border flex items-center justify-center gap-1 transition-all ${
                focusCondition === 'normal'
                  ? 'bg-purple-950/60 border-purple-500 text-purple-300'
                  : 'border-slate-700 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span>🚶</span> Normal
            </button>
            <button
              onClick={() => onFocusConditionChange('rushed')}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border flex items-center justify-center gap-1 transition-all ${
                focusCondition === 'rushed'
                  ? 'bg-red-950/60 border-red-500 text-red-300 animate-pulse'
                  : 'border-slate-700 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span>⚡</span> Surge
            </button>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-700/50 text-[9px]">
            <span className="text-slate-400">
              {focusPoint ? `Target: (${Math.round(focusPoint.x)}, ${Math.round(focusPoint.y)})` : 'No point set'}
            </span>
            <button
              onClick={onSelectFocusTool}
              className="text-purple-400 font-bold hover:underline"
            >
              📍 Set Target
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. Side-by-Side Row 3: Spawn Portals & Display Controls ───── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Active Spawn Points */}
        <div className="rounded-xl p-3 border shadow-sm"
             style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
          <p className="font-extrabold uppercase tracking-wider text-[10px] mb-2 text-slate-400">
            Active Spawn Portals
          </p>
          {spawns && spawns.length > 0 ? (
            <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto">
              {spawns.map(sp => (
                <label key={sp.id} className="flex items-center gap-2 cursor-pointer text-[10px]">
                  <input
                    type="checkbox"
                    checked={activeSpawnIds.has(sp.id)}
                    onChange={() => onToggleSpawn(sp.id)}
                    className="accent-sky-500"
                  />
                  <span className="text-slate-200">{sp.name || sp.id}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-slate-500">No spawns configured</p>
          )}
        </div>

        {/* Display & Visual Overlays */}
        <div className="rounded-xl p-3 border shadow-sm flex flex-col justify-between"
             style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Heatmap Opacity</label>
              <span className="font-bold text-slate-200">{Math.round(heatmapOpacity * 100)}%</span>
            </div>
            <input
              id="planner-heatmap-opacity"
              type="range" min={0} max={1} step={0.05}
              value={heatmapOpacity}
              onChange={e => onHeatmapOpacityChange(Number(e.target.value))}
              className="w-full accent-sky-500 mb-2 cursor-pointer"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-300 pt-1 border-t border-slate-700/50">
            <input
              id="planner-show-grid"
              type="checkbox"
              checked={showGrid}
              onChange={e => onShowGridChange(e.target.checked)}
              className="accent-sky-500"
            />
            <span>Show density grid lines</span>
          </label>
        </div>
      </div>

      {/* ── 6. Fruin Level of Service (LOS) Quick Guide ───────────────── */}
      <div className="rounded-xl p-2.5 border shadow-sm"
           style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
        <p className="font-extrabold uppercase tracking-wider text-[9px] mb-1.5 text-slate-400">
          Fruin Level of Service (LOS) Density Spectrum
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: '< 1.08 p/m²',   text: 'LOS A/B · Free',       color: 'var(--risk-green)'  },
            { label: '1.08–2.15',     text: 'LOS C · Safe Band',    color: 'var(--risk-yellow)' },
            { label: '2.15–3.8',      text: 'LOS D/E · Choke',      color: 'var(--risk-orange)' },
            { label: '> 3.8 p/m²',    text: 'LOS F · Crush Risk',   color: 'var(--risk-red)'    },
          ].map(b => (
            <div key={b.label} className="flex items-center gap-1.5 p-1 rounded bg-black/20 border border-slate-800">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: b.color }} />
              <div className="min-w-0">
                <span style={{ color: b.color }} className="font-extrabold text-[9px] block leading-tight">{b.label}</span>
                <span className="text-[8px] text-slate-400 truncate block">{b.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
