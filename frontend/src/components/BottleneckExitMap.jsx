/**
 * frontend/src/components/BottleneckExitMap.jsx
 * Static Annotated Venue Map with Choke Points & Egress Routes (Mock Only - Feature 12).
 *
 * Explicit scope note: Static annotated vector layout only — zero dynamic routing computation.
 */
import React, { useState } from 'react'

const CHOKE_POINTS = [
  {
    id: 'choke_1',
    name: 'Gate A Main Turnstiles',
    type: 'PRIMARY ENTRY/EXIT',
    capacity: '120 people/min',
    width: '3.5 metres',
    riskNote: 'High convergence risk during arrival surge.',
    cx: 120,
    cy: 320,
  },
  {
    id: 'choke_2',
    name: 'Emergency Corridor Egress Ramp 2',
    type: 'EMERGENCY EGRESS',
    capacity: '80 people/min',
    width: '2.2 metres',
    riskNote: 'Bottleneck choke point. Must remain clear at all times.',
    cx: 480,
    cy: 160,
  },
  {
    id: 'choke_3',
    name: 'Stage Front Perimeter Barrier',
    type: 'HIGH DENSITY SURGE',
    capacity: '200 people/min max',
    width: '12.0 metres',
    riskNote: 'Primary crowd surge focal point during stage entry.',
    cx: 300,
    cy: 120,
  },
]

export default function BottleneckExitMap() {
  const [selectedPoint, setSelectedPoint] = useState(CHOKE_POINTS[1])

  return (
    <div
      className="p-5 rounded-xl border space-y-4 font-mono-num"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h2 className="text-base font-bold tracking-tight uppercase flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            🗺️ Venue Bottleneck &amp; Egress Route Map
            <span className="text-[10px] font-mono-num font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300">
              STATIC ANNOTATED MAP (MOCK ONLY)
            </span>
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
            Annotated choke points, corridor widths, and evacuation paths.
          </p>
        </div>
      </div>

      {/* SVG Map Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">

        {/* Vector SVG Map Container (8 cols) */}
        <div className="lg:col-span-8 relative bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-hidden">
          <svg viewBox="0 0 600 400" className="w-full h-80">
            {/* Outer venue boundary */}
            <rect x="20" y="20" width="560" height="360" rx="12" fill="#0f172a" stroke="#334155" strokeWidth="2" />

            {/* Zone 1 General Gathering Area */}
            <rect x="50" y="50" width="340" height="240" rx="8" fill="rgba(56, 189, 248, 0.05)" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 4" />
            <text x="70" y="80" fill="#38bdf8" fontSize="11" fontWeight="bold">ZONE 1: GENERAL GATHERING</text>

            {/* Zone 2 Emergency Corridor */}
            <rect x="420" y="50" width="130" height="240" rx="8" fill="rgba(239, 68, 68, 0.1)" stroke="#ef4444" strokeWidth="2" />
            <text x="430" y="80" fill="#ef4444" fontSize="10" fontWeight="bold">ZONE 2: CORRIDOR</text>

            {/* Evacuation Arrows */}
            <path d="M 390 170 L 420 170" stroke="#f97316" strokeWidth="3" markerEnd="url(#arrow)" />

            {/* Choke Point Markers */}
            {CHOKE_POINTS.map((pt) => {
              const isSelected = selectedPoint?.id === pt.id
              return (
                <g key={pt.id} onClick={() => setSelectedPoint(pt)} className="cursor-pointer">
                  <circle
                    cx={pt.cx}
                    cy={pt.cy}
                    r={isSelected ? 14 : 10}
                    fill={isSelected ? '#f97316' : '#ef4444'}
                    stroke="#ffffff"
                    strokeWidth="2"
                    className="transition-all hover:scale-125"
                  />
                  <text x={pt.cx + 18} y={pt.cy + 4} fill="#f8fafc" fontSize="10" fontWeight="bold">
                    {pt.name}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Selected Choke Point Annotation Box (4 cols) */}
        <div className="lg:col-span-4 p-4 rounded-xl border space-y-3 bg-slate-900 text-slate-100 border-slate-800 flex flex-col justify-between">
          {selectedPoint ? (
            <div className="space-y-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-600 text-white uppercase">
                {selectedPoint.type}
              </span>
              <h3 className="font-bold text-sm text-sky-400 mt-1">{selectedPoint.name}</h3>
              <div className="text-xs space-y-1 text-slate-300">
                <p>Max Flow Capacity: <strong className="text-white">{selectedPoint.capacity}</strong></p>
                <p>Passage Width: <strong className="text-white">{selectedPoint.width}</strong></p>
                <p className="text-amber-300 mt-2 text-[11px] border-t border-slate-800 pt-2">
                  ⚠️ {selectedPoint.riskNote}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Click any map marker to view bottleneck capacity.</p>
          )}

          <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-400">
            ℹ️ Static annotated diagram per Section 12 blueprint specifications.
          </div>
        </div>

      </div>
    </div>
  )
}
