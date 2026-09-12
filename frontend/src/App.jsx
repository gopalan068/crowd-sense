import React, { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'

import ZonePanel from './components/ZonePanel'
import AlertPanel from './components/AlertPanel'
import AuditLogView from './components/AuditLogView'
import TrendExtrapolationGraph from './components/TrendExtrapolationGraph'
import PostEventAnalysisView from './components/PostEventAnalysisView'
import MockDispatchControl from './components/MockDispatchControl'
import KnownLimitationsModal from './components/KnownLimitationsModal'
import ConnectionStatusBanner from './components/ConnectionStatusBanner'
import ResponderDashboard from './components/ResponderDashboard'
import CitizenReportView from './components/CitizenReportView'
import DualPhoneSimulator from './components/DualPhoneSimulator'
import WeatherControlPanel from './components/WeatherControlPanel'
import AssistantChatPanel from './components/AssistantChatPanel'
import HomeAerialMapOverlay from './components/HomeAerialMapOverlay'
import EvacVenue2DMap from './components/EvacVenue2DMap'
import SinglePointCoordinationChannel from './components/SinglePointCoordinationChannel'
import CameraGrid from './components/CameraGrid'
import PlannerPage from './pages/PlannerPage'
import PlannerReportPage from './pages/PlannerReportPage'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

// ─── Utility: live clock ───────────────────────────────────────────────────
function timeNow() {
  return new Date().toTimeString().slice(0, 8)
}

export default function App() {
  const isPort5174 = window.location.port === '5174'
  const [activeView, setActiveView] = useState(isPort5174 ? 'landing' : 'landing')
  const [connected, setConnected] = useState(false)
  const [reconnectCount, setReconnectCount] = useState(0)
  const [showLimitations, setShowLimitations] = useState(false)
  const [socketInstance, setSocketInstance] = useState(null)

  // Live data state
  const [zoneMap, setZoneMap] = useState({ zone_1: null, zone_2: null })
  const [activeAlerts, setActiveAlerts] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [playbookSteps, setPlaybookSteps] = useState([])
  const [mockToasts, setMockToasts] = useState([])
  const [weatherState, setWeatherState] = useState(null)
  const [pipelineActive, setPipelineActive] = useState(true)
  const [assistantInstructions, setAssistantInstructions] = useState([])
  const [panicConfirming, setPanicConfirming] = useState({})
  const [selectedTrendZone, setSelectedTrendZone] = useState('zone_2')
  const [clockStr, setClockStr] = useState(timeNow())

  // Comms feed for Evacuation page
  const [commsMsgs, setCommsMsgs] = useState([])

  // Clock ticker
  useEffect(() => {
    const t = setInterval(() => setClockStr(timeNow()), 1000)
    return () => clearInterval(t)
  }, [])

  // ─── API helpers ──────────────────────────────────────────────────────────
  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit-log?limit=50`)
      if (res.ok) {
        const data = await res.json()
        setAuditLogs(data.logs || [])
        setPlaybookSteps(data.playbook_steps || [])
        if (data.assistant_instructions && data.assistant_instructions.length > 0) {
          setAssistantInstructions((prev) => {
            if (prev.length === 0) return data.assistant_instructions.slice(0, 3)
            return prev
          })
        }
      }
    } catch (err) { console.error('[App] fetchAuditLogs:', err) }
  }

  const fetchWeatherState = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/conditions/current`)
      if (res.ok) setWeatherState(await res.json())
    } catch (err) { console.error('[App] fetchWeatherState:', err) }
  }

  const fetchPipelineStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/pipeline/status`)
      if (res.ok) {
        const data = await res.json()
        setPipelineActive(Boolean(data.active))
      }
    } catch (err) { console.error('[App] fetchPipelineStatus:', err) }
  }

  const handleTogglePipeline = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/pipeline/toggle`, { method: 'POST' })
      if (res.ok) setPipelineActive(Boolean((await res.json()).active))
    } catch (err) { console.error('[App] togglePipeline:', err) }
  }

  // ─── Socket.io setup ─────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnectionAttempts: 10 })
    setSocketInstance(socket)

    socket.on('connect', () => {
      setConnected(true); setReconnectCount(0)
      fetchAuditLogs(); fetchWeatherState(); fetchPipelineStatus()
    })
    socket.on('disconnect', () => setConnected(false))
    socket.io.on('reconnect_attempt', (n) => setReconnectCount(n))

    socket.on('conditions_updated', (w) => setWeatherState(w))
    socket.on('pipeline_status_updated', (p) => setPipelineActive(Boolean(p.active)))

    socket.on('density_update', (payload) =>
      setZoneMap((prev) => ({ ...prev, [payload.zone_id]: payload }))
    )

    socket.on('alert_triggered', (alert) => {
      setPanicConfirming((prev) => ({ ...prev, [alert.zone_id]: null }))
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
      setActiveAlerts((prev) => prev.map((a) => (a.alert_id === alert.alert_id ? { ...a, ...alert } : a)))
      fetchAuditLogs()
    })

    socket.on('alert_status_updated', (alert) => {
      if (!alert) return
      setActiveAlerts((prev) => prev.map((a) => (a.alert_id === alert.alert_id ? { ...a, ...alert } : a)))
      fetchAuditLogs()
    })

    socket.on('playbook_step_completed', () => fetchAuditLogs())

    socket.on('mock_dispatch_toast', (toast) =>
      setMockToasts((prev) => [toast, ...prev.slice(0, 4)])
    )

    socket.on('assistant_instruction', (instruction) => {
      setAssistantInstructions((prev) => {
        const exists = prev.some((i) => i.instructionId === instruction.instructionId)
        return exists ? prev : [instruction, ...prev.slice(0, 4)]
      })
    })

    socket.on('panic_confirming', (data) => {
      setPanicConfirming((prev) => ({
        ...prev,
        [data.zone_id]: { confirmedFrames: data.confirmedFrames, requiredFrames: data.requiredFrames, trigger: data.trigger },
      }))
    })

    fetchAuditLogs()
    return () => socket.disconnect()
  }, [])

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleManualReconnect = () => { if (socketInstance) socketInstance.connect() }

  const handleAcknowledgeAlert = async (alertId) => {
    if (socketInstance) socketInstance.emit('acknowledge_alert', { alert_id: alertId, acknowledged_by: 'official_1' })
    try {
      await fetch(`${BACKEND_URL}/api/alerts/${alertId}/acknowledge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledged_by: 'official_1' }),
      })
      fetchAuditLogs()
    } catch (err) { console.error('[App] acknowledgeAlert:', err) }
  }

  const nav = (viewId) => setActiveView(viewId)

  const currentTrendData = zoneMap[selectedTrendZone] || zoneMap.zone_1 || zoneMap.zone_2

  // Derived risk score & level from zone_2 (Live Monitor single feed)
  const zone2 = zoneMap.zone_2 || {}
  const zone2RiskScore = zone2.risk_score != null ? Number(zone2.risk_score) : 0
  const zone2RiskLevel = zone2.risk_level || (
    zone2RiskScore >= 0.75 ? 'red' :
      zone2RiskScore >= 0.50 ? 'orange' :
        zone2RiskScore >= 0.25 ? 'yellow' : 'green'
  )

  const riskColorMap = {
    green: 'var(--green)',
    yellow: '#e8d95a',
    orange: 'var(--orange)',
    red: 'var(--red)'
  }
  const riskLabelMap = {
    green: 'SAFE',
    yellow: 'CAUTION',
    orange: 'WARNING',
    red: 'CRITICAL'
  }

  const riskColor = riskColorMap[zone2RiskLevel] || 'var(--green)'
  const riskLabel = riskLabelMap[zone2RiskLevel] || (zone2.risk_level ? String(zone2.risk_level).toUpperCase() : 'SAFE')
  const normalizedRiskRatio = Math.min(Math.max(zone2RiskScore > 1 ? zone2RiskScore / 100 : zone2RiskScore, 0), 1)
  const ringOffset = 452 - (452 * normalizedRiskRatio)

  // KPI values for Command Center
  const totalCrowd = Object.values(zoneMap).reduce(
    (s, z) => s + (Number(z?.people_count ?? z?.crowd_count) || 0),
    0
  )
  const alertCount = activeAlerts.filter((a) => !a.acknowledged_at).length

  return (
    <div style={{ fontFamily: 'var(--font-b)', background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>

      {/* ── Global Connection Banner ────────────────────────────────────── */}
      <ConnectionStatusBanner
        connected={connected}
        reconnectAttempts={reconnectCount}
        onRetry={handleManualReconnect}
      />

      {/* ── Top Navigation ──────────────────────────────────────────────── */}
      <nav className="topnav">
        <div className="brand" onClick={() => nav('landing')}>
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 12a8 8 0 0 1 8-8v8H4Z" fill="#04121a" />
              <path d="M12 4a8 8 0 1 1-8 8" stroke="#04121a" strokeWidth="1.6" />
            </svg>
          </div>
          <div className="brand-text">
            <b>CrowdSense</b>
            <span>Detect Early. Respond Faster. Save Lives.</span>
          </div>
        </div>

        <div className="nav-links">
          {[
            { id: 'landing', label: 'Home' },
            { id: 'plan', label: 'Plan & Simulate' },
            { id: 'monitor', label: 'Live Monitor' },
            { id: 'evac', label: 'Evacuation' },
            { id: 'post', label: 'Post-Incident' },
            { id: 'cc', label: 'Command Center' },
          ].map((v) => (
            <button
              key={v.id}
              className={activeView === v.id ? 'active' : ''}
              onClick={() => nav(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="nav-right">
          <div className="event-pill">
            <span className="dot" />
            Marina Beach New Year Festival
          </div>
          <div className="icon-btn" title="Notifications" onClick={() => setShowLimitations(true)}>
            ℹ️
          </div>
          <div
            className="icon-btn"
            title="AI Status"
            style={{ color: connected ? 'var(--cyan)' : 'var(--red)', borderColor: connected ? 'rgba(58,217,245,0.35)' : 'rgba(255,79,102,0.35)' }}
          >
            ✦
          </div>
          <div className="avatar">CS</div>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════════════════
          PAGE: HOME (landing)
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`view ${activeView === 'landing' ? 'active' : ''}`} id="view-landing">
        <div className="container">

          {/* Command Bar */}
          <div className="glass cmdbar">
            <div className="seg"><span className="k">EVENT</span><span className="v">Marina Beach New Year Festival</span></div>
            <div className="seg"><span className="k">LOCATION</span><span className="v">Marina Beach, Chennai, Tamil Nadu</span></div>
            <div className="seg"><span className="k">REGION / ZONE</span><span className="v">South Zone — Sector 4</span></div>
            <div className="seg"><span className="k">LOCAL TIME</span><span className="v" style={{ fontFamily: 'var(--font-m)' }}>{clockStr}</span></div>
            <div className="seg"><span className="k">WEATHER</span><span className="v">{weatherState ? `${weatherState.temperature ?? 29}°C · ${weatherState.condition ?? 'Clear'}` : '29°C · Clear · Wind 11 km/h'}</span></div>
            <div className="seg"><span className="k">SYSTEM STATUS</span><span className="v" style={{ color: connected ? 'var(--green)' : 'var(--red)' }}>{connected ? '● AI ACTIVE' : '○ OFFLINE'}</span></div>
          </div>

          {/* Agent Hero: AI log + venue map */}
          <div className="agent-hero">
            <div className="card agent-panel">
              <div className="agent-head">
                <div className="agent-avatar">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <path d="M4 12a8 8 0 0 1 8-8v8H4Z" fill="#04121a" />
                    <path d="M12 4a8 8 0 1 1-8 8" stroke="#04121a" strokeWidth="1.6" />
                  </svg>
                </div>
                <div>
                  <h3>CrowdSense AI Agent</h3>
                  <p>Fusing 6 live signal sources into one running prediction</p>
                </div>
              </div>
              <div className="agent-log">
                {assistantInstructions.length > 0 ? (
                  assistantInstructions.map((instr, i) => (
                    <div key={i} className={`line ${instr.severity === 'red' ? 'warn' : ''}`}>
                      <span className="tag" title={instr.ruleId || 'AGENT'}>
                        {(instr.ruleId || 'AGENT').replace(/_/g, ' ').slice(0, 10).toUpperCase()}
                      </span>
                      <p>{instr.text}</p>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="line"><span className="tag">WEATHER</span><p>Clear skies, rising humidity forecast at 20:30 — mild effect on Zone A dwell time.</p></div>
                    <div className="line"><span className="tag">IOT</span><p>Barrier-mounted sensors report Zone A occupancy at 78% of safe capacity.</p></div>
                    <div className="line warn"><span className="tag">DRONE</span><p>Aerial feed shows density trending upward near Gate 3 over the last 6 minutes.</p></div>
                    <div className="line"><span className="tag">SOUND</span><p>Ambient audio nominal — no distress or panic signature detected.</p></div>
                  </>
                )}
              </div>
              {/* Integrated AI Assistant Chat Box */}
              <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                <AssistantChatPanel backendUrl={BACKEND_URL} embedded={true} />
              </div>
            </div>

            <HomeAerialMapOverlay zoneMap={zoneMap} weatherState={weatherState} />

          </div>

          {/* Prediction Signal Sources */}
          <div>
            <div className="section-title">
              <h2>Prediction Signal Sources</h2>
              <span className="sub">What the AI agent is reading right now</span>
            </div>
            <div className="signal-row">
              <div className="card signal-card"><div className="ic">☁️</div><h5>Weather Reports</h5><div className="sv">{weatherState?.temperature ?? 29}°C</div><div className="sd">Feeds heat-stress and dwell-time modelling for open zones.</div></div>
              <div className="card signal-card"><div className="ic">📡</div><h5>IoT Sensors</h5><div className="sv">128 online</div><div className="sd">Occupancy, barrier load and environmental readings per zone.</div></div>
              <div className="card signal-card"><div className="ic">📷</div><h5>Portable CCTV</h5><div className="sv">9 towers</div><div className="sd">Relocatable coverage for entry lanes and temporary bottlenecks.</div></div>
              <div className="card signal-card"><div className="ic">🛩️</div><h5>CCTV Drone Shots</h5><div className="sv">4 active</div><div className="sd">Top-down density and movement reads across open-air zones.</div></div>
              <div className="card signal-card"><div className="ic">🔊</div><h5>Sound Anomaly Detection</h5><div className="sv">Nominal</div><div className="sd">Flags screaming, panic or crush-related audio signatures.</div></div>
              <div className="card signal-card"><div className="ic">📱</div><h5>Mobile App Reports</h5><div className="sv">{activeAlerts.length} today</div><div className="sd">Direct emergency reports submitted by people at the venue.</div></div>
            </div>
          </div>



          {/* ── Dual Phone Simulator (bottom of Home) ───────────────────── */}
          <div id="dual-simulator" style={{ marginBottom: 60 }}>
            <div className="section-title" style={{ marginBottom: 20 }}>
              <h2>Live Simulator</h2>
              <span className="sub">Citizen SOS app · Tactical Responder mobile app — synchronized in real time</span>
            </div>
            <DualPhoneSimulator
              socket={socketInstance}
              backendUrl={BACKEND_URL}
              connected={connected}
              reconnectCount={reconnectCount}
              onRetry={handleManualReconnect}
              activeAlerts={activeAlerts}
              onAcknowledge={handleAcknowledgeAlert}
            />
          </div>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PAGE: PLAN & SIMULATE
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`view ${activeView === 'plan' ? 'active' : ''}`} id="view-plan">
        <div style={{ padding: '0 0 20px' }}>
          <div className="container">
            <div className="page-head">
              <div className="eyebrow">PHASE 01 · BEFORE THE EVENT</div>
              <h1>Plan &amp; Simulate</h1>
              <p>Understand the venue. Predict the risks. Prepare before the crowd arrives.</p>
            </div>
          </div>
          {/* PlannerPage manages its own internal layout and padding */}
          <PlannerPage backendUrl={BACKEND_URL} />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PAGE: LIVE MONITOR
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`view ${activeView === 'monitor' ? 'active' : ''}`} id="view-monitor">
        <div className="container">
          <div className="page-head" style={{ paddingBottom: 14 }}>
            <div className="eyebrow">PHASE 02 · DURING THE EVENT</div>
            <h1>Live Monitor</h1>
            <p>See what is happening across the venue in real time.</p>
          </div>

          {/* Live topbar */}
          <div className="glass live-topbar">
            <div className="live-tag"><span className="pulse-dot" style={{ background: 'var(--red)', display: 'inline-block', width: 7, height: 7, borderRadius: '50%' }} /> LIVE EVENT MONITORING</div>
            <div className="sep" />
            <div className="meta">EVENT STATUS: <span style={{ color: 'var(--green)' }}>LIVE</span></div>
            <div className="sep" />
            <div className="meta">AI MONITORING: <span style={{ color: pipelineActive ? 'var(--cyan)' : 'var(--orange)' }}>{pipelineActive ? 'ACTIVE' : 'PAUSED'}</span></div>
            <div className="sep" />
            <div className="meta">LAST UPDATE: <span style={{ fontFamily: 'var(--font-m)' }}>{clockStr}</span></div>
            <div className="sep" />

          </div>

          {/* Monitor grid: Zone 2 live feed (Single Video Stream) + risk dial */}
          <div className="monitor-grid">
            <div>
              <ZonePanel
                zoneData={zoneMap.zone_2}
                zoneId="zone_2"
                panicConfirming={panicConfirming['zone_2'] ?? null}
                pipelineActive={pipelineActive}
              />
            </div>
            <div className="card">
              <div className="risk-dial">
                <div className="ring-wrap">
                  <svg width="170" height="170">
                    <circle cx="85" cy="85" r="72" fill="none" stroke="#121b31" strokeWidth="12" />
                    <circle cx="85" cy="85" r="72" fill="none" stroke={riskColor} strokeWidth="12"
                      strokeLinecap="round" strokeDasharray="452" strokeDashoffset={ringOffset}
                      style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }}
                    />
                  </svg>
                  <div className="ring-center">
                    <span className="num" style={{ color: riskColor, fontSize: 34 }}>
                      {zone2RiskScore.toFixed(2)}
                    </span>
                    <span className="max" style={{ fontSize: 11, fontWeight: 700, color: riskColor, letterSpacing: 0.4 }}>
                      {riskLabel} (Score: {zone2RiskScore.toFixed(2)})
                    </span>
                  </div>
                </div>
                <div className="risk-factors">
                  <div className="risk-factor-row">
                    <span>Crowd Density</span>
                    <b style={{ color: riskColor }}>
                      {zone2.density != null ? `${Number(zone2.density).toFixed(2)} p/m²` : '--'}
                    </b>
                  </div>
                  <div className="risk-factor-row">
                    <span>Flow Convergence</span>
                    <b style={{ color: 'var(--orange)' }}>
                      {((zone2.flow_convergence ?? 0) * 100).toFixed(0)}%
                    </b>
                  </div>
                  <div className="risk-factor-row">
                    <span>Turbulence</span>
                    <b style={{ color: 'var(--orange)' }}>
                      {((zone2.flow_turbulence ?? 0) * 100).toFixed(0)}%
                    </b>
                  </div>
                  <div className="risk-factor-row">
                    <span>Trend Slope</span>
                    <b style={{ color: 'var(--text-dim)' }}>
                      {zone2.trend_slope != null ? `${Number(zone2.trend_slope) > 0 ? '+' : ''}${Number(zone2.trend_slope).toFixed(2)} p/m²/min` : '--'}
                    </b>
                  </div>
                  <div className="risk-factor-row">
                    <span>Temperature</span>
                    <b style={{ color: (weatherState?.temperature_c ?? weatherState?.temperature ?? 28) > 35 ? 'var(--orange)' : 'var(--text-dim)' }}>
                      {weatherState?.temperature_c ?? weatherState?.temperature ?? 28}°C
                    </b>
                  </div>
                  <div className="risk-factor-row">
                    <span>Humidity</span>
                    <b style={{ color: (weatherState?.humidity_pct ?? weatherState?.humidity ?? 62) > 75 ? 'var(--orange)' : 'var(--text-dim)' }}>
                      {weatherState?.humidity_pct ?? weatherState?.humidity ?? 62}%
                    </b>
                  </div>
                  <div className="risk-factor-row">
                    <span>Rain / Precip</span>
                    <b style={{ color: (weatherState?.precipitation_mm ?? 0) > 0 ? 'var(--cyan)' : 'var(--text-dim)' }}>
                      {weatherState?.precipitation_mm != null && weatherState.precipitation_mm > 0 ? `${weatherState.precipitation_mm} mm/h` : '0.0 mm/h'}
                    </b>
                  </div>
                  <div className="risk-factor-row">
                    <span>Air Quality (AQI)</span>
                    <b style={{ color: (weatherState?.aqi ?? 42) > 100 ? 'var(--orange)' : 'var(--green)' }}>
                      {weatherState?.aqi ?? 42} AQI ({(weatherState?.aqi ?? 42) <= 50 ? 'Good' : (weatherState?.aqi ?? 42) <= 100 ? 'Moderate' : 'Unhealthy'})
                    </b>
                  </div>
                  <div className="risk-factor-row">
                    <span>Smoke Level</span>
                    <b style={{ color: (weatherState?.smoke_ppm ?? 12) > 30 ? 'var(--red)' : 'var(--green)' }}>
                      {weatherState?.smoke_ppm ?? 12} ppm (Normal)
                    </b>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="heatmap-legend" style={{ margin: '-8px 0 20px' }}>
            <span><span className="legend-sw" style={{ background: 'var(--green)' }} /> Safe</span>
            <span><span className="legend-sw" style={{ background: '#e8d95a' }} /> Moderate</span>
            <span><span className="legend-sw" style={{ background: 'var(--orange)' }} /> High</span>
            <span><span className="legend-sw" style={{ background: 'var(--red)' }} /> Critical</span>
          </div>

          {/* CCTV Camera Grid */}
          <CameraGrid />

          {/* Source cards */}
          <div className="source-row">
            <div className="card source-card">
              <div className="top"><span style={{ fontSize: 20 }}>📹</span><span className={`pill ${pipelineActive ? 'pill-green' : 'pill-orange'}`}>{pipelineActive ? 'CV Pipeline LIVE' : 'PAUSED'}</span></div>
              <h4>CCTV / CV Pipeline</h4>
              <div className="stat">{pipelineActive ? '94%' : '--'}</div>
            </div>
            <div className="card source-card">
              <div className="top"><span style={{ fontSize: 20 }}>🛩️</span><span className="pill pill-cyan">4 Active</span></div>
              <h4>Drones</h4>
              <div className="stat">4</div>
            </div>
            <div className="card source-card">
              <div className="top"><span style={{ fontSize: 20 }}>📡</span><span className="pill pill-green">128 Online</span></div>
              <h4>IoT Sensors</h4>
              <div className="stat">128</div>
            </div>
            <div className="card source-card">
              <div className="top"><span style={{ fontSize: 20 }}>🌙</span><span className="pill pill-cyan">Active</span></div>
              <h4>Night Vision</h4>
              <div className="stat">0/6</div>
            </div>
          </div>

          {/* Weather / Pipeline Control (formerly global) */}
          <div style={{ marginBottom: 20 }}>
            <WeatherControlPanel
              weatherState={weatherState}
              backendUrl={BACKEND_URL}
              pipelineActive={pipelineActive}
              onTogglePipeline={handleTogglePipeline}
            />
          </div>

          {/* Density trend + zone selector */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">
              <h2 style={{ fontSize: 16 }}>Density Trend Extrapolation</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                {['zone_1', 'zone_2'].map((zId) => (
                  <button
                    key={zId}
                    className={`chip ${selectedTrendZone === zId ? 'active' : ''}`}
                    onClick={() => setSelectedTrendZone(zId)}
                  >
                    {zId === 'zone_1' ? 'Zone 1 (General)' : 'Zone 2 (Corridor)'}
                  </button>
                ))}
              </div>
            </div>
            <TrendExtrapolationGraph zoneData={currentTrendData} />
          </div>


          {/* Audit log at bottom of monitor */}
          <AuditLogView
            logs={auditLogs}
            playbookSteps={playbookSteps}
            assistantInstructions={assistantInstructions}
            onRefresh={fetchAuditLogs}
          />

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PAGE: EVACUATION
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`view ${activeView === 'evac' ? 'active' : ''}`} id="view-evac">
        <div className="container">
          <div className="page-head" style={{ paddingBottom: 14 }}>
            <div className="eyebrow">PHASE 03 · WHEN RISK EMERGES</div>
            <h1>EvacAI</h1>
            <p>When conditions change, the safest route changes with them.</p>
          </div>

          {/* Critical situation banner — dynamic based on live zone telemetry & active alerts */}
          <div className="critical-banner" style={{ background: (zone2RiskLevel === 'red' || activeAlerts.length > 0) ? 'var(--red-soft)' : 'var(--cyan-soft)', borderColor: (zone2RiskLevel === 'red' || activeAlerts.length > 0) ? 'rgba(255,79,102,0.35)' : 'rgba(6,182,212,0.35)' }}>
            <span style={{ fontSize: 22 }}>{(zone2RiskLevel === 'red' || activeAlerts.length > 0) ? '🚨' : '⚡'}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ color: (zone2RiskLevel === 'red' || activeAlerts.length > 0) ? 'var(--red)' : 'var(--cyan)', fontFamily: 'var(--font-m)', fontSize: 12 }}>
                  {(zone2RiskLevel === 'red' || activeAlerts.length > 0) ? 'ACTIVE INCIDENT RESPONSE PROTOCOL: ZONE 2 SURGE' : 'DYNAMIC EGRESS & CLEARANCE PROTOCOL ACTIVE'}
                </b>
                <span className="pill" style={{ fontSize: 9.5, padding: '2px 8px', background: 'rgba(255,255,255,0.08)' }}>
                  GROUND SENSORS: LIVE
                </span>
              </div>
              <p style={{ marginTop: 6, color: 'var(--text)', fontSize: 13, lineHeight: 1.5 }}>
                {activeAlerts.length > 0
                  ? `Live optical flow sensors & camera nodes detected ${activeAlerts[0]?.alert_type?.replace(/_/g, ' ')} in ${activeAlerts[0]?.zone_id?.toUpperCase().replace('_', ' ')}. Localized density reached ${(zone2.density || 1.85).toFixed(2)} p/m² with ${zone2.count || 840} attendees in corridor throat. Dynamic reroute engaged toward open Exits E2 & E4.`
                  : `Zone 2 Connecting Channels operating at ${(zone2.density || 1.85).toFixed(2)} p/m² with ${zone2.count || 840} attendees. Dynamic clearance path mapped to avoid Gate 3 accumulation.`}
              </p>
            </div>
          </div>

          {/* Main evac grid: 2D Venue Map + Recommended Action & Alert panel */}
          <div className="evac-grid">
            {/* 2D Venue Architectural Map (from Plan & Simulate) */}
            <EvacVenue2DMap />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
              <div className="card">
                <div className="section-title">
                  <h2 style={{ fontSize: 15 }}>Dynamic Egress Protocol</h2>
                  <span className="pill pill-cyan" style={{ fontSize: 10 }}>COMPUTED BY EVACAI</span>
                </div>
                <div className="recommend-box" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.45 }}>
                  {activeAlerts.length > 0
                    ? `Divert ${activeAlerts[0]?.zone_id?.toUpperCase().replace('_', ' ')} crowd westward via 4.0m Relief Corridor → Perimeter Promenade → Emergency Exits E2 & E4`
                    : 'Divert Zone 1 Staging Lawn → 4.0m Relief Corridor → Perimeter Route → Emergency Exit E2'}
                </div>
                <div className="evac-stats">
                  <div className="box">
                    <div className="k" style={{ fontSize: 11, color: 'var(--text-faint)' }}>ESTIMATED CLEARANCE</div>
                    <div className="v" style={{ fontFamily: 'var(--font-d)', fontSize: 18, fontWeight: 700 }}>
                      {zone2RiskLevel === 'red' ? '3:45' : '4:30'}
                    </div>
                  </div>
                  <div className="box">
                    <div className="k" style={{ fontSize: 11, color: 'var(--text-faint)' }}>PEOPLE REDIRECTED</div>
                    <div className="v" style={{ fontFamily: 'var(--font-d)', fontSize: 18, fontWeight: 700 }}>
                      {Math.round((zone2.count || 840) * 3.8).toLocaleString()}
                    </div>
                  </div>
                  <div className="box">
                    <div className="k" style={{ fontSize: 11, color: 'var(--text-faint)' }}>CONGESTION REDUCTION</div>
                    <div className="v" style={{ fontFamily: 'var(--font-d)', fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>
                      −42%
                    </div>
                  </div>
                  <div className="box">
                    <div className="k" style={{ fontSize: 11, color: 'var(--text-faint)' }}>POST-REROUTE RISK</div>
                    <div className="v" style={{ fontFamily: 'var(--font-d)', fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>
                      LOW (18/100)
                    </div>
                  </div>
                </div>
              </div>

              {/* Alert management panel */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <AlertPanel
                  alerts={activeAlerts}
                  onAcknowledgeAlert={handleAcknowledgeAlert}
                  socket={socketInstance}
                  backendUrl={BACKEND_URL}
                />
              </div>
            </div>
          </div>

          {/* Route update card */}
          <div className="card route-update-card" style={{ marginBottom: 20 }}>
            <span className="pill pill-cyan">REAL-TIME ROUTE OPTIMIZATION</span>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Optical flow sensors detected Gate 3 throat bottleneck (density {(zone2.density || 1.85).toFixed(2)} p/m²). CrowdSense dynamic rerouting engine computed western clearance path.
            </span>
            <div className="route-path">
              <span className="old">Zone 1 Staging Lawn → Gate 3 Throat (BLOCKED)</span>
              <span style={{ color: 'var(--text-faint)' }}>→</span>
              <span className="new">Zone 1 → 4.0m Relief Corridor 3 → Exit E2 &amp; Northern Assembly Lawn</span>
            </div>
          </div>

          {/* Response Coordination Deck */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">
              <h2 style={{ fontSize: 16 }}>Physical Response Coordination</h2>
              <span className="pill pill-green" style={{ fontSize: 10 }}>ALL CHANNELS SYNCHRONIZED</span>
            </div>
            <div className="coord-grid">
              <div className="coord-item">
                <div className="k">Police Dispatch</div>
                <div className="v" style={{ color: 'var(--green)' }}>Assigned — Locking Staging Inflow</div>
              </div>
              <div className="coord-item">
                <div className="k">Medical Unit 2</div>
                <div className="v" style={{ color: 'var(--cyan)' }}>Dispatched — Standby at Exit E2</div>
              </div>
              <div className="coord-item">
                <div className="k">Emergency Ambulance</div>
                <div className="v" style={{ color: 'var(--green)' }}>Route Clear — Dedicated Corridor R2</div>
              </div>
              <div className="coord-item">
                <div className="k">Security Marshals</div>
                <div className="v" style={{ color: 'var(--orange)' }}>Active — Channeling Flow at Barrier 3</div>
              </div>
              <div className="coord-item">
                <div className="k">PA Voice Broadcast</div>
                <div className="v" style={{ color: 'var(--green)' }}>Broadcasting — "Proceed to Exit E2"</div>
              </div>
              <div className="coord-item">
                <div className="k">Digital VMS Arrow Boards</div>
                <div className="v" style={{ color: 'var(--green)' }}>Updated — Green Egress Vector Active</div>
              </div>
            </div>
          </div>

          {/* Step-by-Step Dynamic Evacuation Guide: Active Venue Incident Protocol */}


          {/* Single-Point Coordination Channel with Real-time Feeds */}
          <SinglePointCoordinationChannel
            socket={socketInstance}
            activeAlerts={activeAlerts}
            assistantInstructions={assistantInstructions}
            zoneMap={zoneMap}
          />

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PAGE: POST-INCIDENT
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`view ${activeView === 'post' ? 'active' : ''}`} id="view-post">
        <div className="container">
          <div className="page-head" style={{ paddingBottom: 14 }}>
            <div className="eyebrow">PHASE 04 · AFTER THE EVENT</div>
            <h1>Post-Incident Intelligence</h1>
            <p>Understand what happened. Learn why. Improve the next event.</p>
          </div>
          <PostEventAnalysisView auditLogs={auditLogs} />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PAGE: COMMAND CENTER
      ════════════════════════════════════════════════════════════════════ */}
      <section className={`view ${activeView === 'cc' ? 'active' : ''}`} id="view-cc">
        <div className="container">
          <div className="page-head" style={{ paddingBottom: 14 }}>
            <div className="eyebrow">UNIFIED VIEW</div>
            <h1>Command Center</h1>
            <p>Every stage of the crowd-safety lifecycle, in one control room.</p>
          </div>

          {/* KPI Row */}
          <div className="kpi-row">
            <div className="card kpi-card"><div className="stat-label">CURRENT CROWD</div><div className="stat-num">{totalCrowd.toLocaleString()}</div></div>
            <div className="card kpi-card"><div className="stat-label">RISK SCORE</div><div className="stat-num" style={{ color: riskColor }}>{zone2RiskScore.toFixed(2)}</div></div>
            <div className="card kpi-card"><div className="stat-label">ACTIVE ALERTS</div><div className="stat-num" style={{ color: alertCount > 0 ? 'var(--red)' : 'var(--green)' }}>{alertCount}</div></div>
            <div className="card kpi-card"><div className="stat-label">CV PIPELINE</div><div className="stat-num" style={{ color: pipelineActive ? 'var(--green)' : 'var(--orange)', fontSize: 18 }}>{pipelineActive ? 'LIVE' : 'PAUSED'}</div></div>
            <div className="card kpi-card"><div className="stat-label">AVAILABLE EXITS</div><div className="stat-num">3/4</div></div>
            <div className="card kpi-card"><div className="stat-label">RESPONSE TEAMS</div><div className="stat-num">12</div></div>
          </div>

          {/* CC Grid: Left = Expanded AI Alerts (1:1), Right = Stacked Evacuation & Responder Status */}
          <div className="cc-grid" style={{ marginBottom: 20 }}>
            {/* Left Column: Expanded AI Alerts (with embedded Push Notifications) */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 280 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h4 style={{ fontSize: 15, margin: 0, fontWeight: 700 }}>AI Alerts</h4>
                  {(alertCount > 0 || assistantInstructions.length > 0) ? (
                    <span className="pill pill-red" style={{ fontSize: 10 }}>
                      {alertCount + assistantInstructions.length} ACTIVE
                    </span>
                  ) : (
                    <span className="pill pill-green" style={{ fontSize: 10 }}>ALL CLEAR</span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Automated Vision & Push Guidance</span>
              </div>

              <div className="cc-mini-list" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                {/* 1. Push Guidance / Notifications displayed inline */}
                {assistantInstructions.map((inst, index) => {
                  const isPanic = inst.eventType === 'alert_panic' || inst.severity === 'red'
                  const isCitizen = inst.alertType === 'citizen_report' || Boolean(inst.category)
                  const zoneLabel = inst.zoneId === 'zone_2' ? 'ZONE 2' : inst.zoneId === 'zone_1' ? 'ZONE 1' : (inst.zoneId || 'VENUE').toUpperCase()
                  const timeLabel = inst.timestamp ? new Date(inst.timestamp).toLocaleTimeString() : 'Just now'
                  let cleanText = (inst.text || '')
                    .replace(/<think>[\s\S]*?<\/think>/gi, '')
                    .replace(/<think>[\s\S]*/gi, '')
                    .replace(/^Here'?s\s+a\s+thinking\s+process:?[\s\S]*?(?=\n\n|\n[A-Z0-9]|$)/i, '')
                    .trim()
                  if (!cleanText || cleanText.startsWith("Here's a thinking process")) {
                    cleanText = `${zoneLabel} surge detected. Deploy marshals to clear bottleneck routes.`
                  }

                  return (
                    <div
                      key={inst.instructionId || `push_${index}`}
                      className="cc-mini-row"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '10px 12px',
                        background: isPanic ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        border: `1px solid ${isPanic ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
                        <span style={{ fontSize: 18, marginTop: 1 }}>{isCitizen ? '📱' : isPanic ? '🚨' : '🤖'}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span
                              className="pill"
                              style={{
                                fontSize: 9.5,
                                fontWeight: 800,
                                background: isPanic ? '#DC2626' : '#D97706',
                                color: '#FFFFFF',
                                padding: '1px 6px',
                              }}
                            >
                              {isCitizen ? 'CITIZEN SOS' : 'AI PUSH GUIDANCE'}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>
                              {zoneLabel}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                              {timeLabel}
                            </span>
                          </div>
                          <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500, lineHeight: 1.4 }}>
                            {cleanText}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setAssistantInstructions((prev) => prev.filter((i) => (i.instructionId || i) !== (inst.instructionId || inst)))}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-faint)',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          fontSize: 13,
                          fontWeight: 700,
                          borderRadius: 4,
                          lineHeight: 1,
                        }}
                        title="Dismiss notification"
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-faint)')}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}

                {/* 2. Standard Active Incident Alerts */}
                {activeAlerts.slice(0, 6).map((a) => (
                  <div className="cc-mini-row" key={a.alert_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 13 }}>
                        {a.zone_id?.replace('_', ' ')?.toUpperCase()} — {a.alert_type?.replace(/_/g, ' ')}
                      </span>
                      {a.recommendation && (
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                          {a.recommendation}
                        </span>
                      )}
                    </div>
                    <span className={`pill ${a.severity === 'red' ? 'pill-red' : a.severity === 'orange' ? 'pill-orange' : 'pill-cyan'}`} style={{ fontWeight: 700 }}>
                      {a.severity?.toUpperCase()}
                    </span>
                  </div>
                ))}

                {/* 3. Empty state when both are clear */}
                {activeAlerts.length === 0 && assistantInstructions.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                    <span style={{ fontSize: 28, marginBottom: 8 }}>🛡️</span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main)', marginBottom: 4 }}>No Active Incident Alerts</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', maxWidth: 360 }}>
                      Continuous AI surveillance active across all venue sectors. Density, bottleneck formations, and flow velocity metrics are within normal safety limits.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Evacuation Status & Responder Status stacked */}
            <div className="cc-panels" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ flex: 1 }}>
                <h4 style={{ fontSize: 14 }}>Evacuation Status</h4>
                <div className="cc-mini-list">
                  <div className="cc-mini-row"><span>Zone 2 Corridor</span><span className="pill pill-cyan">Monitoring</span></div>
                  <div className="cc-mini-row"><span>Primary exits E1–E4</span><span className="pill pill-green">Clear</span></div>
                  <div className="cc-mini-row"><span>Emergency routes</span><span className="pill pill-green">Ready</span></div>
                </div>
              </div>

              <div className="card" style={{ flex: 1 }}>
                <h4 style={{ fontSize: 14 }}>Responder Status</h4>
                <div className="cc-mini-list">
                  <div className="cc-mini-row"><span>Medical team 2</span><span className="pill pill-green">Dispatched</span></div>
                  <div className="cc-mini-row"><span>Police unit 4</span><span className="pill pill-green">On site</span></div>
                  <div className="cc-mini-row"><span>Ambulance 1</span><span className="pill pill-cyan">Standby</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Full Alert Panel */}
          <div style={{ marginBottom: 20 }}>
            <AlertPanel
              alerts={activeAlerts}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              socket={socketInstance}
              backendUrl={BACKEND_URL}
            />
          </div>

          {/* Simulated Emergency Dispatch Control (Gap #1 addressed) */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">
              <h2 style={{ fontSize: 16 }}>Tactical Dispatch Simulation</h2>
              <span className="pill pill-orange">SIMULATION ONLY</span>
            </div>
            <div style={{ marginTop: 16 }}>
              <MockDispatchControl
                socket={socketInstance}
                backendUrl={BACKEND_URL}
                toasts={mockToasts}
                onDismissToast={(i) => setMockToasts((prev) => prev.filter((_, idx) => idx !== i))}
              />
            </div>
          </div>

          {/* Audit Log (also includes timeline from PostEventAnalysisView logic) */}
          <div style={{ marginBottom: 20 }}>
            <AuditLogView
              logs={auditLogs}
              playbookSteps={playbookSteps}
              assistantInstructions={assistantInstructions}
              onRefresh={fetchAuditLogs}
            />
          </div>

        </div>
      </section>

      {/* ── Known Limitations Modal (global) ────────────────────────────── */}
      <KnownLimitationsModal isOpen={showLimitations} onClose={() => setShowLimitations(false)} />

    </div>
  )
}
