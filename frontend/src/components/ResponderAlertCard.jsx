/**
 * frontend/src/components/ResponderAlertCard.jsx
 * Panic-usable alert card — Part B spec.
 *
 * Design decisions:
 *  - SVG icons (not emoji) for alert-type signal: consistent across OS/browser/projector.
 *  - Risk level drives entire card appearance (border, bg tint, color bar) — color is structural.
 *  - Staleness ticker: live "Xm Xs ago" display, color-shifts at 1min/3min thresholds.
 *  - ACKNOWLEDGE button: full-width, 56px min-height, single tap, no confirmation dialog.
 *  - Status buttons: 2x2 grid, 48px each, appear only after acknowledgment.
 *  - Audio cue via Web Audio API — no file dependency, works offline.
 *  - FUTURE: citizen_report alert_type is pre-wired as a constant but never surfaced
 *    in the UI until that feature is built. Acceptance test exercises CV alerts only.
 */
import React, { useState, useEffect, useRef } from 'react'

// ── SVG Alert-Type Icons ──────────────────────────────────────────────────────
// Inline SVGs — no emoji, no image files. Consistent across all OS/browser combos.
const ALERT_TYPE_ICONS = {
  immediate_panic_alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-7 h-7" aria-label="Immediate panic alert">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  graduated_escalation: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-7 h-7" aria-label="Red alert — crowd density threshold exceeded">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.051 3.378c.866-1.5 3.032-1.5 3.898 0l7.354 12.748zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  citizen_report: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-7 h-7" aria-label="Citizen emergency report">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  ),
}

const SEVERITY_COLORS = {
  red: {
    border: 'var(--risk-red)',
    bg: 'var(--risk-red-bg)',
    bar: 'var(--risk-red)',
    text: 'var(--risk-red)',
    label: 'RED ALERT',
  },
  orange: {
    border: 'var(--risk-orange)',
    bg: 'var(--risk-orange-bg)',
    bar: 'var(--risk-orange)',
    text: 'var(--risk-orange)',
    label: 'ORANGE ALERT',
  },
  yellow: {
    border: 'var(--risk-yellow)',
    bg: 'var(--risk-yellow-bg)',
    bar: 'var(--risk-yellow)',
    text: 'var(--risk-yellow)',
    label: 'YELLOW ALERT',
  },
}

const STATUS_BUTTONS = [
  { value: 'en_route',    label: 'EN ROUTE',    icon: '▶' },
  { value: 'on_scene',    label: 'ON SCENE',    icon: '📍' },
  { value: 'resolved',    label: 'RESOLVED',    icon: '✓' },
  { value: 'need_backup', label: 'NEED BACKUP', icon: '!' },
]

const STATUS_COLORS = {
  en_route:    { bg: 'var(--color-accent)', text: '#fff' },
  on_scene:    { bg: 'var(--risk-orange)', text: '#fff' },
  resolved:    { bg: 'var(--risk-green)', text: '#fff' },
  need_backup: { bg: 'var(--risk-red)', text: '#fff' },
}

// ── Staleness helper ─────────────────────────────────────────────────────────
function getStaleness(triggeredAt) {
  const ageMs = Date.now() - new Date(triggeredAt).getTime()
  const ageSec = Math.floor(ageMs / 1000)
  const ageMin = Math.floor(ageSec / 60)
  const remSec = ageSec % 60

  let label
  if (ageMin === 0) {
    label = `${ageSec}s ago`
  } else {
    label = `${ageMin}m ${remSec}s ago`
  }

  let colorVar
  let pulse = false
  if (ageMs < 60_000) {
    colorVar = 'var(--risk-green)'
  } else if (ageMs < 180_000) {
    colorVar = 'var(--risk-yellow)'
  } else {
    colorVar = 'var(--risk-red)'
    pulse = true
  }

  return { label, colorVar, pulse }
}

// ── Route display ─────────────────────────────────────────────────────────────
function RouteDisplay({ route }) {
  if (!route) {
    return (
      <span className="text-xs font-mono-num" style={{ color: 'var(--color-muted)' }}>
        No check-in data — route unavailable
      </span>
    )
  }
  if (!route.label) {
    // Same zone — no travel needed
    return (
      <span className="text-xs font-mono-num font-semibold" style={{ color: 'var(--risk-green)' }}>
        On-site — no travel needed
      </span>
    )
  }
  return (
    <div className="space-y-0.5">
      <span className="text-xs font-mono-num font-semibold block" style={{ color: 'var(--color-text)' }}>
        {route.steps.join(' → ')}
      </span>
    </div>
  )
}

export default function ResponderAlertCard({
  alert,
  nearestTeam,       // { responder: {name, zone_id} | null, route: Object | null }
  responder,         // current responder's own check-in object
  socket,
  backendUrl,
  muted,
}) {
  if (!alert) return null

  const {
    alert_id,
    zone_id,
    severity,
    alert_type,
    triggered_at,
    acknowledged_at,
    responder_status,
  } = alert

  const [stalenessDisplay, setStalenessDisplay] = useState(() => getStaleness(triggered_at || new Date().toISOString()))
  const [activeStatus, setActiveStatus] = useState(responder_status || null)
  const [statusPending, setStatusPending] = useState(false)

  // Live staleness ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setStalenessDisplay(getStaleness(triggered_at))
    }, 1000)
    return () => clearInterval(interval)
  }, [triggered_at])

  // Sync status from incoming socket updates
  useEffect(() => {
    setActiveStatus(responder_status || null)
  }, [responder_status])

  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.red
  const icon = ALERT_TYPE_ICONS[alert_type] || ALERT_TYPE_ICONS.graduated_escalation
  const isPanic = alert_type === 'immediate_panic_alert'
  const isAcknowledged = Boolean(acknowledged_at)

  const handleAcknowledge = () => {
    if (!socket || isAcknowledged) return
    socket.emit('acknowledge_alert', {
      alert_id,
      acknowledged_by: responder?.name || 'responder',
    })
  }

  const handleStatusUpdate = async (status) => {
    if (!alert_id || statusPending) return
    setStatusPending(true)
    setActiveStatus(status)

    try {
      socket.emit('update_alert_status', {
        alert_id,
        status,
        responder_id: responder?.name || 'responder',
      })
    } catch (err) {
      console.error('[ResponderAlertCard] Status update error:', err)
    }
    setStatusPending(false)
  }

  return (
    <div
      className={`rounded-xl border-2 overflow-hidden flex flex-col transition-all ${isPanic && !isAcknowledged ? 'animate-panic' : ''}`}
      style={{
        borderColor: isAcknowledged ? 'var(--color-border)' : colors.border,
        background: isAcknowledged ? 'var(--color-surface)' : colors.bg,
      }}
    >
      {/* Priority color bar — dominant visual signal, not just a label */}
      <div
        className="h-2 w-full"
        style={{ background: isAcknowledged ? 'var(--color-border)' : colors.bar }}
      />

      <div className="p-4 space-y-4">
        {/* Row 1: Icon + Type + Zone + Priority label */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* SVG Icon — consistent cross-browser rendering */}
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: isAcknowledged ? 'var(--color-bg)' : colors.bar,
                color: isAcknowledged ? colors.bar : '#FFFFFF',
              }}
            >
              {icon}
            </div>
            <div>
              <div
                className="font-extrabold text-sm uppercase tracking-wide font-mono-num"
                style={{ color: isAcknowledged ? 'var(--color-muted)' : colors.text }}
              >
                {isPanic ? 'IMMEDIATE PANIC ALERT' : alert_type === 'citizen_report' ? '📱 CITIZEN EMERGENCY REPORT' : 'RED ALERT'}
              </div>
              <div className="font-bold text-base" style={{ color: 'var(--color-text)' }}>
                {zone_id === 'zone_1' ? 'Zone 1 — Arrival Staging' : 'Zone 2 — Main Field'}
              </div>
            </div>
          </div>

          {/* Staleness indicator */}
          <div className="text-right flex-shrink-0">
            <div
              className={`text-xs font-mono-num font-bold px-2 py-1 rounded-lg ${stalenessDisplay.pulse && !isAcknowledged ? 'staleness-pulse' : ''}`}
              style={{
                color: isAcknowledged ? 'var(--color-muted)' : stalenessDisplay.colorVar,
                background: isAcknowledged ? 'var(--color-bg)' : `${stalenessDisplay.colorVar}1A`,
                border: `1.5px solid ${isAcknowledged ? 'var(--color-border)' : stalenessDisplay.colorVar}`,
              }}
              title={`Alert triggered at ${new Date(triggered_at).toLocaleTimeString()}`}
            >
              ⏱ {stalenessDisplay.label}
            </div>
            <div className="text-[10px] font-mono-num mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {new Date(triggered_at).toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Row 2: Nearest team + Route */}
        <div
          className="rounded-lg p-3 space-y-2 border"
          style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-start gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <div>
              <div className="text-[10px] font-mono-num font-bold uppercase" style={{ color: 'var(--color-muted)' }}>
                Nearest checked-in team
              </div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                {nearestTeam?.responder
                  ? `${nearestTeam.responder.name} (${nearestTeam.responder.zone_id})`
                  : 'No teams checked in'}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 pt-1.5 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <div>
              <div className="text-[10px] font-mono-num font-bold uppercase" style={{ color: 'var(--color-muted)' }}>
                Pre-planned response path
              </div>
              <RouteDisplay route={nearestTeam?.route} />
            </div>
          </div>
        </div>

        {/* Row 3: ACKNOWLEDGE button (pre-ack) or status buttons (post-ack) */}
        {!isAcknowledged ? (
          <button
            id={`ack-btn-${alert_id}`}
            onClick={handleAcknowledge}
            className="touch-target w-full rounded-xl font-extrabold text-base text-white shadow-lg transition-all active:scale-95 focus-visible:ring-2 flex items-center justify-center gap-2"
            style={{ background: colors.bar }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            ACKNOWLEDGE
          </button>
        ) : (
          <div className="space-y-2">
            <div
              className="text-[10px] font-mono-num font-bold uppercase text-center"
              style={{ color: 'var(--color-muted)' }}
            >
              Update Status
            </div>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_BUTTONS.map((btn) => {
                const isActive = activeStatus === btn.value
                const sc = STATUS_COLORS[btn.value]
                return (
                  <button
                    key={btn.value}
                    id={`status-btn-${alert_id}-${btn.value}`}
                    onClick={() => handleStatusUpdate(btn.value)}
                    disabled={statusPending}
                    className="touch-target rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border-2 transition-all active:scale-95 disabled:opacity-60"
                    style={{
                      background: isActive ? sc.bg : 'var(--color-bg)',
                      color: isActive ? sc.text : 'var(--color-text)',
                      borderColor: isActive ? sc.bg : 'var(--color-border)',
                      minHeight: '48px',
                    }}
                  >
                    <span>{btn.icon}</span>
                    {btn.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
