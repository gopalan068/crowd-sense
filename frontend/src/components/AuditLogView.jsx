import React, { useState } from 'react'

export default function AuditLogView({ logs = [], playbookSteps = [], onRefresh }) {
  const [filter, setFilter] = useState('ALL')

  const filteredLogs = logs.filter((log) => {
    if (filter === 'PANIC') return log.alert_type === 'immediate_panic_alert'
    if (filter === 'ESCALATED') return Boolean(log.escalated_at)
    if (filter === 'ACKNOWLEDGED') return Boolean(log.acknowledged_at)
    return true
  })

  return (
    <div
      className="rounded-xl border shadow-sm flex flex-col overflow-hidden"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Table Header & Controls */}
      <div
        className="px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-hover)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📜</span>
          <h2 className="font-bold text-sm tracking-wide uppercase" style={{ color: 'var(--color-text)' }}>
            Read-Only Incident &amp; Playbook Audit Trail
          </h2>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 text-xs font-mono-num flex-wrap">
          {['ALL', 'PANIC', 'ESCALATED', 'ACKNOWLEDGED', 'PLAYBOOK STEPS'].map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-2.5 py-1 rounded font-bold transition-colors ${
                filter === mode
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
              }`}
            >
              {mode}
            </button>
          ))}
          <button
            onClick={onRefresh}
            className="px-2.5 py-1 rounded font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 ml-2"
          >
            ↻ REFRESH
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        {filter === 'PLAYBOOK STEPS' ? (
          /* Playbook Step Audit Table */
          <table className="w-full text-left border-collapse text-xs font-mono-num">
            <thead>
              <tr
                className="border-b uppercase font-bold tracking-wider"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'var(--color-bg)' }}
              >
                <th className="py-2.5 px-4">Log ID</th>
                <th className="py-2.5 px-4">Alert ID</th>
                <th className="py-2.5 px-4">Step #</th>
                <th className="py-2.5 px-4">Action Step Executed</th>
                <th className="py-2.5 px-4">Completed By</th>
                <th className="py-2.5 px-4">Completed At</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {playbookSteps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6" style={{ color: 'var(--color-muted)' }}>
                    No completed playbook action steps recorded yet. Check off steps in the response playbook to log them here.
                  </td>
                </tr>
              ) : (
                playbookSteps.map((step) => (
                  <tr
                    key={step.id || `${step.alert_id}-${step.step_index}`}
                    className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-bold text-slate-500">#{step.id}</td>
                    <td className="py-2.5 px-4 font-bold text-sky-600 dark:text-sky-400">{step.alert_id}</td>
                    <td className="py-2.5 px-4 font-extrabold text-emerald-600 dark:text-emerald-400">
                      Step {step.step_index + 1}
                    </td>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-900 dark:text-slate-100 max-w-md">
                      {step.step_text}
                    </td>
                    <td className="py-2.5 px-4 font-bold">{step.completed_by || 'Official'}</td>
                    <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400 font-bold">
                      {new Date(step.completed_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          /* Standard Alert Audit Table */
          <table className="w-full text-left border-collapse text-xs font-mono-num">
            <thead>
              <tr
                className="border-b uppercase font-bold tracking-wider"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'var(--color-bg)' }}
              >
                <th className="py-2.5 px-4">Alert ID</th>
                <th className="py-2.5 px-4">Zone</th>
                <th className="py-2.5 px-4">Severity</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Triggered At</th>
                <th className="py-2.5 px-4">Assigned To</th>
                <th className="py-2.5 px-4">Ack At</th>
                <th className="py-2.5 px-4">Ack By</th>
                <th className="py-2.5 px-4">Escalated To</th>
                <th className="py-2.5 px-4">Responder Status</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-6" style={{ color: 'var(--color-muted)' }}>
                    No audit log records found matching filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.alert_id}
                    className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-bold text-sky-600 dark:text-sky-400">{log.alert_id}</td>
                    <td className="py-2.5 px-4 font-bold">{log.zone_id}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className="px-2 py-0.5 rounded font-extrabold text-[10px] text-white"
                        style={{ background: log.severity === 'red' ? '#DC2626' : '#D97706' }}
                      >
                        {log.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[11px] font-semibold ${log.alert_type === 'immediate_panic_alert' ? 'text-red-600 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>
                        {log.alert_type === 'immediate_panic_alert' ? 'PANIC' : log.alert_type === 'citizen_report' ? 'CITIZEN' : 'GRADUATED'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">{new Date(log.triggered_at).toLocaleTimeString()}</td>
                    <td className="py-2.5 px-4 font-semibold">{log.assigned_to || '-'}</td>
                    <td className="py-2.5 px-4">
                      {log.acknowledged_at ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {new Date(log.acknowledged_at).toLocaleTimeString()}
                        </span>
                      ) : (
                        <span className="text-slate-400">UNACKED</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">{log.acknowledged_by || '-'}</td>
                    <td className="py-2.5 px-4">
                      {log.escalated_to ? (
                        <span className="text-amber-600 dark:text-amber-400 font-bold">{log.escalated_to}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {log.responder_status ? (
                        <span
                          className="px-2 py-0.5 rounded font-extrabold text-[10px] text-white"
                          style={{
                            background:
                              log.responder_status === 'resolved' ? 'var(--risk-green)' :
                              log.responder_status === 'need_backup' ? 'var(--risk-red)' :
                              log.responder_status === 'on_scene' ? 'var(--risk-orange)' :
                              'var(--color-accent)',
                          }}
                        >
                          {log.responder_status.replace('_', ' ').toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
