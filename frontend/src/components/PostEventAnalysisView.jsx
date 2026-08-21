/**
 * frontend/src/components/PostEventAnalysisView.jsx
 * Post-Event Timeline Analysis View.
 *
 * Combines chronological density graph with overlaid alert milestone markers
 * and an immutable read-only audit log table.
 */
import React, { useEffect, useState } from 'react'
import AuditLogView from './AuditLogView'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export default function PostEventAnalysisView({ auditLogs = [] }) {
  const [selectedZone, setSelectedZone] = useState('zone_1')
  const [timelineData, setTimelineData] = useState(null)

  const fetchTimeline = async (zoneId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/post-event-timeline?zone_id=${zoneId}`)
      if (res.ok) {
        const data = await res.json()
        setTimelineData(data)
      }
    } catch (err) {
      console.error('[PostEvent] Error fetching timeline:', err)
    }
  }

  useEffect(() => {
    fetchTimeline(selectedZone)
  }, [selectedZone, auditLogs])

  const alerts = timelineData?.alerts || []
  const summary = timelineData?.summary || {
    total_alerts: alerts.length,
    panic_alerts: alerts.filter((a) => a.alert_type === 'immediate_panic_alert').length,
    escalated_alerts: alerts.filter((a) => Boolean(a.escalated_at)).length,
    acknowledged_alerts: alerts.filter((a) => Boolean(a.acknowledged_at)).length,
  }

  return (
    <div className="space-y-6 font-mono-num">
      {/* Header Bar */}
      <div
        className="p-5 rounded-xl border flex flex-wrap items-center justify-between gap-4"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div>
          <h2 className="text-lg font-bold tracking-tight uppercase flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            📊 Post-Event Timeline Analysis &amp; Investigation
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            Chronological reconstruction of density build-up, threshold breaches, and official action timelines.
          </p>
        </div>

        {/* Zone Selector */}
        <div className="flex items-center gap-2">
          {['zone_1', 'zone_2', 'all'].map((zId) => (
            <button
              key={zId}
              onClick={() => setSelectedZone(zId)}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                selectedZone === zId
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {zId === 'all' ? 'ALL ZONES' : zId.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-slate-900 text-slate-100 border-slate-800">
          <p className="text-xs uppercase font-bold text-slate-400">Total Triggered Alerts</p>
          <p className="text-2xl font-extrabold text-sky-400 mt-1">{summary.total_alerts}</p>
        </div>
        <div className="p-4 rounded-xl border bg-slate-900 text-slate-100 border-slate-800">
          <p className="text-xs uppercase font-bold text-slate-400">Panic Signature Alerts</p>
          <p className="text-2xl font-extrabold text-red-400 mt-1">{summary.panic_alerts}</p>
        </div>
        <div className="p-4 rounded-xl border bg-slate-900 text-slate-100 border-slate-800">
          <p className="text-xs uppercase font-bold text-slate-400">Auto-Escalations</p>
          <p className="text-2xl font-extrabold text-amber-400 mt-1">{summary.escalated_alerts}</p>
        </div>
        <div className="p-4 rounded-xl border bg-slate-900 text-slate-100 border-slate-800">
          <p className="text-xs uppercase font-bold text-slate-400">Acknowledged Actions</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">{summary.acknowledged_alerts}</p>
        </div>
      </div>

      {/* Chronological Alert Markers Panel */}
      <div
        className="p-5 rounded-xl border space-y-4"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
          Incident Timeline &amp; Milestone Markers
        </h3>

        {alerts.length === 0 ? (
          <div className="py-8 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
            No incident alerts recorded for this selection.
          </div>
        ) : (
          <div className="relative border-l-2 border-sky-500/40 pl-6 ml-3 space-y-6">
            {alerts.map((alert) => (
              <div key={alert.alert_id} className="relative">
                {/* Marker Dot */}
                <div
                  className="absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-[10px]"
                  style={{ background: alert.alert_type === 'immediate_panic_alert' ? '#DC2626' : '#EA580C' }}
                />

                <div className="p-3 rounded-lg border bg-slate-900 text-slate-100 border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-sky-400">{alert.alert_id}</span>
                    <span className="text-[10px] text-slate-400">{new Date(alert.triggered_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-600 text-white">
                      {alert.alert_type === 'immediate_panic_alert' ? 'PANIC BYPASS' : 'GRADUATED RED'}
                    </span>
                    <span>Zone: <strong className="text-slate-200">{alert.zone_id}</strong></span>
                    <span>Assigned: <strong className="text-slate-200">{alert.assigned_to}</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Read-Only Incident Audit Log Table */}
      <AuditLogView logs={auditLogs} onRefresh={() => fetchTimeline(selectedZone)} />
    </div>
  )
}
