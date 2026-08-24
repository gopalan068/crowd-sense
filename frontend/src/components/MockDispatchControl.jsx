/**
 * frontend/src/components/MockDispatchControl.jsx
 * Simulated Emergency Dispatch & Public Announcement Controls (Feature 13-14).
 *
 * Explicit scope compliance: Controls & toasts are styled with prominent
 * [SIMULATION ONLY] banners — NEVER implied as real dispatch integration.
 */
import React, { useState } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

export default function MockDispatchControl({ activeToasts = [], onDismissToast }) {
  const [loadingAction, setLoadingAction] = useState(null)

  const triggerMockDispatch = async (actionName, zoneId = 'zone_1') => {
    setLoadingAction(actionName)
    try {
      await fetch(`${BACKEND_URL}/api/dispatch/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionName, zone_id: zoneId }),
      })
    } catch (err) {
      console.error('[MockDispatch] Error triggering simulation:', err)
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="space-y-4 font-mono-num">
      {/* Simulation Toast Notification Stack */}
      {activeToasts.length > 0 && (
        <div className="space-y-2">
          {activeToasts.map((toast, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl border border-amber-500 bg-amber-950/90 text-amber-100 shadow-lg flex items-center justify-between animate-panic"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📢</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-extrabold text-[10px] bg-amber-500 text-slate-950 uppercase">
                      SIMULATION ONLY
                    </span>
                    <span className="font-bold text-xs">{toast.title || 'MOCK DISPATCH ACTIVATED'}</span>
                  </div>
                  <p className="text-xs text-amber-200 mt-0.5">{toast.message}</p>
                </div>
              </div>
              <button
                onClick={() => onDismissToast(idx)}
                className="text-xs font-bold px-2.5 py-1 rounded bg-amber-900 hover:bg-amber-800 text-amber-100"
              >
                DISMISS
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Control Actions Box */}
      <div
        className="p-5 rounded-xl border space-y-4"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              📢 Emergency Dispatch &amp; Siren Controls
              <span className="text-[10px] font-mono-num font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300">
                SIMULATED ACTION CONTROL
              </span>
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              Triggers simulated police/ambulance dispatch broadcasts and public announcement toasts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => triggerMockDispatch('POLICE & AMBULANCE DISPATCH', 'zone_1')}
            disabled={loadingAction !== null}
            className="p-3 rounded-lg border border-sky-500/40 bg-sky-950/40 hover:bg-sky-900/60 text-sky-200 text-xs font-bold transition-all text-left flex flex-col justify-between space-y-2 active:scale-95"
          >
            <div className="flex justify-between items-center">
              <span>🚓 DISPATCH POLICE</span>
              <span className="text-[10px] opacity-70">MOCK</span>
            </div>
            <span className="text-[10px] text-sky-400 font-normal">Broadcast squad response to Zone 1</span>
          </button>

          <button
            onClick={() => triggerMockDispatch('SIREN & PUBLIC ANNOUNCEMENT', 'zone_2')}
            disabled={loadingAction !== null}
            className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/40 hover:bg-amber-900/60 text-amber-200 text-xs font-bold transition-all text-left flex flex-col justify-between space-y-2 active:scale-95"
          >
            <div className="flex justify-between items-center">
              <span>🚨 TRIGGER SIREN</span>
              <span className="text-[10px] opacity-70">MOCK</span>
            </div>
            <span className="text-[10px] text-amber-400 font-normal">Activate corridor exit warning tone</span>
          </button>

          <button
            onClick={() => triggerMockDispatch('MEDICAL RESPONSE UNIT', 'zone_2')}
            disabled={loadingAction !== null}
            className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-200 text-xs font-bold transition-all text-left flex flex-col justify-between space-y-2 active:scale-95"
          >
            <div className="flex justify-between items-center">
              <span>🚑 DISPATCH AMBULANCE</span>
              <span className="text-[10px] opacity-70">MOCK</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-normal">Clear corridor medical route</span>
          </button>
        </div>
      </div>
    </div>
  )
}
