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
    id: 'STAMPEDE_RISK',
    label: 'Crowd Surge / Stampede Risk',
    sublabel: 'Dangerous crowding, pushing, or turbulence',
    severity: 'red',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-red-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    id: 'MEDICAL_EMERGENCY',
    label: 'Medical Emergency / Collapse',
    sublabel: 'Person injured, fainted, or needing immediate medical aid',
    severity: 'orange',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-amber-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    id: 'BLOCKED_EXIT',
    label: 'Blocked Exit / Egress Bottleneck',
    sublabel: 'Barricade, gate closure, or exit path obstruction',
    severity: 'orange',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-orange-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
      </svg>
    ),
  },
  {
    id: 'GENERAL_PANIC',
    label: 'General Emergency / SOS',
    sublabel: 'Immediate assistance needed in my immediate area',
    severity: 'red',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-rose-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.002A11.959 11.959 0 0112 2.714z" />
      </svg>
    ),
  },
]

const ZONES = [
  { id: 'zone_1', label: 'Zone 1 (Arrival & Waiting Staging Area)' },
  { id: 'zone_2', label: 'Zone 2 (Main Gathering Field)' },
]

export default function CitizenReportView({ socket, backendUrl }) {
  const [selectedCategory, setSelectedCategory] = useState('STAMPEDE_RISK')
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
              {/* Category Picker */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider font-mono-num" style={{ color: 'var(--color-muted)' }}>
                  1. Select Emergency Type
                </label>

                <div className="space-y-2">
                  {CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat.id
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`w-full p-3 rounded-xl border-2 text-left flex items-start gap-3 transition-all ${
                          isSelected ? 'ring-2 ring-rose-500 border-rose-500' : ''
                        }`}
                        style={{
                          background: isSelected ? 'var(--risk-red-bg)' : 'var(--color-bg)',
                          borderColor: isSelected ? 'var(--risk-red)' : 'var(--color-border)',
                        }}
                      >
                        <div className="mt-0.5 flex-shrink-0">{cat.icon}</div>
                        <div>
                          <div className="font-bold text-xs" style={{ color: 'var(--color-text)' }}>
                            {cat.label}
                          </div>
                          <div className="text-[11px] font-mono-num" style={{ color: 'var(--color-muted)' }}>
                            {cat.sublabel}
                          </div>
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
