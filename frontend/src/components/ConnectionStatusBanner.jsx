/**
 * frontend/src/components/ConnectionStatusBanner.jsx
 * Graceful Live Connection Status & Auto-Recovery Banner.
 *
 * Renders clear error states when WebSocket disconnects or backend restarts,
 * giving users clear recovery instructions rather than blanking out.
 */
import React from 'react'

export default function ConnectionStatusBanner({ connected, reconnectAttempts = 0, onRetry }) {
  if (connected) return null

  return (
    <div className="w-full bg-amber-600 text-white px-4 py-2.5 flex items-center justify-between shadow-md font-mono-num text-xs animate-fadeIn">
      <div className="flex items-center gap-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
        <span className="font-bold uppercase tracking-wide">
          ⚠️ Connection Lost to Backend (Attempt {reconnectAttempts}/10)
        </span>
        <span className="hidden sm:inline text-amber-100">
          — Real-time Socket.io stream interrupted. Auto-reconnecting to http://localhost:4000...
        </span>
      </div>

      <button
        onClick={onRetry}
        className="px-3 py-1 rounded bg-white text-amber-950 font-bold hover:bg-amber-100 transition-all text-[11px]"
      >
        🔄 RECONNECT NOW
      </button>
    </div>
  )
}
