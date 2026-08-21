/**
 * frontend/src/App.jsx
 * Multi-Zone Operational Control Dashboard Shell — Phase 3.
 *
 * Renders concurrent Zone 1 (Live Webcam) and Zone 2 (Emergency Corridor) side-by-side,
 * Trend Extrapolation graph with linear ETA projection, formula breakdown modal,
 * active incident alerts, and timestamped audit log.
 */
import React, { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

import ZonePanel from './components/ZonePanel'
import AlertPanel from './components/AlertPanel'
import AuditLogView from './components/AuditLogView'
import TrendExtrapolationGraph from './components/TrendExtrapolationGraph'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export default function App() {
  const [theme, setTheme] = useState('day')
  const [connected, setConnected] = useState(false)
  const [zoneMap, setZoneMap] = useState({
    zone_1: null,
    zone_2: null,
  })
  const [selectedTrendZone, setSelectedTrendZone] = useState('zone_1')
  const [activeAlerts, setActiveAlerts] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [socketInstance, setSocketInstance] = useState(null)

  const toggleTheme = () => {
    const nextTheme = theme === 'day' ? 'night' : 'day'
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
  }

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

    // Listen to multi-zone density updates
    socket.on('density_update', (payload) => {
      setZoneMap((prev) => ({
        ...prev,
        [payload.zone_id]: payload,
      }))
    })

    // Alert events
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

  const currentTrendData = zoneMap[selectedTrendZone] || zoneMap.zone_1 || zoneMap.zone_2

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-200" style={{ background: 'var(--color-bg)' }}>

      {/* Header Bar */}
      <header
        className="flex flex-wrap items-center justify-between px-6 py-3 border-b shadow-xs"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-extrabold text-sm shadow-xs"
            style={{ background: 'var(--color-accent)' }}
          >
            CS
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              CrowdSense <span className="text-xs font-mono-num font-normal opacity-70">Multi-Zone Ops v0.3</span>
            </h1>
            <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              Concurrent Multi-Zone Safety &amp; Egress Monitoring System
            </p>
          </div>
        </div>

        {/* Header Right Tools */}
        <div className="flex items-center gap-4 text-xs font-mono-num">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border"
               style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
            <span
              className="w-2 h-2 rounded-full pulse-dot"
              style={{ background: connected ? 'var(--risk-green)' : 'var(--risk-red)' }}
            />
            <span>{connected ? 'WS LIVE' : 'WS DISCONNECTED'}</span>
          </div>

          <button
            onClick={toggleTheme}
            className="px-3 py-1.5 rounded-lg border font-bold shadow-xs transition-all hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center gap-1.5"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <span>{theme === 'day' ? '☀️ DAY MODE' : '🌙 NIGHT MODE'}</span>
          </button>
        </div>
      </header>

      {/* Main Multi-Zone Operations Grid */}
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">

        {/* Row 1: Side-by-Side Multi-Zone Panels */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono-num">
              MONITORED EVENT ZONES (2 ACTIVE CONCURRENT FEEDS)
            </h2>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ZonePanel zoneData={zoneMap.zone_1} zoneId="zone_1" />
            <ZonePanel zoneData={zoneMap.zone_2} zoneId="zone_2" />
          </div>
        </div>

        {/* Row 2: Active Alerts Panel + Trend Graph Selection */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4">
            <AlertPanel alerts={activeAlerts} onAcknowledgeAlert={handleAcknowledgeAlert} />
          </div>

          <div className="lg:col-span-8 flex flex-col space-y-3">
            {/* Zone Selector for Trend Graph */}
            <div className="flex items-center justify-between px-2 font-mono-num text-xs">
              <span className="font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                SELECT ZONE FOR TREND EXTRAPOLATION:
              </span>
              <div className="flex gap-2">
                {['zone_1', 'zone_2'].map((zId) => (
                  <button
                    key={zId}
                    onClick={() => setSelectedTrendZone(zId)}
                    className={`px-3 py-1 rounded font-bold transition-all ${
                      selectedTrendZone === zId
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {zId === 'zone_1' ? 'ZONE 1 (GENERAL)' : 'ZONE 2 (CORRIDOR)'}
                  </button>
                ))}
              </div>
            </div>

            <TrendExtrapolationGraph zoneData={currentTrendData} />
          </div>
        </div>

        {/* Row 3: Tamper-Evident Audit Log Viewer */}
        <AuditLogView logs={auditLogs} onRefresh={fetchAuditLogs} />

      </main>

      <footer
        className="text-center text-xs py-3 border-t font-mono-num"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
      >
        CrowdSense · SIH Internal Hackathon Phase 3 · Multi-Zone &amp; Trend Extrapolation Pipeline
      </footer>
    </div>
  )
}
