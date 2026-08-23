/**
 * frontend/src/components/ActiveIncidentResponseModal.jsx
 * Full-Screen Active Incident Tactical Response Screen.
 *
 * Opens automatically upon alert acknowledgment (or manual click on active alert).
 * Fills the screen with:
 *  1. Top: Prominent live operational status controls (EN ROUTE, ON SCENE, RESOLVED, NEED BACKUP)
 *  2. Pre-planned route and nearest team details
 *  3. Full Incident Response Playbook Guide (Static NDMA protocols, shortfall check, Groq framing, interactive checklist)
 */
import React, { useState, useEffect } from 'react'
import PlaybookPanel from './PlaybookPanel'

const STATUS_BUTTONS = [
  { value: 'en_route', label: 'EN ROUTE', icon: '▶', color: 'bg-sky-600 hover:bg-sky-500' },
  { value: 'on_scene', label: 'ON SCENE', icon: '📍', color: 'bg-amber-600 hover:bg-amber-500' },
  { value: 'resolved', label: 'RESOLVED', icon: '✓', color: 'bg-emerald-600 hover:bg-emerald-500' },
  { value: 'need_backup', label: 'NEED BACKUP', icon: '!', color: 'bg-rose-600 hover:bg-rose-500' },
]

export default function ActiveIncidentResponseModal({
  alert,
  nearestTeam,
  currentActor = 'official_1',
  backendUrl,
  socket,
  onClose,
  isMobile = true,
}) {
  const [activeStatus, setActiveStatus] = useState(alert?.responder_status || null)
  const [statusPending, setStatusPending] = useState(false)

  const alertId = alert?.alert_id
  const isPanic = alert?.alert_type === 'immediate_panic_alert'

  useEffect(() => {
    setActiveStatus(alert?.responder_status || null)
  }, [alert?.responder_status])

  const handleStatusUpdate = async (status) => {
    if (!alertId || statusPending) return
    setStatusPending(true)
    setActiveStatus(status)

    if (socket) {
      socket.emit('update_alert_status', {
        alert_id: alertId,
        status,
        responder_id: currentActor,
      })
    }

    try {
      await fetch(`${backendUrl}/api/alerts/${alertId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          responder_id: currentActor,
        }),
      })
    } catch (err) {
      console.error('[ActiveIncidentResponseModal] Status update error:', err)
    }
    setStatusPending(false)
  }

  if (!alert) return null

  return (
    <div className="absolute inset-0 z-40 bg-slate-950 flex flex-col overflow-y-auto min-h-0 font-sans selection:bg-sky-500 selection:text-white animate-fadeIn">
      {/* Top Mobile Screen Header */}
      <div className="px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 flex-shrink-0 sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">{isPanic ? '🛑' : alert.alert_type === 'citizen_report' ? '📱' : '⚠️'}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase font-mono-num text-white ${
                  isPanic ? 'bg-rose-600' : 'bg-red-600'
                }`}
              >
                {isPanic ? 'PANIC BYPASS' : alert.alert_type === 'citizen_report' ? 'CITIZEN SOS' : 'RED ALERT'}
              </span>
              <span className="text-[11px] font-mono-num font-bold text-slate-200 truncate">
                {alert.zone_id === 'zone_2' ? 'Zone 2 (Main Field)' : 'Zone 1 (Arrival)'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono-num truncate">
              {new Date(alert.triggered_at).toLocaleTimeString()}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono-num font-bold flex-shrink-0 transition-all active:scale-95"
        >
          ← BACK
        </button>
      </div>

      {/* Screen Body */}
      <div className="p-3.5 flex-1 space-y-4">
        {/* Section 1: Live Status Controls */}
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900 space-y-2.5 shadow-md">
          <div className="flex items-center justify-between text-[11px] font-mono-num">
            <span className="font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              STATUS (TAP TO UPDATE LIVE):
            </span>
            {activeStatus && (
              <span className="font-bold text-emerald-400 uppercase text-[10px]">
                {activeStatus.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono-num">
            {STATUS_BUTTONS.map((btn) => {
              const isActive = activeStatus === btn.value
              return (
                <button
                  key={btn.value}
                  onClick={() => handleStatusUpdate(btn.value)}
                  disabled={statusPending}
                  className={`py-2.5 px-2 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 border-2 transition-all active:scale-95 shadow-sm ${
                    isActive
                      ? `${btn.color} text-white border-white ring-2 ring-white/30`
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs">{btn.icon}</span>
                  <span>{btn.label}</span>
                </button>
              )
            })}
          </div>

          {/* Nearest Team & Pre-Authored Route */}
          <div className="pt-1.5 border-t border-slate-800 text-[10px] font-mono-num text-slate-400 space-y-0.5">
            <div>
              Nearest Team:{' '}
              <strong className="text-slate-200">
                {nearestTeam?.responder ? `${nearestTeam.responder.name} (${nearestTeam.responder.zone_id})` : 'Self / On-site'}
              </strong>
            </div>
            <div>
              Route:{' '}
              <strong className="text-sky-400">
                {nearestTeam?.route?.label || 'On-site — direct access'}
              </strong>
            </div>
          </div>
        </div>

        {/* Section 2: Full Incident Response Playbook Guide */}
        <div className="space-y-1.5">
          <div className="px-1 text-[11px] font-mono-num font-extrabold uppercase text-slate-400">
            📋 RESPONSE PROTOCOL &amp; ACTIONS:
          </div>

          <PlaybookPanel
            alert={alert}
            backendUrl={backendUrl}
            socket={socket}
            currentActor={currentActor}
            defaultExpanded={true}
            hideToggle={true}
            isMobile={true}
          />
        </div>
      </div>

      {/* Screen Footer */}
      <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono-num text-slate-400 flex-shrink-0">
        <span>Decision Support System</span>
        <button
          onClick={onClose}
          className="text-sky-400 font-bold hover:underline"
        >
          ← Return to Alert Feed
        </button>
      </div>
    </div>
  )
}
