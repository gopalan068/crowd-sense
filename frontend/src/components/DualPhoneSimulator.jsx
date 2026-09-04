/**
 * frontend/src/components/DualPhoneSimulator.jsx
 * Dual-Phone Field Mobile Simulator (Dedicated View / Port 5174).
 *
 * Displays the Citizen Emergency App and Field Responder Patrol View
 * side-by-side in realistic mocked smartphone device frames in a single window.
 *
 * Demonstrates live bidirectional synchronization:
 *   1. Citizen sends emergency report on Left Phone -> instantly triggers alert on Right Phone (Responder).
 *   2. Responder acknowledges & updates status on Right Phone -> instantly updates live status timeline on Left Phone (Citizen).
 */
import React, { useState, useEffect } from 'react'
import CitizenReportView from './CitizenReportView'
import ResponderDashboard from './ResponderDashboard'

export default function DualPhoneSimulator({
  socket,
  backendUrl,
  connected,
  reconnectCount,
  onRetry,
  activeAlerts = [],
  onAcknowledge,
}) {
  const [currentTime, setCurrentTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const d = new Date()
      const hours = String(d.getHours()).padStart(2, '0')
      const mins = String(d.getMinutes()).padStart(2, '0')
      setCurrentTime(`${hours}:${mins}`)
    }
    updateTime()
    const timer = setInterval(updateTime, 10000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Top Simulator Control Bar */}
      <header className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md text-sm">
            📱
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              CrowdSense Field Mobile Simulator
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 font-mono-num font-normal">
                {window.location.port === '5174' ? 'PORT 5174 (DEDICATED)' : 'DUAL PHONE MODE'}
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
              Live Side-by-Side Citizen SOS ↔ Field Patrol Synchronization Demo
            </p>
          </div>
        </div>

        {/* Live Metrics & Connectivity Badges */}
        <div className="flex items-center gap-3 text-xs font-mono-num">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Sync: <strong className="text-sky-600 dark:text-sky-400">Bidirectional WS</strong></span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
            <span
              className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}
            />
            <span className="text-slate-700 dark:text-slate-300">{connected ? 'WS CONNECTED' : 'DISCONNECTED'}</span>
          </div>

          <a
            href={window.location.port ? `${window.location.protocol}//${window.location.hostname}:5173` : '/'}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-50 dark:bg-sky-600/20 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-600/30 font-bold transition-all flex items-center gap-1.5 shadow-xs"
          >
            🖥️ Open Command Ops Dashboard ↗
          </a>
        </div>
      </header>

      {/* Synchronized Demo Guidance Banner */}
      <div className="px-6 py-2.5 bg-sky-50 dark:bg-slate-900 border-b border-sky-100 dark:border-slate-800 text-xs font-mono-num text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 text-sm">💡</span>
          <span>
            <strong className="text-slate-900 dark:text-white">Interactive Demo:</strong> Tap <span className="text-rose-600 dark:text-rose-400 font-bold">"🚨 SEND EMERGENCY REPORT"</span> on the Left Citizen Phone → instantly watch the alert beep &amp; appear on the Right Responder Phone!
          </span>
        </div>
        <div className="text-slate-500 dark:text-slate-400 text-[11px]">
          Both devices connected to <code className="text-sky-600 dark:text-sky-400 font-bold">{window.location.hostname}</code>
        </div>
      </div>

      {/* Main Container: Dual Smartphone Mockups Side-by-Side */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full flex items-center justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 w-full max-w-6xl items-start">

          {/* ══════════════════════════════════════════════════════════════════
              PHONE 1 (LEFT): CITIZEN EMERGENCY SOS APP
             ══════════════════════════════════════════════════════════════════ */}
          <div className="flex flex-col items-center space-y-3">
            {/* Phone Label */}
            <div className="flex items-center justify-between w-full max-w-[390px] px-2 font-mono-num text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                DEVICE 1: CITIZEN SOS APP
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">Crowd Mobile Web</span>
            </div>

            {/* Smartphone Chassis Frame (iPhone Style) */}
            <div className="relative w-full max-w-[390px] h-[660px] rounded-[44px] border-[8px] border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-xl overflow-hidden isolate flex flex-col">
              {/* Speaker Notch & Camera Island */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-5 bg-slate-200 dark:bg-slate-800 rounded-b-xl z-40 flex items-center justify-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-900 border border-slate-300 dark:border-slate-700" />
                <div className="w-9 h-1 rounded-full bg-slate-400 dark:bg-slate-900" />
              </div>

              {/* Status Bar */}
              <div className="pt-2.5 px-6 pb-1 flex items-center justify-between text-[11px] font-mono-num text-slate-600 dark:text-slate-400 font-bold z-30 select-none bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/50 flex-shrink-0">
                <span>{currentTime || '09:41'}</span>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span>5G</span>
                  <span>📶</span>
                  <span>🔋 98%</span>
                </div>
              </div>

              {/* App View Screen */}
              <div className="flex-1 overflow-hidden min-h-0 relative bg-slate-50 dark:bg-slate-950 isolate">
                <CitizenReportView
                  socket={socket}
                  backendUrl={backendUrl}
                />
              </div>

              {/* Home Indicator Bar */}
              <div className="py-2 flex justify-center bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800/50 z-30">
                <div className="w-32 h-1 rounded-full bg-slate-400 dark:bg-slate-600/60" />
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              PHONE 2 (RIGHT): FIELD RESPONDER PATROL DASHBOARD
             ══════════════════════════════════════════════════════════════════ */}
          <div className="flex flex-col items-center space-y-3">
            {/* Phone Label */}
            <div className="flex items-center justify-between w-full max-w-[390px] px-2 font-mono-num text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                DEVICE 2: FIELD PATROL APP
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">Rugged Tactical Terminal</span>
            </div>

            {/* Smartphone Chassis Frame (Android Tactical Style) */}
            <div className="relative w-full max-w-[390px] h-[660px] rounded-[44px] border-[8px] border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-xl overflow-hidden isolate flex flex-col">
              {/* Speaker Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-slate-200 dark:bg-slate-800 rounded-b-xl z-40 flex items-center justify-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-900 border border-slate-300 dark:border-slate-700" />
                <div className="w-8 h-1 rounded-full bg-slate-400 dark:bg-slate-900" />
              </div>

              {/* Status Bar */}
              <div className="pt-2.5 px-6 pb-1 flex items-center justify-between text-[11px] font-mono-num text-slate-600 dark:text-slate-400 font-bold z-30 select-none bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/50 flex-shrink-0">
                <span>{currentTime || '09:41'}</span>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">GPS FIXED</span>
                  <span>📶</span>
                  <span>🔋 95%</span>
                </div>
              </div>

              {/* App View Screen */}
              <div className="flex-1 overflow-hidden min-h-0 relative flex flex-col bg-slate-50 dark:bg-slate-950 isolate">
                <ResponderDashboard
                  socket={socket}
                  backendUrl={backendUrl}
                  connected={connected}
                  reconnectCount={reconnectCount}
                  onRetry={onRetry}
                  activeAlerts={activeAlerts}
                  onAcknowledge={onAcknowledge}
                />
              </div>

              {/* Home Indicator Bar */}
              <div className="py-2 flex justify-center bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800/50 z-30">
                <div className="w-32 h-1 rounded-full bg-slate-400 dark:bg-slate-600/60" />
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer Info */}
      <footer className="py-3 px-6 text-center text-xs font-mono-num text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950">
        CrowdSense · Dual-Phone Field Mobile Simulator · Live Peer-to-Peer Safety Pipeline
      </footer>
    </div>
  )
}
