/**
 * frontend/src/components/PlannerControls.jsx
 *
 * Simulation control panel for the CrowdSense Planner module.
 * Provides: spawn rate, population cap, start/pause/reset,
 * emergency trigger, heatmap opacity, and live statistics.
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
      className="flex flex-col gap-3 text-xs font-mono-num"
      style={{ color: 'var(--color-text)' }}
    >

      {/* ── Sim Action Buttons ─────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        <button
          id="planner-btn-start"
          onClick={onStart}
          disabled={!canRun}
          className={`flex-1 px-3 py-2.5 rounded-lg font-bold text-xs transition-all ${
            canRun
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
              : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {isPaused ? '▶ RESUME' : '▶ START SIM'}
        </button>

        <button
          id="planner-btn-pause"
          onClick={onPause}
          disabled={!isRunning}
          className={`flex-1 px-3 py-2.5 rounded-lg font-bold text-xs transition-all ${
            isRunning
              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
              : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          ⏸ PAUSE
        </button>

        <button
          id="planner-btn-reset"
          onClick={onReset}
          className="flex-1 px-3 py-2.5 rounded-lg font-bold text-xs bg-slate-600 hover:bg-slate-500 text-white shadow-sm transition-all"
        >
          ⏹ RESET
        </button>
      </div>

      {/* ── Focus Point & Crowd Attraction ────────────────────────────── */}
      <div
        className="rounded-xl p-3 border flex flex-col gap-2.5 transition-all"
        style={{
          background: isFocusMode ? 'rgba(168,85,247,0.06)' : 'var(--color-bg)',
          borderColor: isFocusMode ? '#c084fc' : 'var(--color-border)',
        }}
      >
        <div className="flex justify-between items-center">
          <span className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5" style={{ color: isFocusMode ? '#a855f7' : 'var(--color-muted)' }}>
            <span>🎯</span> Focus Mode
          </span>
          <button
            onClick={() => onToggleFocusMode()}
            className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition-all ${
              isFocusMode
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-sm'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
            }`}
          >
            {isFocusMode ? '✓ ACTIVE' : 'ENABLE'}
          </button>
        </div>

        {/* Movement condition selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase font-semibold text-slate-500">
            Movement Condition
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onFocusConditionChange('normal')}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border flex items-center justify-center gap-1 transition-all ${
                focusCondition === 'normal'
                  ? 'bg-purple-100 dark:bg-purple-950/60 border-purple-500 text-purple-700 dark:text-purple-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>🚶</span> Normal
            </button>
            <button
              onClick={() => onFocusConditionChange('rushed')}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border flex items-center justify-center gap-1 transition-all ${
                focusCondition === 'rushed'
                  ? 'bg-red-100 dark:bg-red-950/60 border-red-500 text-red-600 dark:text-red-300 animate-pulse'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>⚡</span> Rushed / Surge
            </button>
          </div>
        </div>

        {/* Focus coordinates & Target button */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800 text-[9px]">
          <span style={{ color: 'var(--color-muted)' }}>
            {focusPoint ? `Target: (${Math.round(focusPoint.x)}, ${Math.round(focusPoint.y)})` : 'No point set'}
          </span>
          <button
            onClick={onSelectFocusTool}
            className="text-purple-600 dark:text-purple-400 font-bold hover:underline"
          >
            📍 Place Target on Canvas
          </button>
        </div>
      </div>

      {/* ── Emergency Trigger ─────────────────────────────────────────── */}
      <button
        id="planner-btn-emergency"
        onClick={onTriggerEmergency}
        disabled={!isActive}
        className={`w-full py-2.5 rounded-xl font-extrabold text-xs tracking-wider transition-all touch-target ${
          isEmergency
            ? 'bg-red-700 text-white animate-panic border-2 border-red-400 shadow-lg'
            : isActive
            ? 'bg-red-600 hover:bg-red-500 text-white border-2 border-red-700 shadow-sm'
            : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed border-2 border-transparent'
        }`}
      >
        🚨 {isEmergency ? 'EMERGENCY ACTIVE' : 'TRIGGER EMERGENCY'}
      </button>

      {isEmergency && (
        <p className="text-center text-amber-600 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider animate-pulse">
          All agents redirecting to nearest exit
        </p>
      )}

      {/* ── Emergency Openings / Dynamic Gates ─────────────────────────── */}
      {openings && openings.length > 0 && (
        <div
          className="rounded-xl p-3 border flex flex-col gap-2 transition-all shadow-sm"
          style={{
            background: 'rgba(239, 68, 68, 0.04)',
            borderColor: 'rgba(239, 68, 68, 0.25)',
          }}
        >
          <div className="flex justify-between items-center">
            <span className="font-extrabold uppercase tracking-wider text-[10px] text-red-500 dark:text-red-400 flex items-center gap-1">
              <span>🚨</span> Emergency Gates
            </span>
            <div className="flex gap-1">
              <button
                onClick={onOpenAllOpenings}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
                title="Open all emergency gates"
              >
                Open All
              </button>
              <button
                onClick={onCloseAllOpenings}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-white transition-all"
                title="Close all emergency gates"
              >
                Close All
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
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
                  <span className="font-bold truncate text-slate-800 dark:text-slate-200">
                    {op.name || op.id}
                  </span>
                </div>
                <button
                  onClick={() => onToggleOpening(op.id)}
                  className={`px-2 py-1 rounded text-[9px] font-extrabold uppercase transition-all shadow-sm shrink-0 ${
                    op.isOpen
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                      : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                  title={op.isOpen ? 'Click to close gate (barrier)' : 'Click to open gate (egress exit)'}
                >
                  {op.isOpen ? 'OPEN' : 'CLOSED'}
                </button>
              </div>
            ))}
          </div>
          <p className="text-[9px] leading-tight text-slate-500">
            Closed gates act as solid walls. Open gates allow crowd evacuation flow.
          </p>
        </div>
      )}

      {/* ── Live Statistics ────────────────────────────────────────────── */}
      {isActive && (
        <div
          className="rounded-xl p-3 border grid grid-cols-2 gap-2"
          style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        >
          <div>
            <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>Agents</p>
            <p className="text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>{agentCount}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>Sim Time</p>
            <p className="text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>
              {Math.floor(simTimeSec / 60)}:{String(Math.floor(simTimeSec % 60)).padStart(2, '0')}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>Tick Rate</p>
            <p className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{fps} fps</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>Peak Density</p>
            <p className="text-base font-bold" style={{ color: band.cssVar }}>
              {(maxDensityPpm2 || 0).toFixed(2)}<span className="text-[9px] font-normal ml-0.5">p/m²</span>
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-muted)' }}>Fruin Band</p>
            <span
              className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide"
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

      {/* ── Spawn Rate ────────────────────────────────────────────────── */}
      <div className="rounded-xl p-3 border" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
        <div className="flex justify-between items-center mb-1.5">
          <label className="font-bold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-muted)' }}>
            Spawn Rate
          </label>
          <span className="font-extrabold text-sm" style={{ color: 'var(--color-text)' }}>
            {spawnRate} <span className="text-[10px] font-normal">agents/sec</span>
          </span>
        </div>
        <input
          id="planner-spawn-rate"
          type="range" min={0} max={20} step={1}
          value={spawnRate}
          onChange={e => onSpawnRateChange(Number(e.target.value))}
          className="w-full accent-sky-600"
        />
      </div>

      {/* ── Population Cap ────────────────────────────────────────────── */}
      <div className="rounded-xl p-3 border" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
        <div className="flex justify-between items-center mb-1.5">
          <label className="font-bold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-muted)' }}>
            Population Cap
          </label>
          <span className={`font-extrabold text-sm ${maxAgents > 1000 ? 'text-amber-500' : ''}`}
                style={maxAgents <= 1000 ? { color: 'var(--color-text)' } : {}}>
            {maxAgents}
            {maxAgents > 1000 && <span className="text-[9px] ml-1 text-amber-500">(high)</span>}
          </span>
        </div>
        <input
          id="planner-max-agents"
          type="range" min={50} max={1500} step={50}
          value={maxAgents}
          onChange={e => onMaxAgentsChange(Number(e.target.value))}
          className="w-full accent-sky-600"
        />
        <p className="text-[9px] mt-1" style={{ color: 'var(--color-muted)' }}>
          {maxAgents > 1000 ? '⚠ Performance may degrade above 1000 on slower devices' : 'Tested stable up to 1500 on modern hardware'}
        </p>
      </div>

      {/* ── Active Spawn Points ──────────────────────────────────────── */}
      {spawns && spawns.length > 0 && (
        <div className="rounded-xl p-3 border" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
          <p className="font-bold uppercase tracking-wider text-[10px] mb-2" style={{ color: 'var(--color-muted)' }}>
            Active Spawn Points
          </p>
          {spawns.map(sp => (
            <label key={sp.id} className="flex items-center gap-2 cursor-pointer mb-1.5">
              <input
                type="checkbox"
                checked={activeSpawnIds.has(sp.id)}
                onChange={() => onToggleSpawn(sp.id)}
                className="accent-sky-600"
              />
              <span style={{ color: 'var(--color-text)' }}>{sp.name || sp.id}</span>
            </label>
          ))}
        </div>
      )}

      {/* ── Display Options ────────────────────────────────────────────── */}
      <div className="rounded-xl p-3 border" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
        <p className="font-bold uppercase tracking-wider text-[10px] mb-3" style={{ color: 'var(--color-muted)' }}>
          Display
        </p>

        <div className="flex justify-between items-center mb-1">
          <label className="text-[10px]" style={{ color: 'var(--color-muted)' }}>Heatmap Opacity</label>
          <span className="font-bold" style={{ color: 'var(--color-text)' }}>{Math.round(heatmapOpacity * 100)}%</span>
        </div>
        <input
          id="planner-heatmap-opacity"
          type="range" min={0} max={1} step={0.05}
          value={heatmapOpacity}
          onChange={e => onHeatmapOpacityChange(Number(e.target.value))}
          className="w-full accent-sky-600 mb-3"
        />

        <label className="flex items-center gap-2 cursor-pointer text-[10px]" style={{ color: 'var(--color-muted)' }}>
          <input
            id="planner-show-grid"
            type="checkbox"
            checked={showGrid}
            onChange={e => onShowGridChange(e.target.checked)}
            className="accent-sky-600"
          />
          Show density grid lines
        </label>
      </div>

      {/* ── Fruin Legend ──────────────────────────────────────────────── */}
      <div className="rounded-xl p-3 border" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
        <p className="font-bold uppercase tracking-wider text-[10px] mb-2" style={{ color: 'var(--color-muted)' }}>
          Fruin/Still Density Bands
        </p>
        {[
          { label: '< 1.08 p/m²',   text: 'LOS A/B — Free',        color: 'var(--risk-green)'  },
          { label: '1.08–2.15',     text: 'LOS C — Restricted',    color: 'var(--risk-yellow)' },
          { label: '2.15–3.8',      text: 'LOS D/E — Constrained', color: 'var(--risk-orange)' },
          { label: '> 3.8 p/m²',    text: 'LOS F — Crush Risk',    color: 'var(--risk-red)'    },
        ].map(b => (
          <div key={b.label} className="flex items-center gap-2 mb-1.5">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: b.color }} />
            <span style={{ color: b.color }} className="font-bold text-[9px] w-16 flex-shrink-0">{b.label}</span>
            <span className="text-[9px]" style={{ color: 'var(--color-muted)' }}>{b.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
