/**
 * frontend/src/components/KnownLimitationsModal.jsx
 * In-product info drawer surfacing Section 12 blueprint limitations proactively.
 */
import React from 'react'

const LIMITATIONS = [
  {
    title: 'Manual Fixed Area Calibration',
    desc: 'Zone footprint square metres (area_sqm) is a manually configured constant for this demo, not dynamically estimated via camera homography correction.',
    category: 'CALIBRATION',
  },
  {
    title: 'Optical Flow vs Per-Person Tracking',
    desc: 'Uses OpenCV dense optical flow (Farneback) for motion vector fields instead of identity tracking (ByteTrack), trading identity precision for demo reliability at extreme densities.',
    category: 'COMPUTER VISION',
  },
  {
    title: 'Pre-Recorded Demo Feed',
    desc: 'Zone 2 Emergency Corridor uses pre-recorded crowd footage (or synthetic generator) on a loop to reliably push density past red thresholds during judge evaluation.',
    category: 'DEMO DATA',
  },
  {
    title: 'Simulated Dispatch & Announcements',
    desc: 'Police/ambulance dispatch and siren triggers are simulated UI actions (mock toasts) and not connected to live emergency services API infrastructure.',
    category: 'INTEGRATION',
  },
  {
    title: 'Privacy & Identity Preservation',
    desc: 'Anonymous headcount & density metrics only. Zero facial recognition, biometric identity storage, or individual tracking is performed.',
    category: 'PRIVACY & ETHICS',
  },
]

export default function KnownLimitationsModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs font-mono-num animate-fadeIn">
      <div
        className="w-full max-w-2xl rounded-xl border shadow-2xl p-6 space-y-5 overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">ℹ️</span>
            <div>
              <h2 className="font-bold text-base uppercase tracking-tight" style={{ color: 'var(--color-text)' }}>
                System Architecture &amp; Known Limitations
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Proactive disclosures per Section 12 of Master Blueprint
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 font-bold text-xs"
          >
            ✕ CLOSE
          </button>
        </div>

        <div className="space-y-3">
          {LIMITATIONS.map((lim, idx) => (
            <div key={idx} className="p-3.5 rounded-lg border bg-slate-900 text-slate-100 border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sky-400 text-xs">{lim.title}</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  {lim.category}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{lim.desc}</p>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t flex justify-end" style={{ borderColor: 'var(--color-border)' }}>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs"
          >
            ACKNOWLEDGE &amp; RETURN TO DASHBOARD
          </button>
        </div>
      </div>
    </div>
  )
}
