/**
 * frontend/src/components/ResponderCheckin.jsx
 * Responder zone check-in form.
 *
 * Zone selection uses labeled buttons (not a second map render).
 * Zone IDs ('zone_1', 'zone_2') match the existing venue map identifiers.
 * Check-in calls POST /api/responders/checkin — no GPS, no automatic tracking.
 */
import React, { useState } from 'react'

const ZONES = [
  { id: 'zone_1', label: 'Zone 1', sublabel: 'Arrival / Waiting Staging Area' },
  { id: 'zone_2', label: 'Zone 2', sublabel: 'Main Gathering Field' },
]

export default function ResponderCheckin({ backendUrl, onCheckedIn }) {
  const [name, setName] = useState('')
  const [selectedZone, setSelectedZone] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !selectedZone) {
      setError('Enter your name/team ID and select your current zone.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const responderId = `responder_${name.trim().toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`
      const res = await fetch(`${backendUrl}/api/responders/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responder_id: responderId,
          name: name.trim(),
          zone_id: selectedZone,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Check-in failed. Try again.')
        setSubmitting(false)
        return
      }

      const data = await res.json()
      onCheckedIn(data.responder)
    } catch (err) {
      setError('Cannot reach backend. Is the server running?')
      console.error('[ResponderCheckin] Error:', err)
    }
    setSubmitting(false)
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-start p-4 overflow-y-auto min-h-0" style={{ background: 'var(--color-bg)' }}>
      <div
        className="w-full rounded-2xl border shadow-sm p-5 space-y-5 my-auto"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold text-sm shadow"
              style={{ background: 'var(--color-accent)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight" style={{ color: 'var(--color-text)' }}>
                Responder Check-In
              </h1>
              <p className="text-xs font-mono-num" style={{ color: 'var(--color-muted)' }}>
                CrowdSense Field Operations — Select your current zone
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name / Team ID */}
          <div className="space-y-1.5">
            <label
              htmlFor="responder-name"
              className="block text-xs font-bold uppercase tracking-wider font-mono-num"
              style={{ color: 'var(--color-muted)' }}
            >
              Name / Team ID
            </label>
            <input
              id="responder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Team Alpha or Officer Singh"
              autoComplete="off"
              className="w-full px-4 py-3 rounded-xl border text-sm font-mono-num focus:outline-none focus-visible:ring-2 transition-colors"
              style={{
                background: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>

          {/* Zone Picker */}
          <div className="space-y-1.5">
            <span
              className="block text-xs font-bold uppercase tracking-wider font-mono-num"
              style={{ color: 'var(--color-muted)' }}
            >
              Current Zone — Select one
            </span>
            <div className="grid grid-cols-1 gap-3">
              {ZONES.map((zone) => {
                const isSelected = selectedZone === zone.id
                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => setSelectedZone(zone.id)}
                    className="w-full px-4 py-3.5 rounded-xl border-2 text-left transition-all active:scale-98"
                    style={{
                      background: isSelected ? 'var(--color-accent)' : 'var(--color-bg)',
                      borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
                      color: isSelected ? '#FFFFFF' : 'var(--color-text)',
                    }}
                  >
                    <span className="font-bold text-sm block">{zone.label}</span>
                    <span
                      className="text-xs font-mono-num"
                      style={{ color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--color-muted)' }}
                    >
                      {zone.sublabel}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] font-mono-num" style={{ color: 'var(--color-muted)' }}>
              Re-select to update your zone if you move. Zone is not tracked automatically.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="px-4 py-3 rounded-xl border text-sm font-mono-num"
              style={{
                background: 'var(--risk-red-bg)',
                borderColor: 'var(--risk-red-border)',
                color: 'var(--risk-red)',
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="touch-target w-full rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'var(--risk-green)' }}
          >
            {submitting ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking in...
              </>
            ) : (
              'CHECK IN'
            )}
          </button>
        </form>

        {/* Honesty note */}
        <div
          className="pt-4 border-t text-[11px] font-mono-num leading-relaxed"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
        >
          Alerts delivered via live in-app WebSocket feed + audio cue.
          Keep this tab open — no OS push notifications are used.
        </div>
      </div>
    </div>
  )
}
