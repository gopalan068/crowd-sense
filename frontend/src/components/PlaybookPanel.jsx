/**
 * frontend/src/components/PlaybookPanel.jsx
 * Incident Response Playbook Component (Decision Support Panel).
 *
 * Core Principles:
 *  1. Action steps & resource numbers are strictly static (from PLAYBOOK_TABLE).
 *  2. Real-time resource shortfall cross-referencing against checked-in responders in the zone.
 *  3. Contextual narrative wrapper (Groq LLM / fallback) framed as decision support only.
 *  4. Interactive step-by-step checklist logged to SQLite audit trail and synchronized in real time.
 *  5. Prominent, persistent decision-support honesty disclosures.
 */
import React, { useState, useEffect, useCallback } from 'react'

export default function PlaybookPanel({
  alert,
  backendUrl,
  socket,
  currentActor = 'official_1',
  defaultExpanded = false,
  hideToggle = false,
  isMobile = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || hideToggle)
  const [loading, setLoading] = useState(false)
  const [playbookData, setPlaybookData] = useState(null)
  const [completedStepsMap, setCompletedStepsMap] = useState({}) // step_index -> { completed_at, completed_by }
  const [completingIndex, setCompletingIndex] = useState(null)

  const alertId = typeof alert === 'string' ? alert : (alert?.alert_id || alert?.id || `alt_${Date.now()}`)
  const zoneId = alert?.zone_id || 'zone_1'

  const resolvedBackendUrl = (backendUrl !== undefined && backendUrl !== null && backendUrl !== '') ? backendUrl : ''

  // Fetch complete playbook package (protocol, shortfall, completed steps, narrative)
  const fetchPlaybook = useCallback(async () => {
    if (!alertId) return
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (alert?.zone_id) qs.set('zone_id', alert.zone_id)
      if (alert?.severity) qs.set('severity', alert.severity)
      if (alert?.alert_type) qs.set('alert_type', alert.alert_type)
      if (alert?.category) qs.set('category', alert.category)
      const queryStr = qs.toString() ? `?${qs.toString()}` : ''

      const baseUrl = resolvedBackendUrl || ''
      const res = await fetch(`${baseUrl}/api/alerts/${alertId}/playbook${queryStr}`)
      if (res.ok) {
        const data = await res.json()
        setPlaybookData(data)
        const stepMap = {}
          ; (data.completed_steps || []).forEach((s) => {
            stepMap[s.step_index] = s
          })
        setCompletedStepsMap(stepMap)
      } else {
        console.warn('[PlaybookPanel] Backend returned status:', res.status)
      }
    } catch (err) {
      console.error('[PlaybookPanel] Fetch error:', err)
    }
    setLoading(false)
  }, [alertId, resolvedBackendUrl, alert?.zone_id, alert?.severity, alert?.alert_type, alert?.category])

  // Initial load when expanded or rendered in open view
  useEffect(() => {
    if ((expanded || hideToggle) && !playbookData) {
      fetchPlaybook()
    }
  }, [expanded, hideToggle, playbookData, fetchPlaybook])

  // Listen for real-time socket events: step completions & responder check-ins
  useEffect(() => {
    if (!socket) return

    const handleStepCompleted = (stepRecord) => {
      if (stepRecord && stepRecord.alert_id === alertId) {
        setCompletedStepsMap((prev) => ({
          ...prev,
          [stepRecord.step_index]: stepRecord,
        }))
      }
    }

    const handleResponderCheckin = () => {
      // Re-evaluate shortfall live when any responder checks in or shifts zones
      if (expanded || hideToggle) {
        fetchPlaybook()
      }
    }

    socket.on('playbook_step_completed', handleStepCompleted)
    socket.on('responder_checkin', handleResponderCheckin)

    return () => {
      socket.off('playbook_step_completed', handleStepCompleted)
      socket.off('responder_checkin', handleResponderCheckin)
    }
  }, [socket, alertId, expanded, hideToggle, fetchPlaybook])

  // Handle clicking a checklist step
  const handleToggleStep = async (stepIndex, stepText) => {
    if (completedStepsMap[stepIndex] || completingIndex !== null) return // Already completed
    setCompletingIndex(stepIndex)

    const payload = {
      step_index: stepIndex,
      step_text: stepText,
      completed_by: currentActor || 'official_1',
    }

    // Optimistic local state
    const optimisticRecord = {
      step_index: stepIndex,
      step_text: stepText,
      completed_by: currentActor,
      completed_at: new Date().toISOString(),
    }
    setCompletedStepsMap((prev) => ({ ...prev, [stepIndex]: optimisticRecord }))

    // Emit via WebSocket for instant peer sync
    if (socket) {
      socket.emit('complete_playbook_step', {
        alert_id: alertId,
        ...payload,
      })
    }

    // Fallback REST call
    try {
      const baseUrl = resolvedBackendUrl || ''
      await fetch(`${baseUrl}/api/alerts/${alertId}/playbook-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      console.error('[PlaybookPanel] Step completion error:', err)
    }
    setCompletingIndex(null)
  }

  const playbook = playbookData?.playbook
  const shortfall = playbookData?.shortfall
  const narrative = playbookData?.narrative_wrapper
  const isNdma = playbook?.source === 'ndma_guideline'

  const totalSteps = playbook?.immediate_actions?.length || 0
  const completedCount = Object.keys(completedStepsMap).length

  return (
    <div className={`mt-2 border rounded-xl overflow-hidden font-sans ${hideToggle ? 'border-slate-800 bg-slate-900/90' : ''}`} style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
      {/* Expand / Collapse Header Bar (Only if not hideToggle) */}
      {!hideToggle && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left font-mono-num text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/60"
          style={{ background: 'var(--color-surface-hover)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">📋</span>
            <span className="font-extrabold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              Response Playbook
            </span>
            {playbook && (
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${isNdma
                  ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                  }`}
              >
                {isNdma ? '🏛️ NDMA Guideline' : '📋 Standard Default'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {totalSteps > 0 && (
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                {completedCount}/{totalSteps} steps completed
              </span>
            )}
            <span className="text-xs font-bold text-slate-500">
              {expanded ? '▲ Hide' : '▼ View Playbook'}
            </span>
          </div>
        </button>
      )}

      {/* Expanded Content Drawer */}
      {(expanded || hideToggle) && (
        <div className="p-4 space-y-3.5 border-t text-xs font-mono-num animate-fadeIn" style={{ borderColor: 'var(--color-border)' }}>
          {loading && !playbookData ? (
            <div className="py-4 text-center text-slate-500 font-mono-num animate-pulse">
              Loading verified response protocol &amp; resource audit...
            </div>
          ) : playbookData ? (
            <>

              {/* 2. Protocol Header & Authority Source Tag */}
              <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    {playbook?.title}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${isNdma
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-500/40'
                      }`}
                  >
                    {isNdma ? '✓ NDMA Guideline Grounded' : 'ℹ️ Illustrative Operational Default'}
                  </span>
                </div>
              </div>

              {/* 3. Resource Assessment & Live Shortfall Indicator */}
              <div className="p-3 rounded-lg border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-2 text-slate-900 dark:text-slate-100">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Resource Sufficiency &amp; Staging Check:
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="space-y-1 text-slate-700 dark:text-slate-300">
                    <div>
                      Recommended Personnel:{' '}
                      <strong className="text-slate-900 dark:text-slate-100 font-extrabold">
                        {shortfall?.required_personnel} responders
                      </strong>
                    </div>
                    <div>
                      Currently Checked in Near{' '}
                      <span className="font-extrabold text-slate-800 dark:text-slate-200">{shortfall?.zone_label}</span>:{' '}
                      <strong className="text-slate-900 dark:text-slate-100 font-extrabold">
                        {shortfall?.checked_in_personnel}
                      </strong>
                    </div>
                  </div>

                  <div>
                    {shortfall?.is_shortfall ? (
                      <span className="px-3 py-1 rounded-lg text-xs font-extrabold bg-rose-600 text-white flex items-center gap-1 shadow-xs animate-pulse">
                        <span>⚠️</span> SHORTFALL ({shortfall.shortfall_count} NEEDED) — REQUEST BACKUP
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-lg text-xs font-extrabold bg-emerald-600 text-white flex items-center gap-1 shadow-xs">
                        <span>✓</span> STAFFING SUFFICIENT ({shortfall?.checked_in_personnel}/{shortfall?.required_personnel})
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-4 flex-wrap">
                  <span>🚑 Ambulance Standby: <strong className="text-slate-900 dark:text-slate-100 font-bold">{shortfall?.ambulances > 0 ? `${shortfall.ambulances} Unit(s)` : 'Not mandatory'}</strong></span>
                  <span>🚪 Evac Team Required: <strong className="text-slate-900 dark:text-slate-100 font-bold">{shortfall?.evacuation_team ? 'YES (Active Deploy)' : 'No'}</strong></span>
                </div>
              </div>

              {/* 4. Contextual Narrative Wrapper (Gemini LLM or Deterministic Fallback) */}
              {narrative?.text && (
                <div className="p-3 rounded-lg border bg-sky-500/10 border-sky-500/30 space-y-1.5 shadow-xs">
                  <div
                    className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider"
                    style={{ color: '#0369A1' }}
                  >
                    <span className="flex items-center gap-1">
                      <span>💡</span> AI Contextual Prioritization Framing (Gemini Decision Support)
                    </span>
                    <span className="font-mono-num font-bold">
                      {narrative.source === 'gemini_llm' || narrative.source === 'groq_llm'
                        ? `Model: ${narrative.model || 'Gemini 2.5 Flash'}`
                        : 'Source: Deterministic Fallback'}
                    </span>
                  </div>
                  <p
                    className="text-xs leading-relaxed font-sans font-medium"
                    style={{ color: '#0F172A' }}
                  >
                    "{narrative.text}"
                  </p>
                  <p
                    className="text-[9px] font-mono-num font-bold opacity-90"
                    style={{ color: '#334155' }}
                  >
                    *Framing generated dynamically from current live context. Action steps and resource counts remain 100% static.
                  </p>
                </div>
              )}

              {/* 5. Step-by-Step Action Checklist */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Immediate Operational Action Steps (Tick when completed):
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Audit log auto-records every tick
                  </span>
                </div>

                <div className="space-y-1.5">
                  {(playbook?.immediate_actions || []).map((stepText, idx) => {
                    const isDone = Boolean(completedStepsMap[idx])
                    const record = completedStepsMap[idx]

                    return (
                      <label
                        key={idx}
                        className={`p-2.5 rounded-lg border flex items-start gap-3 transition-all cursor-pointer select-none ${isDone
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-slate-700 dark:text-slate-300'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-sky-500/50'
                          } ${isMobile ? 'min-h-[48px]' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isDone}
                          disabled={isDone || completingIndex === idx}
                          onChange={() => handleToggleStep(idx, stepText)}
                          className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer flex-shrink-0"
                        />

                        <div className="flex-1 text-xs space-y-0.5">
                          <div className={`font-semibold ${isDone ? 'line-through opacity-80' : 'text-slate-900 dark:text-slate-100'}`}>
                            <span className="font-mono-num font-bold text-sky-600 dark:text-sky-400 mr-1.5">
                              Step {idx + 1}:
                            </span>
                            {stepText}
                          </div>

                          {isDone && record && (
                            <div className="text-[10px] font-mono-num text-emerald-700 dark:text-emerald-400 font-medium">
                              ✓ Completed by <span className="font-bold">{record.completed_by || 'Official'}</span> at {new Date(record.completed_at).toLocaleTimeString()}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="py-2 text-center text-rose-500">
              Unable to load playbook protocol for this alert.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
