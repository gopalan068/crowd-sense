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
  {
    title: 'Responder Check-In (Manual Zone)',
    desc: 'Nearest-team assignment uses manual zone check-in, not live GPS tracking. Responders select their current zone at check-in; "nearest team" means the closest checked-in zone to the alert zone — a simple lookup, not coordinate math. No location data is collected or stored.',
    category: 'RESPONDER ROLE',
  },
  {
    title: 'Pre-Authored Response Routes',
    desc: 'Recommended response paths shown to field responders are pre-defined, hand-authored zone-to-zone connections in the system configuration — not computed at runtime. No pathfinding algorithm, graph traversal, or live obstacle-avoidance routing is used.',
    category: 'RESPONDER ROLE',
  },
  {
    title: 'In-App Alert Notifications (No Push)',
    desc: 'Field responder alerts are delivered via a persistent live in-app WebSocket feed with audio cue (Web Audio API). No OS-level push notifications or background service workers are used. The responder tab must remain open to receive alerts.',
    category: 'RESPONDER ROLE',
  },
  {
    title: 'Simulated Weather Conditions & Demo Controls',
    desc: 'Weather conditions are simulated and manually set via presenter demo controls, not pulled from a live weather service. Preset environmental conditions (including a combined Hot + Heavy Rain preset) are mutually exclusive menu selections for this demo. Production deployment would integrate a live API (e.g. OpenWeatherMap) for continuous real-time conditions at the venue.',
    category: 'ENVIRONMENTAL',
  },
  {
    title: 'Post-Incident Reports (Groq LLM API & Local Fallback)',
    desc: 'Post-incident reports are generated using Groq\'s LLM API (openai/gpt-oss-120b / qwen/qwen3.6-27b) from real system-collected data (density history, audit logs, responder updates); any supplementary reference figures are clearly marked as simulated. Report generation requires internet connectivity; if Groq is unavailable, an honest local deterministic fallback clearly marked with "[GENERATION SOURCE: LOCAL DETERMINISTIC ENGINE]" is used, alongside SQLite report caching for demo reliability.',
    category: 'CAPSTONE REPORT',
  },
  {
    title: 'Estimated Peak Concurrent Occupancy vs Total Footfall',
    desc: 'Zone occupancy metrics represent Estimated Peak Concurrent Occupancy (density × calibrated area) at a specific moment. Density-based counting cannot deduplicate individuals who transit between zones or arrive/depart over time, and is never presented as cumulative unique event footfall.',
    category: 'OCCUPANCY METRIC',
  },
  {
    title: 'Response Playbooks (NDMA Grounding & Decision Support)',
    desc: 'Response playbooks combine NDMA-guideline-adapted protocols with illustrative defaults for incident types without direct official guidance (clearly labeled in each entry). Contextual narrative framing is LLM-generated from this static data and does not alter the underlying steps or resource figures. This is decision support; final response decisions rest with on-ground command.',
    category: 'DECISION SUPPORT',
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
