import React from 'react'
import PlaybookPanel from './PlaybookPanel'

export default function AlertPanel({
  alerts = [],
  onAcknowledgeAlert,
  socket,
  backendUrl,
}) {
  const activeUnacknowledged = alerts.filter((a) => !a.acknowledged_at)

  return (
    <div
      className="rounded-xl border shadow-sm flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Panel Header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-hover)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🚨</span>
          <h2 className="font-bold text-sm tracking-wide uppercase" style={{ color: 'var(--color-text)' }}>
            Active Incident Alerts
          </h2>
        </div>

        <span
          className="text-xs font-mono-num font-bold px-2 py-0.5 rounded-full border"
          style={{
            background: activeUnacknowledged.length > 0 ? 'var(--risk-red-bg)' : 'var(--risk-green-bg)',
            borderColor: activeUnacknowledged.length > 0 ? 'var(--risk-red-border)' : 'var(--risk-green-border)',
            color: activeUnacknowledged.length > 0 ? 'var(--risk-red)' : 'var(--risk-green)',
          }}
        >
          {activeUnacknowledged.length} ACTIVE
        </span>
      </div>

      {/* Alert List Container */}
      <div className="p-4 flex-1 overflow-y-auto space-y-3 min-h-[220px]">
        {activeUnacknowledged.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-8 text-center" style={{ color: 'var(--color-muted)' }}>
            <div className="w-12 h-12 rounded-full border-2 border-emerald-500/40 flex items-center justify-center text-xl text-emerald-600 mb-2">
              ✓
            </div>
            <p className="font-semibold text-sm">All Zones Normal</p>
            <p className="text-xs mt-1">No active crowd risk alerts requiring official acknowledgment.</p>
          </div>
        ) : (
          activeUnacknowledged.map((alert) => {
            const isPanic = alert.alert_type === 'immediate_panic_alert'
            const isEscalated = Boolean(alert.escalated_at && alert.escalated_to && !isPanic)

            return (
              <div
                key={alert.alert_id}
                className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                  isPanic ? 'animate-panic ring-2 ring-red-500' : ''
                }`}
                style={{
                  background: isPanic ? 'var(--risk-red-bg)' : 'var(--color-bg)',
                  borderColor: isPanic ? 'var(--risk-red)' : 'var(--color-border)',
                }}
              >
                {/* Alert Top Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-extrabold uppercase font-mono-num border"
                        style={{
                          background: isPanic ? '#DC2626' : 'var(--risk-red)',
                          color: '#FFFFFF',
                          borderColor: 'transparent',
                        }}
                      >
                        {isPanic ? '🛑 IMMEDIATE PANIC ALERT' : alert.alert_type === 'citizen_report' ? '📱 CITIZEN EMERGENCY REPORT' : '⚠️ RED ALERT'}
                      </span>
                      <span className="text-xs font-bold font-mono-num uppercase" style={{ color: 'var(--color-text)' }}>
                        ZONE: {alert.zone_id}
                      </span>
                    </div>

                    {alert.category && (
                      <div className="mt-1 font-mono-num text-[11px] font-extrabold px-2 py-0.5 rounded bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-xs w-fit">
                        🚨 REPORTED ISSUE: {(alert.category || '').replace(/_/g, ' ')}
                      </div>
                    )}

                    <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                      Triggered at:{' '}
                      <span className="font-mono-num font-semibold text-slate-800 dark:text-slate-200">
                        {new Date(alert.triggered_at).toLocaleTimeString()}
                      </span>
                    </p>
                  </div>

                  {/* Assigned / Escalation Badge */}
                  <div className="text-right">
                    <span className="text-[11px] font-bold px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono-num block">
                      ASSIGNED: {alert.assigned_to || 'official_1'}
                    </span>
                    {isEscalated && (
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-1 block">
                        AUTO-ESCALATED → {alert.escalated_to}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description & Action Button Row */}
                <div className="pt-2 border-t flex items-center justify-between gap-4" style={{ borderColor: 'var(--color-border)' }}>
                  <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {alert.description
                      ? `"${alert.description}"`
                      : isPanic
                      ? 'Panic signature detected! Dispatched to all field officials.'
                      : 'Unacknowledged alert auto-escalates if unresponded.'}
                  </p>

                  <button
                    onClick={() => onAcknowledgeAlert(alert.alert_id)}
                    className="px-4 py-2 rounded-lg font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5 focus-visible:ring-2"
                    style={{
                      background: 'var(--risk-green)',
                      color: '#FFFFFF',
                    }}
                  >
                    <span>✓</span> ACKNOWLEDGE ALERT
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
