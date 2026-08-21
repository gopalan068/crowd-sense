/**
 * frontend/src/components/AuditLogView.jsx
 * Timestamped Audit Log Table displaying complete alert history in docs/api-contract.md §3 shape.
 */
import React, { useState } from 'react'

export default function AuditLogView({ logs = [], onRefresh }) {
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
            Tamper-Evident Incident Audit Log
          </h2>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 text-xs font-mono-num">
          {['ALL', 'PANIC', 'ESCALATED', 'ACKNOWLEDGED'].map((mode) => (
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
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-6" style={{ color: 'var(--color-muted)' }}>
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
                      {log.alert_type === 'immediate_panic_alert' ? 'PANIC' : 'GRADUATED'}
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
