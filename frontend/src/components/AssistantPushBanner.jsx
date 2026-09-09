import React from 'react'

/**
 * frontend/src/components/AssistantPushBanner.jsx
 *
 * Prominent push-first action instruction display for live control room operators.
 * Automatically displays the moment a system alert or threshold crossing event fires.
 *
 * Grounded in live data and deterministic rules with explicit decision-support disclaimer.
 */
export default function AssistantPushBanner({ instructions = [], onDismiss }) {
  if (!instructions || instructions.length === 0) return null

  const getSeverityStyles = (severity, eventType, inst = {}) => {
    const isCitizen = inst.alertType === 'citizen_report' || Boolean(inst.category)
    const isPanic = eventType === 'alert_panic' || severity === 'red' || (isCitizen && (inst.category === 'STAMPEDE_RISK' || inst.category === 'GENERAL_PANIC'))
    const isOrange = severity === 'orange'
    const isYellow = severity === 'yellow'

    if (isCitizen) {
      return {
        bg: isPanic ? 'var(--risk-red-bg)' : 'var(--risk-orange-bg)',
        border: isPanic ? 'var(--risk-red)' : 'var(--risk-orange)',
        text: isPanic ? 'var(--risk-red)' : 'var(--risk-orange)',
        badgeBg: isPanic ? '#DC2626' : '#EA580C',
        badgeText: '#FFFFFF',
        icon: '📱',
        label: `CITIZEN SOS GUIDANCE${inst.category ? `: ${inst.category.replace(/_/g, ' ')}` : ''}`,
        pulse: isPanic ? 'animate-panic ring-2 ring-red-500' : 'ring-1 ring-orange-500',
      }
    }

    if (isPanic) {
      return {
        bg: 'var(--risk-red-bg)',
        border: 'var(--risk-red)',
        text: 'var(--risk-red)',
        badgeBg: '#DC2626',
        badgeText: '#FFFFFF',
        icon: '🚨',
        label: isPanic ? 'IMMEDIATE ACTION GUIDANCE' : 'CRITICAL GUIDANCE',
        pulse: 'animate-panic ring-2 ring-red-500',
      }
    }
    if (isOrange) {
      return {
        bg: 'var(--risk-orange-bg)',
        border: 'var(--risk-orange)',
        text: 'var(--risk-orange)',
        badgeBg: '#EA580C',
        badgeText: '#FFFFFF',
        icon: '⚠️',
        label: 'ELEVATED FLOW GUIDANCE',
        pulse: '',
      }
    }
    if (isYellow) {
      return {
        bg: 'var(--risk-yellow-bg)',
        border: 'var(--risk-yellow)',
        text: 'var(--risk-yellow)',
        badgeBg: '#CA8A04',
        badgeText: '#FFFFFF',
        icon: 'ℹ️',
        label: 'MONITORING ADVISORY',
        pulse: '',
      }
    }
    return {
      bg: 'var(--risk-green-bg)',
      border: 'var(--risk-green)',
      text: 'var(--risk-green)',
      badgeBg: '#16A34A',
      badgeText: '#FFFFFF',
      icon: '✓',
      label: 'SYSTEM ADVISORY',
      pulse: '',
    }
  }

  const cleanDisplayInstruction = (text, zoneId, severity) => {
    if (!text) return `${zoneId || 'Zone'} is now ${severity || 'active'}. Monitor sector closely.`
    let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    if (clean.includes('<think>')) {
      clean = clean.replace(/<think>[\s\S]*/gi, '').trim()
    }
    clean = clean.replace(/<\/think>/gi, '').trim()
    clean = clean.replace(/^Here'?s\s+a\s+thinking\s+process:?[\s\S]*?(?=\n\n|\n[A-Z0-9]|$)/i, '').trim()
    if (!clean || clean.startsWith("Here's a thinking process")) {
      return `${zoneId || 'Zone'} is now ${severity || 'active'}. Deploy patrol marshals to observe transition flow and verify emergency corridors remain unobstructed.`
    }
    return clean
  }

  return (
    <div className="space-y-3 w-full transition-all">
      {instructions.map((inst, index) => {
        const style = getSeverityStyles(inst.severity, inst.eventType, inst)
        const zoneLabel = inst.zoneId === 'zone_2' ? 'ZONE 2 (CORRIDOR)' : inst.zoneId === 'zone_1' ? 'ZONE 1 (GENERAL)' : (inst.zoneId || 'VENUE')
        const formattedTime = inst.timestamp ? new Date(inst.timestamp).toLocaleTimeString() : 'Just now'
        const isCitizen = inst.alertType === 'citizen_report' || Boolean(inst.category)
        const displayText = cleanDisplayInstruction(inst.text, zoneLabel, inst.severity)

        return (
          <div
            key={inst.instructionId || `inst_${index}`}
            className={`p-4 rounded-xl border shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${style.pulse}`}
            style={{
              background: style.bg,
              borderColor: style.border,
            }}
          >
            {/* Left Content Area */}
            <div className="flex items-start gap-3.5 flex-1">
              <span className="text-2xl mt-0.5">{style.icon}</span>

              <div className="space-y-1 flex-1">
                {/* Header meta badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="px-2.5 py-0.5 rounded text-[11px] font-extrabold uppercase font-mono-num tracking-wide"
                    style={{ background: style.badgeBg, color: style.badgeText }}
                  >
                    {isCitizen ? '📱 CITIZEN SOS GUIDANCE' : `🤖 ASSISTANT: ${style.label}`}
                  </span>

                  {isCitizen && inst.category && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-extrabold font-mono-num bg-rose-600 text-white shadow-xs">
                      🚨 ISSUE: {inst.category.replace(/_/g, ' ')}
                    </span>
                  )}

                  <span
                    className="px-2 py-0.5 rounded text-[11px] font-bold font-mono-num border bg-slate-900/10 dark:bg-white/10"
                    style={{ color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
                  >
                    TARGET: {zoneLabel}
                  </span>

                  <span className="text-[11px] font-mono-num opacity-75" style={{ color: 'var(--color-muted)' }}>
                    🕒 {formattedTime}
                  </span>

                  {inst.source && (
                    <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 opacity-70">
                      {inst.source === 'groq_llm' ? '⚡ FAST LLM' : '🔒 DETERMINISTIC FALLBACK'}
                    </span>
                  )}
                </div>

                {/* Main Instruction Text */}
                <p className="text-sm md:text-base font-bold tracking-tight mt-1" style={{ color: 'var(--color-text)' }}>
                  {displayText}
                </p>

                {/* Grounding / Disclaimer Footnote */}
                <div className="flex items-center gap-2 text-[11px] opacity-80 pt-0.5" style={{ color: 'var(--color-muted)' }}>
                  {inst.triggeringEventId && (
                    <span className="hidden sm:inline font-mono-num">
                      (Ref ID: {inst.triggeringEventId.substring(0, 16)}...)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Action: Dismiss */}
            <div className="flex items-center gap-2 self-end md:self-center">
              <button
                onClick={() => onDismiss && onDismiss(inst.instructionId || index)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold font-mono-num transition-all hover:bg-black/10 dark:hover:bg-white/10 border"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
                title="Dismiss Instruction"
              >
                ✕ DISMISS
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
