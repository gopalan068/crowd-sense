import React, { useState, useRef, useEffect } from 'react'

/**
 * frontend/src/components/AssistantChatPanel.jsx
 *
 * Grounded Control Room Assistant Q&A Chat component.
 * Supports embedded mode for the Homepage CrowdSense AI Agent card.
 * Grounded in live zone telemetry, active alerts, gate states, and weather.
 */
export default function AssistantChatPanel({ backendUrl = '', embedded = false }) {
  const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'history'
  const [instructionHistory, setInstructionHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'CrowdSense AI Assistant ready. Ask questions regarding live zone telemetry, gate controls, active alerts, or evacuation readiness.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])

  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  // Fetch instruction history when tab is switched to 'history'
  useEffect(() => {
    if (activeTab !== 'history') return
    setLoadingHistory(true)
    fetch(`${backendUrl}/api/assistant/instructions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setInstructionHistory(Array.isArray(data) ? data : data.instructions || []))
      .catch(() => setInstructionHistory([]))
      .finally(() => setLoadingHistory(false))
  }, [activeTab, backendUrl])

  const handleSendMessage = async (customText = null) => {
    const textToSend = customText || inputMessage
    if (!textToSend || !textToSend.trim() || loading) return

    const userMsg = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!customText) setInputMessage('')
    setLoading(true)

    try {
      const res = await fetch(`${backendUrl}/api/assistant/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg.text }),
      })

      if (res.ok) {
        const data = await res.json()
        const botMsg = {
          id: `bot_${Date.now()}`,
          sender: 'assistant',
          text: data.answer || 'No response received from agent.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: data.source,
          model: data.model,
        }
        setMessages((prev) => [...prev, botMsg])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            sender: 'assistant',
            text: "I can't reach the assistant server right now. Check live telemetry directly on the dashboard.",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      }
    } catch (err) {
      console.error('[AssistantChat] Network error:', err)
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: 'Network error contacting assistant. Telemetry fallback active.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`assistant-chat-container ${embedded ? 'embedded-chat' : 'standalone-chat'}`}
      style={{
        borderRadius: embedded ? 12 : 14,
        background: embedded ? 'rgba(13, 20, 36, 0.7)' : 'var(--surface)',
        border: embedded ? '1px solid var(--border)' : '1px solid var(--border-strong)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header bar / Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: embedded ? '8px 14px' : '10px 18px',
          background: 'rgba(18, 27, 49, 0.65)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--cyan)',
              boxShadow: '0 0 8px var(--cyan)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-m)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--cyan)',
              textTransform: 'uppercase',
            }}
          >
            AI ASSISTANT CONSOLE
          </span>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: 'rgba(6, 10, 19, 0.5)',
            padding: 2,
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            style={{
              padding: '3px 10px',
              fontSize: 10.5,
              fontWeight: 600,
              fontFamily: 'var(--font-m)',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'chat' ? 'var(--cyan-soft)' : 'transparent',
              color: activeTab === 'chat' ? 'var(--cyan)' : 'var(--text-faint)',
              transition: '0.15s',
            }}
          >
            💬 Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            style={{
              padding: '3px 10px',
              fontSize: 10.5,
              fontWeight: 600,
              fontFamily: 'var(--font-m)',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'history' ? 'var(--cyan-soft)' : 'transparent',
              color: activeTab === 'history' ? 'var(--cyan)' : 'var(--text-faint)',
              transition: '0.15s',
            }}
          >
            📋 Logs
          </button>
        </div>
      </div>

      {/* Main Body */}
      {activeTab === 'chat' ? (
        <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 14px', gap: 10 }}>
          {/* Messages Scroll Area */}
          <div
            style={{
              height: embedded ? 240 : 280,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(6, 10, 19, 0.6)',
              border: '1px solid var(--border)',
            }}
          >
            {messages.map((m) => {
              const isUser = m.sender === 'user'
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    gap: 3,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 9.5,
                      fontFamily: 'var(--font-m)',
                      color: 'var(--text-faint)',
                    }}
                  >
                    <span>{isUser ? '👤 Official' : '🤖 CrowdSense AI'}</span>
                    <span>·</span>
                    <span>{m.timestamp}</span>
                    {m.source && (
                      <span
                        style={{
                          padding: '1px 5px',
                          borderRadius: 4,
                          fontSize: 8.5,
                          background: 'rgba(58, 217, 245, 0.12)',
                          color: 'var(--cyan)',
                        }}
                      >
                        {m.source}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      maxWidth: '90%',
                      padding: '8px 12px',
                      borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                      fontSize: 12,
                      lineHeight: 1.45,
                      fontFamily: 'var(--font-b)',
                      background: isUser
                        ? 'linear-gradient(135deg, rgba(58, 217, 245, 0.25), rgba(92, 134, 255, 0.3))'
                        : 'var(--surface-2)',
                      border: isUser ? '1px solid rgba(58, 217, 245, 0.45)' : '1px solid var(--border)',
                      color: isUser ? '#fff' : 'var(--text)',
                      boxShadow: isUser ? '0 2px 8px rgba(58, 217, 245, 0.15)' : 'none',
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              )
            })}

            {loading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  fontFamily: 'var(--font-m)',
                  color: 'var(--cyan)',
                  padding: '4px 0',
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--cyan)',
                    animation: 'pulse 1.4s infinite',
                  }}
                />
                <span>Consulting live telemetry &amp; spatial rules...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input & Send Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSendMessage()
            }}
            style={{ display: 'flex', gap: 8 }}
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask AI about zone density, gates, crowd risk..."
              disabled={loading}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(6, 10, 19, 0.7)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: 12,
                fontFamily: 'var(--font-b)',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--cyan)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            />
            <button
              type="submit"
              disabled={loading || !inputMessage.trim()}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background:
                  !loading && inputMessage.trim()
                    ? 'linear-gradient(135deg, var(--cyan), var(--blue))'
                    : 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: !loading && inputMessage.trim() ? '#04121a' : 'var(--text-faint)',
                fontWeight: 700,
                fontSize: 11,
                fontFamily: 'var(--font-m)',
                cursor: !loading && inputMessage.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s ease',
                boxShadow: !loading && inputMessage.trim() ? '0 0 12px rgba(58, 217, 245, 0.35)' : 'none',
              }}
            >
              <span>SEND</span>
              <span>➤</span>
            </button>
          </form>
        </div>
      ) : (
        /* Instruction History Tab */
        <div style={{ padding: '12px 14px', height: embedded ? 288 : 330, overflowY: 'auto' }}>
          {loadingHistory && (
            <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontFamily: 'var(--font-m)', fontSize: 11, padding: 12 }}>
              Loading instructions…
            </div>
          )}
          {!loadingHistory && instructionHistory.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontFamily: 'var(--font-m)', fontSize: 11, padding: 12 }}>
              No instruction history recorded yet.
            </div>
          )}
          {!loadingHistory &&
            instructionHistory.map((instr, i) => (
              <div
                key={instr.instructionId || i}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-m)',
                    fontSize: 9.5,
                    color: 'var(--text-faint)',
                    flexShrink: 0,
                    paddingTop: 2,
                  }}
                >
                  {instr.timestamp ? new Date(instr.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </span>
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-m)',
                      fontSize: 10,
                      fontWeight: 700,
                      color:
                        instr.severity === 'red'
                          ? 'var(--red)'
                          : instr.severity === 'orange'
                          ? 'var(--orange)'
                          : 'var(--cyan)',
                      marginBottom: 3,
                    }}
                  >
                    {instr.ruleId || 'AI AGENT'} · {(instr.severity || 'info').toUpperCase()}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.35 }}>{instr.text}</div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
