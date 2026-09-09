import React, { useState, useRef, useEffect } from 'react'

/**
 * frontend/src/components/AssistantChatPanel.jsx
 *
 * Collapsible / Secondary Q&A chat panel for control room staff follow-up questions.
 * Grounded in live zone telemetry, active alerts, gate states, and demo-preset weather.
 */
export default function AssistantChatPanel({ backendUrl = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Control Room Assistant active. Ask questions regarding current live zone density, active incident alerts, or emergency gate recommendations.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ])

  const messagesEndRef = useRef(null)

  const quickPrompts = [
    'What is the current risk status of Zone 1 and Zone 2?',
    'Are there any gate recommendations right now?',
    'Summarize active incident alerts.',
    'What are the standard actions for an orange alert?',
  ]

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  const handleSendMessage = async (customText = null) => {
    const textToSend = customText || inputMessage
    if (!textToSend || !textToSend.trim() || loading) return

    const userMsg = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString(),
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
          text: data.answer || "No response received.",
          timestamp: new Date().toLocaleTimeString(),
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
            text: "I can't reach the assistant right now. Check the dashboard directly for current zone status.",
            timestamp: new Date().toLocaleTimeString(),
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
          text: "I can't reach the assistant right now. Check the dashboard directly for current zone status.",
          timestamp: new Date().toLocaleTimeString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="rounded-xl border shadow-sm transition-all overflow-hidden"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Panel Header & Collapse Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-3.5 flex items-center justify-between transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-left"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xl">💬</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-wide uppercase" style={{ color: 'var(--color-text)' }}>
                Control Room Assistant Q&amp;A
              </h3>
              <span className="text-[10px] font-mono-num px-2 py-0.5 rounded-full bg-sky-600/20 text-sky-600 dark:text-sky-400 font-bold">
                PULL MODE
              </span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              Ask follow-up questions grounded in live zone telemetry &amp; gate states
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono-num text-xs font-bold" style={{ color: 'var(--color-accent)' }}>
          <span>{isOpen ? '▲ HIDE CHAT' : '▼ OPEN CHAT'}</span>
        </div>
      </button>

      {/* Collapsible Body */}
      {isOpen && (
        <div className="p-4 border-t flex flex-col space-y-4" style={{ borderColor: 'var(--color-border)' }}>
          {/* Quick Query Prompt Chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono-num font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
              SUGGESTED OPERATIONAL INQUIRIES:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  disabled={loading}
                  className="px-2.5 py-1 rounded-md text-xs font-mono-num text-left transition-all border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div
            className="flex-1 max-h-[340px] min-h-[180px] overflow-y-auto space-y-3 p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-950/40"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {messages.map((m) => {
              const isUser = m.sender === 'user'
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-mono-num" style={{ color: 'var(--color-muted)' }}>
                    <span>{isUser ? '👤 Official' : '🤖 Assistant'}</span>
                    <span>·</span>
                    <span>{m.timestamp}</span>
                  </div>

                  <div
                    className={`px-3.5 py-2.5 rounded-xl text-xs md:text-sm max-w-[85%] leading-relaxed ${isUser
                      ? 'bg-sky-600 text-white rounded-br-none shadow-xs font-medium'
                      : 'bg-white dark:bg-slate-900 border text-slate-800 dark:text-slate-100 rounded-bl-none shadow-xs'
                      }`}
                    style={{
                      borderColor: isUser ? 'transparent' : 'var(--color-border)',
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              )
            })}

            {loading && (
              <div className="flex items-center gap-2 text-xs font-mono-num text-sky-600 dark:text-sky-400 py-1">
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
                <span>Consulting live telemetry &amp; standard procedures...</span>
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
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type an operational question (e.g. 'What is the density in Zone 2?')..."
              disabled={loading}
              className="flex-1 px-3.5 py-2 rounded-lg border text-xs md:text-sm font-sans focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
              style={{
                background: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
            <button
              type="submit"
              disabled={loading || !inputMessage.trim()}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white font-bold text-xs font-mono-num shadow-xs hover:bg-sky-700 disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              <span>SEND</span>
              <span>➤</span>
            </button>
          </form>

          {/* Persistent Disclaimer */}
          <p className="text-[11px] text-center font-mono-num opacity-75" style={{ color: 'var(--color-muted)' }}>
          </p>
        </div>
      )}
    </div>
  )
}
