/**
 * frontend/src/components/ResponderDashboard.jsx
 * Field Responder Operations View — Part A shell.
 *
 * Uses the SAME socket instance passed from App.jsx — no second WebSocket
 * connection is opened. (Verified in acceptance test step 10.)
 *
 * Audio cue: Web Audio API, no file dependency, works offline.
 *   - Graduated alert: 440 Hz, single 0.3s beep
 *   - Panic alert: 880 Hz, 3 rapid pulses
 * Mute toggle suppresses all audio. No OS push notifications used.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react'
import ResponderCheckin from './ResponderCheckin'
import ResponderAlertCard from './ResponderAlertCard'
import ConnectionStatusBanner from './ConnectionStatusBanner'
import ActiveIncidentResponseModal from './ActiveIncidentResponseModal'

// ── Web Audio cue ─────────────────────────────────────────────────────────────
// No file dependency — uses AudioContext oscillator, works offline.
function playAlertTone(isPanic, muted) {
  if (muted) return
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const playBeep = (freq, startTime, duration) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.4, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }
    if (isPanic) {
      // 3 rapid pulses at 880Hz for panic
      playBeep(880, ctx.currentTime, 0.18)
      playBeep(880, ctx.currentTime + 0.25, 0.18)
      playBeep(880, ctx.currentTime + 0.50, 0.18)
    } else {
      // Single 440Hz beep for graduated escalation
      playBeep(440, ctx.currentTime, 0.30)
    }
    // Close AudioContext after tone to release resources
    setTimeout(() => ctx.close(), 1500)
  } catch (err) {
    // AudioContext may fail in restricted environments — silently ignore
    console.warn('[ResponderDashboard] Audio cue unavailable:', err.message)
  }
}

// ── Alert sort order ─────────────────────────────────────────────────────────
// Panic first, then unacknowledged red, then everything else.
function sortAlerts(alerts) {
  if (!Array.isArray(alerts)) return []
  return [...alerts].filter(Boolean).sort((a, b) => {
    const scoreA =
      a.alert_type === 'immediate_panic_alert' ? 0 :
      !a.acknowledged_at ? 1 : 2
    const scoreB =
      b.alert_type === 'immediate_panic_alert' ? 0 :
      !b.acknowledged_at ? 1 : 2
    if (scoreA !== scoreB) return scoreA - scoreB
    const tA = a.triggered_at ? new Date(a.triggered_at).getTime() : 0
    const tB = b.triggered_at ? new Date(b.triggered_at).getTime() : 0
    return tB - tA
  })
}

export default function ResponderDashboard({
  socket,
  backendUrl,
  connected,
  reconnectCount,
  onRetry,
  activeAlerts,       // passed from App.jsx — same state, no second fetch
  onAcknowledge,      // passed from App.jsx — same handler
}) {
  const [responder, setResponder] = useState(null)         // check-in data
  const [showChangeZone, setShowChangeZone] = useState(false)
  const [nearestTeams, setNearestTeams] = useState({})      // zone_id -> nearest result
  const [muted, setMuted] = useState(false)
  const [activeTacticalAlert, setActiveTacticalAlert] = useState(null)
  const prevAlertIds = useRef(new Set())

  // Keep activeTacticalAlert synced with updated props if present
  useEffect(() => {
    if (activeTacticalAlert) {
      const updated = activeAlerts.find((a) => a.alert_id === activeTacticalAlert.alert_id)
      if (updated) {
        setActiveTacticalAlert(updated)
      }
    }
  }, [activeAlerts, activeTacticalAlert])

  // Fetch nearest team for each unique alert zone
  const fetchNearestTeams = useCallback(async (alerts) => {
    const uniqueZones = [...new Set(alerts.map((a) => a.zone_id))]
    const results = {}
    await Promise.all(
      uniqueZones.map(async (zone) => {
        try {
          const res = await fetch(`${backendUrl}/api/responders/nearest?zone_id=${zone}`)
          if (res.ok) {
            results[zone] = await res.json()
          }
        } catch {
          results[zone] = null
        }
      })
    )
    setNearestTeams((prev) => ({ ...prev, ...results }))
  }, [backendUrl])

  // Play audio on new alerts and refresh nearest teams
  useEffect(() => {
    const currentIds = new Set(activeAlerts.map((a) => a.alert_id))
    const newAlerts = activeAlerts.filter((a) => !prevAlertIds.current.has(a.alert_id))

    newAlerts.forEach((alert) => {
      playAlertTone(alert.alert_type === 'immediate_panic_alert', muted)
    })

    prevAlertIds.current = currentIds

    if (activeAlerts.length > 0) {
      fetchNearestTeams(activeAlerts)
    }
  }, [activeAlerts, muted, fetchNearestTeams])

  const handleCheckedIn = (responderData) => {
    setResponder(responderData)
    setShowChangeZone(false)
  }

  // Show check-in screen if not yet checked in or changing zone
  if (!responder || showChangeZone) {
    return (
      <ResponderCheckin
        backendUrl={backendUrl}
        onCheckedIn={handleCheckedIn}
      />
    )
  }

  const sortedAlerts = sortAlerts(activeAlerts)

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden relative" style={{ background: 'var(--color-bg)' }}>

      {/* Connection banner — reuse existing component */}
      <ConnectionStatusBanner
        connected={connected}
        reconnectAttempts={reconnectCount}
        onRetry={onRetry}
      />

      {/* Responder Header Bar */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap flex-shrink-0"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
            style={{ background: 'var(--color-accent)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
              {responder.name}
            </div>
            <div className="text-xs font-mono-num" style={{ color: 'var(--color-muted)' }}>
              Checked in: {responder.zone_id === 'zone_1' ? 'Zone 1 — Arrival Staging' : 'Zone 2 — Main Field'}
              {' · '}
              <button
                onClick={() => setShowChangeZone(true)}
                className="underline hover:no-underline"
                style={{ color: 'var(--color-accent)' }}
              >
                Change zone
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* In-app notification honesty note */}
          <div
            className="hidden sm:block text-[10px] font-mono-num px-2.5 py-1.5 rounded-lg border"
            style={{
              background: 'var(--color-bg)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-muted)',
            }}
          >
            In-app feed · Keep tab open · No push notifications
          </div>

          {/* Mute toggle */}
          <button
            id="responder-mute-toggle"
            onClick={() => setMuted((m) => !m)}
            className="px-3 py-1.5 rounded-lg border font-bold text-xs font-mono-num transition-all"
            style={{
              background: muted ? 'var(--risk-red-bg)' : 'var(--color-bg)',
              borderColor: muted ? 'var(--risk-red-border)' : 'var(--color-border)',
              color: muted ? 'var(--risk-red)' : 'var(--color-muted)',
            }}
            title={muted ? 'Audio muted — click to unmute' : 'Audio on — click to mute'}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 inline mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 inline mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536A5 5 0 008 12a5 5 0 00.464 2.464M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
            {muted ? 'MUTED' : 'SOUND ON'}
          </button>
        </div>
      </div>

      {/* Alert count sub-header */}
      <div
        className="px-4 py-2 border-b flex items-center gap-2 font-mono-num text-xs flex-shrink-0"
        style={{ background: 'var(--color-surface-hover)', borderColor: 'var(--color-border)' }}
      >
        <span
          className="font-extrabold px-2 py-0.5 rounded-full"
          style={{
            background: sortedAlerts.filter((a) => !a.acknowledged_at).length > 0
              ? 'var(--risk-red)' : 'var(--risk-green)',
            color: '#fff',
          }}
        >
          {sortedAlerts.filter((a) => !a.acknowledged_at).length}
        </span>
        <span style={{ color: 'var(--color-muted)' }}>
          ACTIVE UNACKNOWLEDGED
          {sortedAlerts.filter((a) => a.acknowledged_at).length > 0 && (
            <> · {sortedAlerts.filter((a) => a.acknowledged_at).length} acknowledged</>
          )}
        </span>
        <span
          className="ml-auto flex items-center gap-1.5 font-bold"
          style={{ color: connected ? 'var(--risk-green)' : 'var(--risk-red)' }}
        >
          <span
            className="w-2 h-2 rounded-full pulse-dot"
            style={{ background: connected ? 'var(--risk-green)' : 'var(--risk-red)' }}
          />
          {connected ? 'LIVE FEED' : 'DISCONNECTED'}
        </span>
      </div>

      {/* Alert Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {sortedAlerts.length === 0 ? (
          /* All-clear state */
          <div
            className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div
              className="w-16 h-16 rounded-full border-4 flex items-center justify-center mb-4"
              style={{ borderColor: 'var(--risk-green)', color: 'var(--risk-green)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="font-extrabold text-lg font-mono-num" style={{ color: 'var(--risk-green)' }}>
              ALL CLEAR
            </div>
            <div className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
              No active alerts. Monitoring live via WebSocket.
            </div>
          </div>
        ) : (
          sortedAlerts.map((alert) => (
            <ResponderAlertCard
              key={alert.alert_id}
              alert={alert}
              nearestTeam={nearestTeams[alert.zone_id] || null}
              responder={responder}
              socket={socket}
              backendUrl={backendUrl}
              muted={muted}
              onOpenTacticalView={(a) => setActiveTacticalAlert(a)}
            />
          ))
        )}
      </div>

      {/* Active Incident Tactical View — Rendered within mobile phone frame */}
      {activeTacticalAlert && (
        <ActiveIncidentResponseModal
          alert={activeTacticalAlert}
          nearestTeam={nearestTeams[activeTacticalAlert.zone_id] || null}
          currentActor={responder?.name || 'field_patrol'}
          backendUrl={backendUrl}
          socket={socket}
          onClose={() => setActiveTacticalAlert(null)}
          isMobile={true}
        />
      )}
    </div>
  )
}
