/**
 * frontend/src/components/CitizenReportView.jsx
 * Citizen Emergency Reporting App — Crowd-Facing SOS & Incident Reporting Portal.
 *
 * Styled as a mobile app interface for crowd members attending an event.
 * Feeds directly into the same alert pipeline:
 *   1. User submits report -> POST /api/citizen-reports
 *   2. Alert immediately pops up on Command Dashboard & Field Responder view
 *   3. When field responder updates status (EN ROUTE / ON SCENE / RESOLVED),
 *      this view updates live in real-time over Socket.io!
 */
import React, { useState, useEffect } from 'react'

const CATEGORIES = [
  {
    id: 'MEDICAL_ASSISTANCE',
    label: 'Medical Assistance',
    severity: 'red',
    bgColor: 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    id: 'SUSPICIOUS_ACTIVITY',
    label: 'Suspicious Activity',
    severity: 'orange',
    bgColor: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12c.074-.154 1.038-2.01 2.92-3.834C6.883 6.34 9.387 5.25 12 5.25c2.613 0 5.117 1.09 7.044 2.916 1.882 1.824 2.846 3.68 2.92 3.834a.75.75 0 010 .666c-.074.154-1.038 2.01-2.92 3.834C17.117 18.41 14.613 19.5 12 19.5c-2.613 0-5.117-1.09-7.044-2.916-1.882-1.824-2.846-3.68-2.92-3.834a.75.75 0 010-.666z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    ),
  },
  {
    id: 'REPORT_THEFT',
    label: 'Report Theft',
    severity: 'orange',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
  {
    id: 'BLOCKED_EXITS',
    label: 'Blocked Exits',
    severity: 'orange',
    bgColor: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
      </svg>
    ),
  },
]

const ZONES = [
  { id: 'zone_1', label: 'Zone 1 (Arrival & Waiting Staging Area)' },
  { id: 'zone_2', label: 'Zone 2 (Main Gathering Field)' },
]

export default function CitizenReportView({ socket, backendUrl }) {
  const [selectedCategory, setSelectedCategory] = useState('MEDICAL_ASSISTANCE')
  const [selectedZone, setSelectedZone] = useState('zone_1')
  const [reporterName, setReporterName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedAlert, setSubmittedAlert] = useState(null)
  const [error, setError] = useState(null)

  // Listen for live responder status updates on our submitted report!
  useEffect(() => {
    if (!socket || !submittedAlert) return

    const handleStatusUpdate = (updatedAlert) => {
      if (updatedAlert && updatedAlert.alert_id === submittedAlert.alert_id) {
        setSubmittedAlert((prev) => ({ ...prev, ...updatedAlert }))
      }
    }

    const handleAck = (updatedAlert) => {
      if (updatedAlert && updatedAlert.alert_id === submittedAlert.alert_id) {
        setSubmittedAlert((prev) => ({ ...prev, ...updatedAlert }))
      }
    }


    socket.on('alert_status_updated', handleStatusUpdate)
    socket.on('alert_acknowledged', handleAck)

    return () => {
      socket.off('alert_status_updated', handleStatusUpdate)
      socket.off('alert_acknowledged', handleAck)
    }
  }, [socket, submittedAlert])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`${backendUrl}/api/citizen-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          zone_id: selectedZone,
          description: description.trim() || undefined,
          reporter_name: reporterName.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to submit emergency report.')
        setSubmitting(false)
        return
      }

      const data = await res.json()
      setSubmittedAlert(data.alert)
    } catch (err) {
      console.error('[CitizenReportView] Submit error:', err)
      setError('Cannot connect to safety system network.')
    }
    setSubmitting(false)
  }

  const handleReset = () => {
    setSubmittedAlert(null)
    setDescription('')
    setError(null)
  }

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden font-sans" style={{ background: 'var(--color-surface)' }}>
      {/* Top Status Bar Decoration */}
      <div
        className="px-4 py-2 flex items-center justify-between text-[11px] font-mono-num border-b flex-shrink-0"
        style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
      >
        <span className="font-bold">📱 CITIZEN SOS PORTAL</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          SAFETY NET ACTIVE
        </span>
      </div>

        {/* View Header */}
        <div
          className="p-5 border-b space-y-1 text-center"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center text-white font-extrabold text-xl shadow-md bg-rose-600 mb-2">
            🆘
          </div>
          <h1 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--color-text)' }}>
            Report Incident / Emergency
          </h1>
          <p className="text-xs font-mono-num" style={{ color: 'var(--color-muted)' }}>
            Alert event safety control and nearby field responders immediately.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          {submittedAlert ? (
            /* Real-Time Report Tracker Card */
            <div className="space-y-4 animate-fadeIn">
              <div
                className="p-4 rounded-2xl border-2 space-y-3"
                style={{
                  background: 'var(--risk-red-bg)',
                  borderColor: 'var(--risk-red)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold text-white bg-rose-600 uppercase">
                    SOS REPORT SUBMITTED
                  </span>
                  <span className="text-xs font-mono-num opacity-75">
                    {new Date(submittedAlert.triggered_at).toLocaleTimeString()}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="font-extrabold text-base uppercase" style={{ color: 'var(--color-text)' }}>
                    {(submittedAlert?.category || 'CITIZEN_EMERGENCY').replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs font-mono-num text-slate-700 dark:text-slate-300">
                    Location: <span className="font-bold">{submittedAlert?.zone_id === 'zone_2' ? 'Zone 2 (Main Field)' : 'Zone 1 (Arrival)'}</span>
                  </div>
                </div>

                {/* Status Timeline */}
                <div
                  className="p-3 rounded-xl border bg-white dark:bg-slate-900 space-y-2 font-mono-num text-xs"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Live Response Status:
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Report Received by Control Room
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${submittedAlert.acknowledged_at ? 'bg-emerald-500' : 'bg-amber-400 animate-ping'}`} />
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {submittedAlert.acknowledged_at
                        ? `Acknowledged by ${submittedAlert.acknowledged_by || 'Responder'}`
                        : 'Alerting Field Responders...'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${submittedAlert.responder_status ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {submittedAlert.responder_status
                        ? `Status: ${submittedAlert.responder_status.replace('_', ' ').toUpperCase()}`
                        : 'Awaiting Responder Status...'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="w-full py-3 rounded-xl border font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
              >
                + Submit Another Report
              </button>
            </div>
          ) : (
            /* Emergency Report Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Category Picker — 2x2 Equal-Sized Square Grid */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider font-mono-num" style={{ color: 'var(--color-muted)' }}>
                  Select Incident Category
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  {CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat.id
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`p-2.5 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all cursor-pointer active:scale-95 relative h-24 ${
                          isSelected
                            ? 'ring-2 ring-rose-500/40 border-rose-600 bg-white dark:bg-slate-900 shadow-md'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 shadow-xs'
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[9px] font-extrabold shadow-xs">
                            ✓
                          </span>
                        )}

                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 shadow-xs ${cat.bgColor}`}>
                          {cat.icon}
                        </div>

                        <div className={`text-[11px] font-extrabold leading-tight text-center ${isSelected ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                          {cat.label}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Zone Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider font-mono-num" style={{ color: 'var(--color-muted)' }}>
                  2. Select Your Current Zone
                </label>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-xs font-mono-num font-bold focus:outline-none"
                  style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  {ZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Name/Details */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider font-mono-num" style={{ color: 'var(--color-muted)' }}>
                  3. Details (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Near Gate A exit turnstiles"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-xs font-mono-num"
                  style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl border text-xs font-mono-num text-rose-600 bg-rose-50 border-rose-200">
                  {error}
                </div>
              )}

              {/* Large SOS Button */}
              <button
                type="submit"
                disabled={submitting}
                className="touch-target w-full rounded-2xl font-extrabold text-base text-white bg-rose-600 hover:bg-rose-500 shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {submitting ? 'SENDING SOS...' : '🚨 SEND EMERGENCY REPORT'}
              </button>
            </form>
          )}
        </div>

        {/* Footer disclosure */}
        <div
          className="p-3 border-t text-[10px] font-mono-num text-center flex-shrink-0"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'var(--color-bg)' }}
        >
          Anonymous emergency dispatch portal. Alerts feed directly to Command Center &amp; Field Patrols.
        </div>
    </div>
  )
}
