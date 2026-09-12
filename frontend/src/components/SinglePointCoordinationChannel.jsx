/**
 * frontend/src/components/SinglePointCoordinationChannel.jsx
 * Single-Point Coordination Channel feed for unified real-time multi-agency coordination
 * (Police, Medical, Ambulance, Organizers, Evacuation Team, Authorities).
 */
import React, { useEffect, useState, useRef } from 'react'

const AGENCY_CONFIG = {
  POLICE: {
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.08)',
    border: 'rgba(56, 189, 248, 0.3)',
    icon: '🚓',
  },
  MEDICAL: {
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.08)',
    border: 'rgba(52, 211, 153, 0.3)',
    icon: '🩺',
  },
  AMBULANCE: {
    color: '#f87171',
    bg: 'rgba(248, 113, 113, 0.08)',
    border: 'rgba(248, 113, 113, 0.3)',
    icon: '🚑',
  },
  ORGANIZERS: {
    color: '#22d3ee',
    bg: 'rgba(34, 211, 238, 0.08)',
    border: 'rgba(34, 211, 238, 0.3)',
    icon: '🎙️',
  },
  'EVAC TEAM': {
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.08)',
    border: 'rgba(251, 191, 36, 0.3)',
    icon: '🚧',
  },
  AUTHORITIES: {
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.08)',
    border: 'rgba(148, 163, 184, 0.3)',
    icon: '🏛️',
  },
}

function formatCurrentTime(date = new Date()) {
  return date.toTimeString().split(' ')[0]
}

export default function SinglePointCoordinationChannel({
  socket = null,
  activeAlerts = [],
  assistantInstructions = [],
  zoneMap = {},
}) {
  const [currentTime, setCurrentTime] = useState(formatCurrentTime())
  const [messages, setMessages] = useState(() => {
    const now = Date.now()
    return [
      {
        id: 'msg_1',
        agency: 'POLICE',
        text: 'Unit 4 positioned at Zone 2 / Exit E2 corridor.',
        timestamp: formatCurrentTime(new Date(now - 8000)),
      },
      {
        id: 'msg_2',
        agency: 'MEDICAL',
        text: 'Team 2 dispatched to Zone 4, ETA 3 min.',
        timestamp: formatCurrentTime(new Date(now - 16000)),
      },
      {
        id: 'msg_3',
        agency: 'POLICE',
        text: 'Unit 4 positioned at Zone 2 / Exit E2 corridor.',
        timestamp: formatCurrentTime(new Date(now - 28000)),
      },
      {
        id: 'msg_4',
        agency: 'MEDICAL',
        text: 'Team 2 dispatched to Zone 4, ETA 3 min.',
        timestamp: formatCurrentTime(new Date(now - 45000)),
      },
      {
        id: 'msg_5',
        agency: 'EVAC TEAM',
        text: 'Barricades at Gate 3 being repositioned to reduce inflow.',
        timestamp: formatCurrentTime(new Date(now - 65000)),
      },
      {
        id: 'msg_6',
        agency: 'AMBULANCE',
        text: 'Ambulance 1 route confirmed clear via dedicated emergency corridor.',
        timestamp: formatCurrentTime(new Date(now - 90000)),
      },
      {
        id: 'msg_7',
        agency: 'AUTHORITIES',
        text: 'District control room acknowledges Zone 2 corridor status — monitoring.',
        timestamp: formatCurrentTime(new Date(now - 120000)),
      },
    ]
  })

  const [inputAgency, setInputAgency] = useState('POLICE')
  const [inputText, setInputText] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const feedRef = useRef(null)

  // Real-time clock ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(formatCurrentTime())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Push new message helper
  const addMessage = (agency, text) => {
    const newMsg = {
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      agency,
      text,
      timestamp: formatCurrentTime(),
    }
    setMessages((prev) => [newMsg, ...prev.slice(0, 24)])
  }

  // Socket.io real-time event listeners
  useEffect(() => {
    if (!socket) return

    const handleMockDispatch = (toast) => {
      if (!toast) return
      const title = (toast.title || '').toUpperCase()
      let agency = 'EVAC TEAM'
      if (title.includes('POLICE')) agency = 'POLICE'
      else if (title.includes('MEDICAL') || title.includes('AMBULANCE')) agency = 'MEDICAL'
      else if (title.includes('SIREN') || title.includes('ANNOUNCEMENT')) agency = 'ORGANIZERS'

      addMessage(agency, toast.message || toast.title)
    }

    const handleAssistantInstruction = (inst) => {
      if (!inst) return
      const zoneName = inst.zoneId === 'zone_2' ? 'Zone 2' : inst.zoneId === 'zone_1' ? 'Zone 1' : 'Venue'
      let cleanText = (inst.text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^Here'?s\s+a\s+thinking\s+process:?[\s\S]*/i, '')
        .trim()
      if (!cleanText) cleanText = `${zoneName} surge detected. Deploy marshals to clear bottleneck routes.`
      addMessage('ORGANIZERS', `[AI Broadcast] ${cleanText}`)
    }

    const handleAlertTriggered = (alert) => {
      if (!alert) return
      const zoneName = alert.zone_id ? alert.zone_id.replace('_', ' ').toUpperCase() : 'SECTOR'
      const alertType = alert.alert_type ? alert.alert_type.replace(/_/g, ' ') : 'surge'
      addMessage('POLICE', `🚨 Alert Triggered: ${zoneName} - ${alertType}. Dispatching field responders.`)
    }

    const handlePlaybookStep = (step) => {
      if (!step) return
      addMessage('EVAC TEAM', `Playbook step executed: ${step.step_name || 'Dynamic reroute action applied.'}`)
    }

    socket.on('mock_dispatch_toast', handleMockDispatch)
    socket.on('assistant_instruction', handleAssistantInstruction)
    socket.on('alert_triggered', handleAlertTriggered)
    socket.on('playbook_step_completed', handlePlaybookStep)

    return () => {
      socket.off('mock_dispatch_toast', handleMockDispatch)
      socket.off('assistant_instruction', handleAssistantInstruction)
      socket.off('alert_triggered', handleAlertTriggered)
      socket.off('playbook_step_completed', handlePlaybookStep)
    }
  }, [socket])

  // Contextual periodic real-time updates when system is operational
  useEffect(() => {
    const routineUpdates = [
      { agency: 'POLICE', text: 'Unit 4 patrol reports smooth pedestrian velocity at Exit E2.' },
      { agency: 'EVAC TEAM', text: 'Connecting Channel 3 width telemetry verified clear.' },
      { agency: 'ORGANIZERS', text: 'Public audio announcement system synced to green egress vectors.' },
      { agency: 'MEDICAL', text: 'Triage post at Northern Lawn reports normal status.' },
      { agency: 'AMBULANCE', text: 'Dedicated corridor R2 clear of pedestrian obstructions.' },
      { agency: 'AUTHORITIES', text: 'Central command telemetry stream active (3/4 Exits operational).' },
    ]

    const interval = setInterval(() => {
      const randomUpdate = routineUpdates[Math.floor(Math.random() * routineUpdates.length)]
      addMessage(randomUpdate.agency, randomUpdate.text)
    }, 16000)

    return () => clearInterval(interval)
  }, [])

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!inputText.trim()) return
    addMessage(inputAgency, inputText.trim())
    setInputText('')
  }

  return (
    <div className="card" style={{ marginBottom: 40 }}>
      {/* Header matching exact layout */}
      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Single-Point Coordination Channel
          </h2>
          <span className="sub" style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, display: 'block' }}>
            Police · medical · ambulance · organizers · evacuation team · authorities — one shared feed
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setShowComposer((v) => !v)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 6,
              background: showComposer ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border)',
              color: showComposer ? 'var(--cyan)' : 'var(--text-dim)',
              cursor: 'pointer',
            }}
          >
            {showComposer ? '✕ Close Dispatch' : '➕ Broadcast Dispatch'}
          </button>
        </div>
      </div>

      {/* Clock bar with subtle live time indicator */}
      <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 48, height: 1, background: 'var(--border)' }} />
        <span style={{ fontFamily: 'var(--font-m)', fontSize: 11, color: 'var(--text-faint)' }}>
          {currentTime}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Manual Broadcast Composer (Collapsible) */}
      {showComposer && (
        <form
          onSubmit={handleSendMessage}
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: 8,
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>AGENCY:</span>
            {Object.keys(AGENCY_CONFIG).map((ag) => {
              const cfg = AGENCY_CONFIG[ag]
              const isSel = inputAgency === ag
              return (
                <button
                  type="button"
                  key={ag}
                  onClick={() => setInputAgency(ag)}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: isSel ? cfg.bg : 'transparent',
                    border: `1px solid ${isSel ? cfg.color : 'var(--border)'}`,
                    color: isSel ? cfg.color : 'var(--text-faint)',
                    cursor: 'pointer',
                  }}
                >
                  {ag}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Broadcast update as ${inputAgency}...`}
              style={{
                flex: 1,
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 12px',
                color: 'var(--text)',
                fontSize: 12.5,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              style={{
                background: inputText.trim() ? 'var(--cyan)' : 'var(--border)',
                color: '#04121a',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: inputText.trim() ? 'pointer' : 'default',
              }}
            >
              SEND
            </button>
          </div>
        </form>
      )}

      {/* Coordination Messages Feed */}
      <div
        ref={feedRef}
        className="comms-channel"
        style={{
          maxHeight: 280,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {messages.map((m) => {
          const cfg = AGENCY_CONFIG[m.agency] || AGENCY_CONFIG.AUTHORITIES
          return (
            <div
              key={m.id}
              className="comm-msg"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                padding: '10px 4px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {/* Agency Tag Pill */}
              <span
                className="comm-tag"
                style={{
                  color: cfg.color,
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 5,
                  minWidth: 78,
                  textAlign: 'center',
                  letterSpacing: '0.04em',
                }}
              >
                {m.agency}
              </span>

              {/* Message text and Timestamp */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="txt"
                  style={{
                    fontSize: 13,
                    color: 'var(--text-dim)',
                    lineHeight: 1.4,
                  }}
                >
                  {m.text}
                </div>
                <div
                  className="ts"
                  style={{
                    fontSize: 10.5,
                    color: 'var(--text-faint)',
                    fontFamily: 'var(--font-m)',
                    marginTop: 4,
                  }}
                >
                  {m.timestamp}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
