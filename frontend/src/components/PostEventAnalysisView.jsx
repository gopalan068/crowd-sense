/**
 * frontend/src/components/PostEventAnalysisView.jsx
 * Post-Event Timeline Analysis & Capstone Report Generator View.
 *
 * Provides dual capabilities:
 * 1. Chronological density timeline & immutable read-only audit log table.
 * 2. Capstone Post-Event Report Generator powered by Groq's LLM API (with honest local fallback,
 *    demo-safe caching, and print-to-PDF export).
 */
import React, { useEffect, useState } from 'react'
import AuditLogView from './AuditLogView'
import PostEventReportDocument from './PostEventReportDocument'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:4000`

export default function PostEventAnalysisView({ auditLogs = [], initialSubTab = 'REPORT' }) {
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab || 'REPORT') // 'REPORT' | 'TIMELINE'
  const [selectedZone, setSelectedZone] = useState('all')
  const [includeSimulatedRef, setIncludeSimulatedRef] = useState(false)
  const [timelineData, setTimelineData] = useState(null)

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab)
    }
  }, [initialSubTab])

  // Report Generation State
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState('')
  const [currentReport, setCurrentReport] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  // Fetch timeline analysis data
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

  // Fetch latest saved report (Demo Safety Fallback)
  const fetchLatestReport = async (silent = false) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/reports/latest`)
      if (res.ok) {
        const data = await res.json()
        if (data.report) {
          setCurrentReport(data.report)
          setErrorMessage(null)
          return true
        }
      } else if (!silent) {
        setErrorMessage('No previously saved report found in cache. Click "Generate Report" to create one.')
      }
    } catch (err) {
      if (!silent) {
        console.error('[PostEvent] Error fetching latest report:', err)
        setErrorMessage('Failed to load cached report from backend.')
      }
    }
    return false
  }

  useEffect(() => {
    fetchTimeline(selectedZone)
  }, [selectedZone, auditLogs])

  // Try to load cached report on initial mount for instant viewing
  useEffect(() => {
    fetchLatestReport(true)
  }, [])

  // Trigger Report Generation
  const handleGenerateReport = async () => {
    setIsGenerating(true)
    setErrorMessage(null)
    setGenerationStep('Aggregating SQLite density history & incident audit trails...')

    try {
      setTimeout(() => {
        setGenerationStep('Computing standout accountability metrics (time-to-ack, escalations)...')
      }, 600)

      setTimeout(() => {
        setGenerationStep('Querying Google Gemini API (gemini-3.6-flash) for comprehensive post-incident synthesis...')
      }, 1200)

      const response = await fetch(`${BACKEND_URL}/api/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: selectedZone,
          include_simulated_reference: includeSimulatedRef,
          venue_name: selectedZone === 'all'
            ? 'City Central Gathering Ground & Corridor Complex'
            : selectedZone === 'zone_1'
              ? 'Zone 1 — Arrival & General Waiting Staging'
              : 'Zone 2 — Emergency Corridor & Gate Throat',
        }),
      })

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}))
        throw new Error(errJson.error || `Server responded with HTTP ${response.status}`)
      }

      const data = await response.json()
      if (data.report) {
        setCurrentReport(data.report)
        setActiveSubTab('REPORT')
      } else {
        throw new Error('Invalid report payload received from server.')
      }
    } catch (err) {
      console.error('[PostEvent] Report generation error:', err)
      setErrorMessage(`Report generation notice: ${err.message}. Loading cached fallback if available.`)
      // Try fallback to last saved report
      await fetchLatestReport(false)
    } finally {
      setIsGenerating(false)
      setGenerationStep('')
    }
  }

  const alerts = timelineData?.alerts || []
  const summary = timelineData?.summary || {
    total_alerts: alerts.length,
    panic_alerts: alerts.filter((a) => a.alert_type === 'immediate_panic_alert').length,
    escalated_alerts: alerts.filter((a) => Boolean(a.escalated_at)).length,
    acknowledged_alerts: alerts.filter((a) => Boolean(a.acknowledged_at)).length,
  }

  return (
    <div className="space-y-6 font-mono-num">
      {/* ── Top Header & Report Action Command Center ──── */}
      <div
        className="p-6 rounded-2xl border shadow-sm space-y-5"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <h2 className="text-lg font-bold tracking-tight uppercase" style={{ color: 'var(--color-text)' }}>
                Post-Event Safety Intelligence &amp; Capstone Report
              </h2>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
              Reconstructs density build-up, threshold breaches, official response timelines, and compiles formal AI post-event reports.
            </p>
          </div>

          {/* Sub-Tab Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('REPORT')}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${activeSubTab === 'REPORT'
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                }`}
            >
              <span>📄 FORMAL SAFETY REPORT</span>
            </button>

            <button
              onClick={() => setActiveSubTab('TIMELINE')}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${activeSubTab === 'TIMELINE'
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                }`}
            >
              <span>📈 TIMELINE &amp; AUDIT LOGS</span>
            </button>
          </div>
        </div>

        {/* Report Generation Parameter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Zone Selector */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-xs font-bold text-slate-500 uppercase mr-1">Scope:</span>
              {['all', 'zone_1', 'zone_2'].map((zId) => (
                <button
                  key={zId}
                  onClick={() => setSelectedZone(zId)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${selectedZone === zId
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                >
                  {zId === 'all' ? 'ALL ZONES' : zId.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Simulated Reference Figures Toggle */}
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none px-3 py-1.5 rounded-lg border bg-slate-50 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700">
              <input
                type="checkbox"
                checked={includeSimulatedRef}
                onChange={(e) => setIncludeSimulatedRef(e.target.checked)}
                className="rounded text-sky-600 focus:ring-sky-500"
              />
              <span className="text-slate-700 dark:text-slate-300 font-bold">
                Include Simulated Reference Capacity (1,800 Ticketed Baseline)
              </span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fetchLatestReport(false)}
              disabled={isGenerating}
              className="px-3.5 py-2 rounded-xl border bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5"
              title="Quickly load the most recently generated report from SQLite cache without regenerating"
            >
              <span>📥 Load Cached Report (Demo Safety)</span>
            </button>

            <button
              onClick={handleGenerateReport}
              disabled={isGenerating}
              className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-lg transition-all flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>GENERATING REPORT...</span>
                </>
              ) : (
                <>
                  <span>⚡ GENERATE OFFICIAL REPORT</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Generation Progress Indicator Banner */}
        {isGenerating && (
          <div className="p-4 rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 text-xs space-y-2 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-sky-500 animate-pulse" />
              <span className="font-bold uppercase tracking-wider">Report Synthesis Pipeline Active</span>
            </div>
            <p className="text-[11px] text-sky-700 dark:text-sky-300 font-mono-num">{generationStep}</p>
          </div>
        )}

        {/* Notice / Error message */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-amber-600 font-bold ml-2">✕</button>
          </div>
        )}
      </div>

      {/* ── Sub-Tab 1: Capstone Formal Post-Event Report ──── */}
      {activeSubTab === 'REPORT' && (
        <PostEventReportDocument
          report={currentReport}
          onRegenerate={handleGenerateReport}
        />
      )}

      {/* ── Sub-Tab 2: Operational Timeline & Audit Logs ──── */}
      {activeSubTab === 'TIMELINE' && (
        <div className="space-y-6">
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
      )}
    </div>
  )
}
