/**
 * frontend/src/App.jsx
 * Operational Control Dashboard Shell — Phase 2.
 *
 * Implements high-contrast light-first theme (with Day/Night control tent toggle),
 * live Socket.io updates, ZonePanel, AlertPanel with acknowledge actions,
 * AuditLogView, and reserved slots for trend graphs.
 */
import React, { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

import ZonePanel from './components/ZonePanel'
import AlertPanel from './components/AlertPanel'
import AuditLogView from './components/AuditLogView'
import TrendGraphPlaceholder from './components/TrendGraphPlaceholder'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export default function App() {
  const [theme, setTheme] = useState('day') // 'day' (light-first high contrast default) or 'night'
  const [connected, setConnected] = useState(false)
  const [latestZoneData, setLatestZoneData] = useState(null)
  const [activeAlerts, setActiveAlerts] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [socketInstance, setSocketInstance] = useState(null)

  // Toggle Day / Night operational themes
  const toggleTheme = () => {
    const nextTheme = theme === 'day' ? 'night' : 'day'
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
  }

  // Fetch timestamped audit log records from backend
  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit-log?limit=50`)
      if (res.ok) {
        const data = await res.json()
        setAuditLogs(data.logs || [])
      }
    } catch (err) {
      console.error('[Frontend] Error fetching audit logs:', err)
    }
  }

  // Socket.io connection & event listeners
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'day')

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    })

    setSocketInstance(socket)

    socket.on('connect', () => {
      console.log('[Socket.io] Connected to backend')
      setConnected(true)
      fetchAuditLogs()
    })

    socket.on('disconnect', () => {
      console.log('[Socket.io] Disconnected from backend')
      setConnected(false)
    })

    // Listen to Backend → Frontend density updates (docs/api-contract.md §2)
    socket.on('density_update', (payload) => {
      setLatestZoneData(payload)
    })

    // Listen to alert life-cycle events
    socket.on('alert_triggered', (alert) => {
      console.warn('[Socket.io] Alert triggered:', alert)
      setActiveAlerts((prev) => {
        const exists = prev.some((a) => a.alert_id === alert.alert_id)
        return exists ? prev.map((a) => (a.alert_id === alert.alert_id ? alert : a)) : [alert, ...prev]
      })
      fetchAuditLogs()
    })

    socket.on('alert_escalated', (alert) => {
      console.warn('[Socket.io] Alert escalated:', alert)
      setActiveAlerts((prev) => prev.map((a) => (a.alert_id === alert.alert_id ? alert : a)))
      fetchAuditLogs()
    })

    socket.on('alert_acknowledged', (alert) => {
      console.log('[Socket.io] Alert acknowledged:', alert)
      setActiveAlerts((prev) => prev.filter((a) => a.alert_id !== alert.alert_id))
      fetchAuditLogs()
    })

    fetchAuditLogs()

    return () => {
      socket.disconnect()
    }
  }, [])

  // Acknowledge an alert
  const handleAcknowledgeAlert = async (alertId) => {
    if (socketInstance) {
      socketInstance.emit('acknowledge_alert', {
        alert_id: alertId,
        acknowledged_by: 'official_1',
      })
    }

    try {
      await fetch(`${BACKEND_URL}/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledged_by: 'official_1' }),
      })
      fetchAuditLogs()
    } catch (err) {
      console.error('[Frontend] Error acknowledging alert:', err)
    }
  }

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-200" style={{ background: 'var(--color-bg)' }}>

      {/* ── Header Bar ─────────────────────────────────────────────────── */}
      <header
        className="flex flex-wrap items-center justify-between px-6 py-3 border-b shadow-sm"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-extrabold text-sm shadow-sm"
            style={{ background: 'var(--color-accent)' }}
          >
            CS
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              CrowdSense <span className="text-xs font-mono-num font-normal opacity-70">Ops Control v0.2</span>
            </h1>
            <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              Live Crowd Early-Warning & Escalation Monitoring System
            </p>
          </div>
        </div>

        {/* Right Header Tools: Connection Indicator + Day/Night Toggle */}
        <div className="flex items-center gap-4 text-xs font-mono-num">
          {/* Socket status */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border"
               style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
            <span
              className="w-2 h-2 rounded-full pulse-dot"
              style={{ background: connected ? 'var(--risk-green)' : 'var(--risk-red)' }}
            />
            <span>{connected ? 'WS LIVE' : 'WS DISCONNECTED'}</span>
          </div>

          {/* Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            className="px-3 py-1.5 rounded-lg border font-bold shadow-sm transition-all hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center gap-1.5"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <span>{theme === 'day' ? '☀️ DAY MODE' : '🌙 NIGHT MODE'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Operations Layout ───────────────────────────────────────── */}
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">

        {/* Row 1: Live Zone Panel (8 cols) + Active Incident Alerts Panel (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <ZonePanel zoneData={latestZoneData} />
          </div>
          <div className="lg:col-span-5">
            <AlertPanel alerts={activeAlerts} onAcknowledgeAlert={handleAcknowledgeAlert} />
          </div>
        </div>

        {/* Row 2: Trend Graph Reserved Slot */}
        <TrendGraphPlaceholder />

        {/* Row 3: Tamper-Evident Audit Log Viewer */}
        <AuditLogView logs={auditLogs} onRefresh={fetchAuditLogs} />

      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        className="text-center text-xs py-3 border-t font-mono-num"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
      >
        CrowdSense · SIH Internal Hackathon Phase 2 · Single-Zone Core Integration Pipeline
      </footer>
    </div>
  )
}
