import React, { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

import ZonePanel from './components/ZonePanel'
import AlertPanel from './components/AlertPanel'
import AuditLogView from './components/AuditLogView'
import TrendExtrapolationGraph from './components/TrendExtrapolationGraph'
import FlowMetricsDisplay from './components/FlowMetricsDisplay'
import PostEventAnalysisView from './components/PostEventAnalysisView'
import BottleneckExitMap from './components/BottleneckExitMap'
import MockDispatchControl from './components/MockDispatchControl'
import KnownLimitationsModal from './components/KnownLimitationsModal'
import ConnectionStatusBanner from './components/ConnectionStatusBanner'
import ResponderDashboard from './components/ResponderDashboard'
import CitizenReportView from './components/CitizenReportView'
import DualPhoneSimulator from './components/DualPhoneSimulator'
import WeatherControlPanel from './components/WeatherControlPanel'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:4000`

export default function App() {
  const isPort5174 = window.location.port === '5174'
  const [theme, setTheme] = useState('day')
  const [activeTab, setActiveTab] = useState(isPort5174 ? 'DUAL_SIM' : 'LIVE')

  const [connected, setConnected] = useState(false)
  const [reconnectCount, setReconnectCount] = useState(0)
  const [zoneMap, setZoneMap] = useState({
    zone_1: null,
    zone_2: null,
  })
  const [selectedTrendZone, setSelectedTrendZone] = useState('zone_1')
  const [activeAlerts, setActiveAlerts] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [playbookSteps, setPlaybookSteps] = useState([])
  const [mockToasts, setMockToasts] = useState([])
  const [showLimitations, setShowLimitations] = useState(false)
  const [socketInstance, setSocketInstance] = useState(null)
  const [weatherState, setWeatherState] = useState(null)
  // Per-zone panic confirmation build-up state (from 'panic_confirming' socket event)
  // Shape: { zone_id: { confirmedFrames, requiredFrames, trigger } | null }
  const [panicConfirming, setPanicConfirming] = useState({})

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
        setPlaybookSteps(data.playbook_steps || [])
      }
    } catch (err) {
      console.error('[Frontend] Error fetching audit logs:', err)
    }
  }

  const fetchWeatherState = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/conditions/current`)
      if (res.ok) {
        const data = await res.json()
        setWeatherState(data)
      }
    } catch (err) {
      console.error('[Frontend] Error fetching weather conditions:', err)
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
      setReconnectCount(0)
      fetchAuditLogs()
      fetchWeatherState()
    })

    socket.on('disconnect', () => {
      console.log('[Socket.io] Disconnected from backend')
      setConnected(false)
    })

    socket.io.on('reconnect_attempt', (attempt) => {
      setReconnectCount(attempt)
    })

    socket.on('conditions_updated', (updatedWeather) => {
      console.log('[Socket.io] Received weather conditions_updated:', updatedWeather)
      setWeatherState(updatedWeather)
    })

    socket.on('density_update', (payload) => {
      setZoneMap((prev) => ({
        ...prev,
        [payload.zone_id]: payload,
      }))
    })

    socket.on('alert_triggered', (alert) => {
      setActiveAlerts((prev) => {
        const exists = prev.some((a) => a.alert_id === alert.alert_id)
        return exists ? prev.map((a) => (a.alert_id === alert.alert_id ? alert : a)) : [alert, ...prev]
      })
      fetchAuditLogs()
    })

    socket.on('alert_escalated', (alert) => {
      setActiveAlerts((prev) => prev.map((a) => (a.alert_id === alert.alert_id ? alert : a)))
      fetchAuditLogs()
    })

    socket.on('alert_acknowledged', (alert) => {
      if (!alert) return
      setActiveAlerts((prev) =>
        prev.map((a) => (a.alert_id === alert.alert_id ? { ...a, ...alert } : a))
      )
      fetchAuditLogs()
    })

    // Responder status update — keeps main dashboard alert panel and audit log
    // in sync with status changes made from the responder view.
    // Same data path as alert_acknowledged — no separate backend needed.
    socket.on('alert_status_updated', (alert) => {
      if (!alert) return
      setActiveAlerts((prev) =>
        prev.map((a) => (a.alert_id === alert.alert_id ? { ...a, ...alert } : a))
      )
      fetchAuditLogs()
    })

    socket.on('playbook_step_completed', () => {
      fetchAuditLogs()
    })

    socket.on('mock_dispatch_toast', (toast) => {
      setMockToasts((prev) => [toast, ...prev.slice(0, 4)])
    })

    // Panic confirmation build-up: backend has seen isPanic but not yet reached
    // the PANIC_CONFIRM_FRAMES threshold. Show an intermediate 'CONFIRMING...' state.
    socket.on('panic_confirming', (data) => {
      setPanicConfirming((prev) => ({
        ...prev,
        [data.zone_id]: {
          confirmedFrames: data.confirmedFrames,
          requiredFrames: data.requiredFrames,
          trigger: data.trigger,
        },
      }))
    })

    // Clear confirming state once a real alert fires or zone calms down
    socket.on('alert_triggered', (alert) => {
      setPanicConfirming((prev) => ({ ...prev, [alert.zone_id]: null }))
      setActiveAlerts((prev) => {
        const exists = prev.some((a) => a.alert_id === alert.alert_id)
        return exists ? prev.map((a) => (a.alert_id === alert.alert_id ? alert : a)) : [alert, ...prev]
      })
      fetchAuditLogs()
    })

    fetchAuditLogs()

    return () => {
      socket.disconnect()
    }
  }, [])

  const handleManualReconnect = () => {
    if (socketInstance) {
      socketInstance.connect()
    }
  }

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

  const handleDismissToast = (index) => {
    setMockToasts((prev) => prev.filter((_, i) => i !== index))
  }

  const currentTrendData = zoneMap[selectedTrendZone] || zoneMap.zone_1 || zoneMap.zone_2

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-200" style={{ background: 'var(--color-bg)' }}>

      {/* Global Connection Error Banner */}
      <ConnectionStatusBanner
        connected={connected}
        reconnectAttempts={reconnectCount}
        onRetry={handleManualReconnect}
      />

      {/* Header Bar */}
      <header
        className="flex flex-wrap items-center justify-between px-6 py-3 border-b shadow-xs gap-4"
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
              CrowdSense <span className="text-xs font-mono-num font-normal opacity-70">Ops Control v0.5</span>
            </h1>
            <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              Flow-Aware Crowd Early-Warning &amp; Automated Escalation System
            </p>
          </div>
        </div>

        {/* Privacy Disclosure Badge */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-mono-num"
             style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
          <span>🛡️ Anonymous Headcount Only — Zero Facial Recognition / No Biometric Storage</span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 font-mono-num text-xs">
          {[
            { id: 'LIVE', label: '🔴 LIVE OPERATIONS' },
            { id: 'EVENT_ANALYSIS', label: '📊 EVENT ANALYSIS' },
            { id: 'VENUE_MAP', label: '🗺️ VENUE MAP & EGRESS' },
            { id: 'DUAL_SIM', label: '📱 DUAL PHONE SIMULATOR' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === tab.id || (tab.id === 'EVENT_ANALYSIS' && (activeTab === 'REPORT' || activeTab === 'POST_EVENT'))
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>


        {/* Header Tools */}
        <div className="flex items-center gap-3 text-xs font-mono-num">
          <button
            onClick={() => setShowLimitations(true)}
            className="px-3 py-1.5 rounded-lg border font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 hover:bg-amber-200"
          >
            ℹ️ LIMITATIONS
          </button>

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
            <span>{theme === 'day' ? '☀️ DAY' : '🌙 NIGHT'}</span>
          </button>
        </div>
      </header>

      {/* Main Operations Shell */}
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">

        {/* Environmental Conditions & Presenter Control Strip */}
        <WeatherControlPanel weatherState={weatherState} backendUrl={BACKEND_URL} />

        {/* Tab 1: Live Operations */}
        {activeTab === 'LIVE' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="space-y-3">
                <ZonePanel zoneData={zoneMap.zone_1} zoneId="zone_1" panicConfirming={panicConfirming['zone_1'] ?? null} />
                <FlowMetricsDisplay zoneData={zoneMap.zone_1} />
              </div>
              <div className="space-y-3">
                <ZonePanel zoneData={zoneMap.zone_2} zoneId="zone_2" panicConfirming={panicConfirming['zone_2'] ?? null} />
                <FlowMetricsDisplay zoneData={zoneMap.zone_2} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4">
                <AlertPanel
                  alerts={activeAlerts}
                  onAcknowledgeAlert={handleAcknowledgeAlert}
                  socket={socketInstance}
                  backendUrl={BACKEND_URL}
                />
              </div>

              <div className="lg:col-span-8 flex flex-col space-y-3">
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

            <AuditLogView
              logs={auditLogs}
              playbookSteps={playbookSteps}
              onRefresh={fetchAuditLogs}
            />
          </div>
        )}

        {/* Combined Post-Event Analysis Tab (Report + Timeline & Audit) */}
        {(activeTab === 'EVENT_ANALYSIS' || activeTab === 'REPORT' || activeTab === 'POST_EVENT') && (
          <PostEventAnalysisView auditLogs={auditLogs} />
        )}

        {/* Tab 3: Venue Map & Egress Bottlenecks */}
        {activeTab === 'VENUE_MAP' && (
          <BottleneckExitMap zoneMap={zoneMap} />
        )}

        {/* Dual Phone Field Mobile Simulator */}
        {activeTab === 'DUAL_SIM' && (
          <DualPhoneSimulator
            socket={socketInstance}
            backendUrl={BACKEND_URL}
            connected={connected}
            reconnectCount={reconnectCount}
            onRetry={handleManualReconnect}
            activeAlerts={activeAlerts}
            onAcknowledge={handleAcknowledgeAlert}
          />
        )}



      </main>

      {/* Known Limitations Drawer */}
      <KnownLimitationsModal isOpen={showLimitations} onClose={() => setShowLimitations(false)} />

      <footer
        className="text-center text-xs py-3 border-t font-mono-num"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
      >
        CrowdSense · SIH Hackathon Phase 5 · Flow-Aware Early-Warning &amp; Automated Escalation System
      </footer>
    </div>
  )
}
