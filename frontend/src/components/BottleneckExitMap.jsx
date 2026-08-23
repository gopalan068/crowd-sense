/**
 * frontend/src/components/BottleneckExitMap.jsx
 * Premium Operations Control Venue Map & Fixed Emergency Corridor Enforcement System.
 * 
 * Layout Geometry:
 * - Left Zone: Waiting & Arrival Staging Area (x: 40 to 230)
 * - Ultra-Narrow Connecting Throat Gap (x: 230 to 270 — 40px tight gap):
 *   1. Narrow IN Gate Channel (Top Entry)
 *   2. Narrow OUT Gate Channel (Middle Egress)
 *   3. Narrow Emergency Way Channel (Bottom Passage)
 * - Right Zone: Main Gathering Field (x: 270 to 780)
 * - X-Structure Emergency Network branching from Junction (560, 240)
 */
import React, { useState, useEffect } from 'react'

// Fixed Emergency Corridor Segments with 4.0m Corridor Network & X-Structure
const CORRIDOR_SEGMENTS = [
  {
    id: 'seg_1',
    name: 'Segment 1: Arrival Staging Ramp',
    marshal: 'Marshal Rajesh (Post 1 — Arrival)',
    width: '4.0 metres',
    startNode: { x: 120, y: 65 },
    endNode: { x: 120, y: 340 },
    controlPoint: { x: 100, y: 200 },
    amberThreshold: 0.5,
    redThreshold: 1.0,
    lengthMeters: 50,
  },
  {
    id: 'seg_2',
    name: 'Segment 2: 4.0m Emergency Passage to Junction',
    marshal: 'Marshal Suresh (Post 2 — Transit Hub)',
    width: '4.0 metres (120px Long Corridor)',
    startNode: { x: 120, y: 340 },
    endNode: { x: 570, y: 240 },
    controlPoint: { x: 270, y: 345 },
    amberThreshold: 0.5,
    redThreshold: 1.0,
    lengthMeters: 65,
  },
  {
    id: 'seg_3a',
    name: 'Segment 3A: X-Branch North Central (Stage Triage)',
    marshal: 'Marshal Vikram (Post 3A — Stage Triage)',
    width: '4.0 metres',
    startNode: { x: 570, y: 240 },
    endNode: { x: 570, y: 105 },
    controlPoint: { x: 570, y: 170 },
    amberThreshold: 0.5,
    redThreshold: 1.0,
    lengthMeters: 45,
  },
  {
    id: 'seg_3b',
    name: 'Segment 3B: X-Branch South-East (South Exit)',
    marshal: 'Marshal Ankit (Post 3B — SE Egress)',
    width: '4.0 metres',
    startNode: { x: 570, y: 240 },
    endNode: { x: 750, y: 385 },
    controlPoint: { x: 660, y: 315 },
    amberThreshold: 0.5,
    redThreshold: 1.0,
    lengthMeters: 45,
  },
  {
    id: 'seg_3c',
    name: 'Segment 3C: X-Branch North-West (North Ramp)',
    marshal: 'Marshal Priya (Post 3C — NW Perimeter)',
    width: '4.0 metres',
    startNode: { x: 570, y: 240 },
    endNode: { x: 350, y: 95 },
    controlPoint: { x: 460, y: 165 },
    amberThreshold: 0.5,
    redThreshold: 1.0,
    lengthMeters: 45,
  },
]

// Key Choke Points mapped to connecting channels and junction
const CHOKE_POINTS = [
  {
    id: 'choke_1',
    name: 'Gate A Entrance Turnstile Choke',
    type: 'PRIMARY ENTRY',
    capacity: '100 people/min',
    width: '4.0 metres',
    riskNote: 'Arrival queue surge bottleneck at entrance ramp.',
    cx: 120,
    cy: 65,
  },
  {
    id: 'choke_2',
    name: '4.0m Gate Neck Channels (IN / OUT / EMG)',
    type: 'CONNECTING GATE CHOKE',
    capacity: '220 people/min',
    width: '4.0 metres',
    riskNote: '120px long 4.0m passages connecting waiting area directly to main field.',
    cx: 270,
    cy: 222,
  },
  {
    id: 'choke_3',
    name: 'Main Field Central X-Junction',
    type: '4-WAY EMERGENCY JUNCTION',
    capacity: '300 people/min',
    width: '5.0 metres',
    riskNote: 'Central hub distributing response units to all field quadrants.',
    cx: 570,
    cy: 240,
  },
  {
    id: 'choke_4',
    name: 'Central Stage Front Access Triage',
    type: 'STAGE EMERGENCY ACCESS',
    capacity: '200 people/min',
    width: '4.0 metres',
    riskNote: 'Focal point for central stage crowd density surges.',
    cx: 570,
    cy: 105,
  },
]

export default function BottleneckExitMap({ zoneMap = {} }) {
  // Layer toggles
  const [layers, setLayers] = useState({
    heatmap: true,
    corridor: true,
    chokePoints: true,
    marshals: true,
    gridOverlay: true,
  })

  // Selected item inspector state
  const [selectedItem, setSelectedItem] = useState(CHOKE_POINTS[1])

  // Segment density status
  const [segmentDensities, setSegmentDensities] = useState({
    seg_1: 0.15,
    seg_2: 0.35,
    seg_3a: 0.20,
    seg_3b: 0.10,
    seg_3c: 0.25,
  })

  // Segment breach manual testing lock state (prevents CV socket stream from instantly overwriting test breaches)
  const [manualBreaches, setManualBreaches] = useState({
    seg_1: false,
    seg_2: false,
    seg_3a: false,
    seg_3b: false,
    seg_3c: false,
  })

  // Breached alerts state
  const [marshalAlerts, setMarshalAlerts] = useState([])
  const [controlRoomLogs, setControlRoomLogs] = useState([])

  // Vehicle Dispatch Simulator state
  const [dispatchMode, setDispatchMode] = useState('AMBULANCE')
  const [dispatchTarget, setDispatchTarget] = useState('seg_3a')
  const [isSimulating, setIsSimulating] = useState(false)
  const [simProgress, setSimProgress] = useState(0)

  // Sync segment density with socket zoneMap feed while preserving manual breach locks
  useEffect(() => {
    const baseDensity = zoneMap.zone_2?.density !== undefined ? parseFloat(zoneMap.zone_2.density) : 0.3
    setSegmentDensities({
      seg_1: manualBreaches.seg_1 ? 1.35 : Math.min(3.0, Math.max(0.05, +(baseDensity * 0.4).toFixed(2))),
      seg_2: manualBreaches.seg_2 ? 1.35 : Math.min(3.0, Math.max(0.05, +(baseDensity * 0.95).toFixed(2))),
      seg_3a: manualBreaches.seg_3a ? 1.35 : Math.min(3.0, Math.max(0.05, +(baseDensity * 0.6).toFixed(2))),
      seg_3b: manualBreaches.seg_3b ? 1.35 : Math.min(3.0, Math.max(0.05, +(baseDensity * 0.3).toFixed(2))),
      seg_3c: manualBreaches.seg_3c ? 1.35 : Math.min(3.0, Math.max(0.05, +(baseDensity * 0.5).toFixed(2))),
    })
  }, [zoneMap, manualBreaches])

  // Monitor corridor breaches and emit dual alerts
  useEffect(() => {
    CORRIDOR_SEGMENTS.forEach((seg) => {
      const density = segmentDensities[seg.id] || 0
      const isBreached = density >= seg.redThreshold

      setMarshalAlerts((prev) => {
        const existing = prev.find((a) => a.segmentId === seg.id)
        if (isBreached && !existing) {
          const newAlert = {
            id: `alert_${seg.id}_${Date.now()}`,
            segmentId: seg.id,
            segmentName: seg.name,
            marshal: seg.marshal,
            density: density,
            timestamp: new Date().toLocaleTimeString(),
          }

          setControlRoomLogs((logs) => [
            {
              id: `log_${Date.now()}_${Math.random()}`,
              text: `[INFORMATIONAL] Emergency pathway ${seg.name} breached at ${density} p/m². Alert sent to ${seg.marshal}.`,
              type: 'WARNING',
              timestamp: new Date().toLocaleTimeString(),
            },
            ...logs.slice(0, 19),
          ])

          return [newAlert, ...prev]
        } else if (!isBreached && existing) {
          return prev.filter((a) => a.segmentId !== seg.id)
        }
        return prev
      })
    })
  }, [segmentDensities])

  // Active Route for selected target branch
  const activeRouteSegments = [
    CORRIDOR_SEGMENTS[0], // Seg 1: Arrival Ramp
    CORRIDOR_SEGMENTS[1], // Seg 2: Transit Bay to Junction
  ]
  if (dispatchTarget !== 'seg_2') {
    const targetSeg = CORRIDOR_SEGMENTS.find((s) => s.id === dispatchTarget)
    if (targetSeg) activeRouteSegments.push(targetSeg)
  }

  const routeTotalLength = activeRouteSegments.reduce((sum, s) => sum + s.lengthMeters, 0)

  // Find first breached segment along the active dispatch route
  let haltedSegment = null
  let haltProgressRatio = 1.0

  let cumulativeDistBeforeSeg = 0
  for (let i = 0; i < activeRouteSegments.length; i++) {
    const seg = activeRouteSegments[i]
    const density = segmentDensities[seg.id] || 0
    const isBreached = density >= seg.redThreshold

    if (isBreached) {
      haltedSegment = seg
      // Ratio right at the entry point boundary before entering this segment
      haltProgressRatio = Math.max(0, cumulativeDistBeforeSeg / routeTotalLength)
      break
    }
    cumulativeDistBeforeSeg += seg.lengthMeters
  }

  // Vehicle Dispatch Animation tick with automatic Breach Halt
  useEffect(() => {
    let timer
    if (isSimulating) {
      timer = setInterval(() => {
        setSimProgress((prev) => {
          const next = prev + 0.012
          if (haltedSegment && next >= haltProgressRatio) {
            setIsSimulating(false)
            return haltProgressRatio // Completely STOP animation right at the point before entering breached segment!
          }
          if (next >= 1) {
            setIsSimulating(false)
            return 1
          }
          return next
        })
      }, 100)
    }
    return () => clearInterval(timer)
  }, [isSimulating, haltedSegment, haltProgressRatio])

  // Quadratic Bezier Curve calculation
  const getQuadraticBezierXY = (t, p0, p1, p2) => {
    const oneMinusT = 1 - t
    return {
      x: oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x,
      y: oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y,
    }
  }

  const currentDistance = simProgress * routeTotalLength

  let accumulatedDist = 0
  let activeVehicleSeg = activeRouteSegments[0]
  let segProgressRatio = 0

  for (let i = 0; i < activeRouteSegments.length; i++) {
    const seg = activeRouteSegments[i]
    if (currentDistance <= accumulatedDist + seg.lengthMeters || i === activeRouteSegments.length - 1) {
      activeVehicleSeg = seg
      const localDist = currentDistance - accumulatedDist
      segProgressRatio = Math.min(1, Math.max(0, localDist / seg.lengthMeters))
      break
    }
    accumulatedDist += seg.lengthMeters
  }

  const vehiclePos = getQuadraticBezierXY(
    segProgressRatio,
    activeVehicleSeg.startNode,
    activeVehicleSeg.controlPoint,
    activeVehicleSeg.endNode
  )

  const isVehicleHaltedAtBreach = haltedSegment && simProgress >= haltProgressRatio && simProgress < 1

  const handleToggleSegmentBreach = (segId) => {
    setManualBreaches((prev) => ({
      ...prev,
      [segId]: !prev[segId],
    }))
  }

  const handleClearSegmentBreach = (segId) => {
    setManualBreaches((prev) => ({ ...prev, [segId]: false }))
    setSegmentDensities((prev) => ({ ...prev, [segId]: 0.25 }))
    setMarshalAlerts((prev) => prev.filter((a) => a.segmentId !== segId))

    const seg = CORRIDOR_SEGMENTS.find((s) => s.id === segId)
    setControlRoomLogs((logs) => [
      {
        id: `log_${Date.now()}_${Math.random()}`,
        text: `[RESOLVED] ${seg?.marshal || 'Official'} cleared crowd barricades for ${seg?.name || segId}. Segment density restored to 0.25 p/m².`,
        type: 'RESOLVED',
        timestamp: new Date().toLocaleTimeString(),
      },
      ...logs.slice(0, 19),
    ])

    if (haltedSegment?.id === segId) {
      setTimeout(() => {
        setIsSimulating(true)
      }, 150)
    }
  }

  const handleClearAllBreaches = () => {
    setManualBreaches({
      seg_1: false,
      seg_2: false,
      seg_3a: false,
      seg_3b: false,
      seg_3c: false,
    })
    setSegmentDensities({
      seg_1: 0.15,
      seg_2: 0.25,
      seg_3a: 0.20,
      seg_3b: 0.10,
      seg_3c: 0.15,
    })
    setMarshalAlerts([])
    setControlRoomLogs((logs) => [
      {
        id: `log_${Date.now()}_${Math.random()}`,
        text: `[RESOLVED ALL] Operations Control Room cleared all active segment breach alerts. Venue corridors clear.`,
        type: 'RESOLVED',
        timestamp: new Date().toLocaleTimeString(),
      },
      ...logs.slice(0, 19),
    ])
  }

  const handleClearBreachAndResume = (segId) => {
    handleClearSegmentBreach(segId)
  }

  const handleAcknowledgeMarshalAlert = (alertId) => {
    const alert = marshalAlerts.find((a) => a.id === alertId)
    if (alert?.segmentId) {
      handleClearSegmentBreach(alert.segmentId)
    } else {
      setMarshalAlerts((prev) => prev.filter((a) => a.id !== alertId))
    }
  }

  const z1Density = zoneMap.zone_1?.density ? parseFloat(zoneMap.zone_1.density) : 0.85
  const z1Headcount = zoneMap.zone_1?.headcount || 1190
  const z2Density = zoneMap.zone_2?.density ? parseFloat(zoneMap.zone_2.density) : 0.42
  const z2Headcount = zoneMap.zone_2?.headcount || 147

  return (
    <div
      className="p-5 rounded-2xl border space-y-4 font-mono-num shadow-2xl backdrop-blur-md"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h2 className="text-base font-bold tracking-tight uppercase flex items-center gap-2 text-slate-100">
            🗺️ Tactical Operations Venue Map: 4.0m Connecting Channels &amp; X-Highway
            <span className="text-[10px] font-mono-num font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 tracking-wider">
              4.0m CONNECTING GATE CHANNELS
            </span>
          </h2>
          <p className="text-xs mt-1 text-slate-400">
            Staging Lawn (450 m²) ➔ 4.0m Passage Channels (IN/OUT/Emergency Way) ➔ Main Field (1,800 m²) &amp; X-Network.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-amber-300">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
          <span>Sensors: Reusing Zone Camera Feeds (Mock Data)</span>
        </div>
      </div>

      {/* Layer Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border bg-slate-950/80 border-slate-800/80 backdrop-blur-sm text-xs shadow-inner">
        <div className="flex items-center gap-5 flex-wrap">
          <span className="font-extrabold text-slate-400 uppercase tracking-widest text-[10px]">Map Layers:</span>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={layers.corridor}
              onChange={(e) => setLayers((l) => ({ ...l, corridor: e.target.checked }))}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
            />
            <span className="font-semibold text-emerald-400">🟩 Emergency X-Network</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={layers.heatmap}
              onChange={(e) => setLayers((l) => ({ ...l, heatmap: e.target.checked }))}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
            />
            <span className="font-semibold text-amber-400">🔴 Crowd Heatmap</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={layers.chokePoints}
              onChange={(e) => setLayers((l) => ({ ...l, chokePoints: e.target.checked }))}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
            />
            <span className="font-semibold text-sky-400">⚠️ Choke Points</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={layers.gridOverlay}
              onChange={(e) => setLayers((l) => ({ ...l, gridOverlay: e.target.checked }))}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
            />
            <span className="font-semibold text-slate-400">🌐 Grid HUD</span>
          </label>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400 font-semibold font-mono">⚡ Test Breach Locks:</span>
          <button
            onClick={() => handleToggleSegmentBreach('seg_1')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all shadow-sm ${manualBreaches.seg_1
                ? 'bg-red-600 text-white border-red-400 shadow-red-900/50'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
          >
            {manualBreaches.seg_1 ? '🔒 Seg 1 BREACHED' : '⚡ Seg 1 (Arrival)'}
          </button>
          <button
            onClick={() => handleToggleSegmentBreach('seg_2')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all shadow-sm ${manualBreaches.seg_2
                ? 'bg-red-600 text-white border-red-400 shadow-red-900/50'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
          >
            {manualBreaches.seg_2 ? '🔒 Seg 2 BREACHED' : '⚡ Seg 2 (Passage)'}
          </button>
          <button
            onClick={() => handleToggleSegmentBreach('seg_3a')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all shadow-sm ${manualBreaches.seg_3a
                ? 'bg-red-600 text-white border-red-400 shadow-red-900/50'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
          >
            {manualBreaches.seg_3a ? '🔒 Seg 3A BREACHED' : '⚡ Seg 3A (Stage)'}
          </button>
        </div>
      </div>

      {/* Main SVG Vector Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        <div className="lg:col-span-8 relative bg-slate-950 p-4 rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xl">
          <svg viewBox="0 0 820 480" className="w-full h-[450px] select-none">
            <defs>
              <pattern id="tactical-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2 2" />
              </pattern>

              <radialGradient id="heat-zone-a" cx="45%" cy="50%" r="55%">
                <stop offset="0%" stopColor={z2Density >= 1.0 ? '#ef4444' : '#0284c7'} stopOpacity="0.45" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0.05" />
              </radialGradient>

              <radialGradient id="heat-zone-b" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor={z1Density >= 1.5 ? '#ef4444' : z1Density >= 1.0 ? '#f97316' : '#d97706'} stopOpacity="0.45" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0.05" />
              </radialGradient>

              <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Tactical Canvas Background */}
            <rect x="10" y="10" width="800" height="460" rx="16" fill="#090d16" stroke="#1e293b" strokeWidth="2" />
            {layers.gridOverlay && (
              <rect x="10" y="10" width="800" height="460" rx="16" fill="url(#tactical-grid)" />
            )}

            {/* 1. ZONE A: WAITING & ARRIVAL STAGING AREA (LEFT BLOCK: x: 40 to 210) */}
            <g id="zone-a-arrival">
              <rect x="40" y="50" width="170" height="380" rx="12" fill="#0f172a" stroke="#0284c7" strokeWidth="1.5" strokeDasharray="4 4" />
              {layers.heatmap && <rect x="40" y="50" width="170" height="380" rx="12" fill="url(#heat-zone-a)" />}

              <g transform="translate(50, 65)">
                <rect width="135" height="42" rx="6" fill="rgba(15, 23, 42, 0.9)" stroke="#0284c7" strokeWidth="1" />
                <text x="10" y="18" fill="#38bdf8" fontSize="10" fontWeight="bold">ZONE A: STAGING LAWN</text>
                <text x="10" y="32" fill="#94a3b8" fontSize="9">
                  450 m² | <tspan fill="#f8fafc" fontWeight="bold">{z2Density} p/m²</tspan>
                </text>
              </g>
            </g>

            {/* 2. ZONE B: MAIN GATHERING FIELD (RIGHT BLOCK: x: 330 to 780) */}
            <g id="zone-b-main-field">
              <rect x="330" y="50" width="450" height="380" rx="12" fill="#0f172a" stroke={z1Density >= 1.0 ? '#f97316' : '#334155'} strokeWidth="1.5" strokeDasharray="4 4" />
              {layers.heatmap && <rect x="330" y="50" width="450" height="380" rx="12" fill="url(#heat-zone-b)" />}

              {/* Centered Main Concert Stage Box (x: 470 to 670 — leaving empty wings on left & right) */}
              <g transform="translate(470, 50)">
                <rect width="200" height="48" rx="8" fill="rgba(239, 68, 68, 0.16)" stroke="#ef4444" strokeWidth="1.5" />
                <text x="100" y="24" fill="#f87171" fontSize="10" fontWeight="extrabold" textAnchor="middle">🎭 MAIN CONCERT STAGE</text>
                <text x="100" y="38" fill="#fca5a5" fontSize="7.5" textAnchor="middle">Center Stage (Side Corridors Clear)</text>
              </g>

              <g transform="translate(345, 65)">
                <rect width="115" height="42" rx="6" fill="rgba(15, 23, 42, 0.9)" stroke="#334155" strokeWidth="1" />
                <text x="8" y="18" fill="#f59e0b" fontSize="10" fontWeight="bold">ZONE B: MAIN FIELD</text>
                <text x="8" y="32" fill="#94a3b8" fontSize="8">
                  Area: <tspan fill="#f8fafc" fontWeight="bold">1,800 m²</tspan>
                </text>
              </g>

              {/* Central X-Junction Target Indicator */}
              <circle cx="570" cy="240" r="32" fill="none" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx="570" cy="240" r="6" fill="#38bdf8" />
              <text x="570" y="284" fill="#cbd5e1" fontSize="9" fontWeight="bold" textAnchor="middle">CENTRAL X-JUNCTION</text>
            </g>

            {/* 3. 4.0m CONNECTING PATHWAYS (IN, OUT & EMERGENCY WAY PATHS ONLY) */}
            <g id="connecting-corridor-channels">
              {/* 1. Thinner IN Gate Channel (Top Entry: y: 95, 48px height, 120px length) */}
              <g transform="translate(210, 95)">
                <rect width="120" height="48" rx="4" fill="#064e3b" fillOpacity="0.7" stroke="#059669" strokeWidth="1.5" />
                <text x="60" y="20" fill="#34d399" fontSize="9" fontWeight="extrabold" textAnchor="middle">🟢 IN GATE (4.0m)</text>
                <line x1="10" y1="32" x2="110" y2="32" stroke="#34d399" strokeWidth="2" strokeDasharray="5 3" />
              </g>

              {/* 2. Thinner OUT Gate Channel (Middle Egress: y: 195, 48px height, 120px length) */}
              <g transform="translate(210, 195)">
                <rect width="120" height="48" rx="4" fill="#7c2d12" fillOpacity="0.7" stroke="#ea580c" strokeWidth="1.5" />
                <text x="60" y="20" fill="#fb923c" fontSize="9" fontWeight="extrabold" textAnchor="middle">🟠 OUT GATE (4.0m)</text>
                <line x1="110" y1="32" x2="10" y2="32" stroke="#fb923c" strokeWidth="2" strokeDasharray="5 3" />
              </g>

              {/* 3. Thinner Emergency Way Passage Channel (Bottom: y: 310, 55px height, 120px length) */}
              <g transform="translate(210, 310)">
                <rect width="120" height="55" rx="4" fill="#0284c7" fillOpacity="0.3" stroke="#38bdf8" strokeWidth="1.5" />
                <text x="60" y="22" fill="#38bdf8" fontSize="9" fontWeight="extrabold" textAnchor="middle">🚨 EMERGENCY WAY</text>
                <text x="60" y="38" fill="#38bdf8" fontSize="7.5" fontWeight="bold" textAnchor="middle">4.0m Vehicle Corridor</text>
              </g>
            </g>

            {/* 4. EMERGENCY HIGHWAY: NARROW BAY + X-STRUCTURE NETWORK */}
            {layers.corridor && (
              <g id="layer-emergency-network">
                {CORRIDOR_SEGMENTS.map((seg, idx) => {
                  const density = segmentDensities[seg.id] || 0
                  const isBreached = density >= seg.redThreshold
                  const isAmber = density >= seg.amberThreshold && !isBreached

                  const strokeColor = isBreached ? '#ef4444' : isAmber ? '#f59e0b' : '#10b981'
                  const pathD = `M ${seg.startNode.x} ${seg.startNode.y} Q ${seg.controlPoint.x} ${seg.controlPoint.y} ${seg.endNode.x} ${seg.endNode.y}`

                  return (
                    <g key={seg.id} onClick={() => setSelectedItem(seg)} className="cursor-pointer">
                      {isBreached && (
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="20"
                          strokeOpacity="0.4"
                          strokeLinecap="round"
                          className="animate-pulse"
                        />
                      )}

                      {/* Main Segment Path */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="12"
                        strokeOpacity="0.85"
                        strokeLinecap="round"
                        filter="url(#neon-glow)"
                        className="transition-all duration-300"
                      />

                      {/* Animated Particle Overlay */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="2"
                        strokeDasharray="6 6"
                        strokeOpacity="0.9"
                      />

                      {/* Segment Badge Label */}
                      <g transform={`translate(${seg.controlPoint.x - 30}, ${seg.controlPoint.y - 10})`}>
                        <rect width="60" height="18" rx="4" fill="#090d16" stroke={strokeColor} strokeWidth="1" />
                        <text x="30" y="12" fill={strokeColor} fontSize="8" fontWeight="bold" textAnchor="middle">
                          {seg.id.toUpperCase()}: {isBreached ? 'BREACH' : isAmber ? 'AMBER' : 'CLEAR'}
                        </text>
                      </g>

                      {layers.marshals && (
                        <g transform={`translate(${seg.startNode.x}, ${seg.startNode.y})`}>
                          <circle r="9" fill="#0f172a" stroke={strokeColor} strokeWidth="1.5" />
                          <text x="0" y="3" fill="#ffffff" fontSize="8" fontWeight="bold" textAnchor="middle">👮</text>
                        </g>
                      )}
                    </g>
                  )
                })}
              </g>
            )}

            {/* 5. INTERACTIVE CHOKE POINT NODES */}
            {layers.chokePoints && (
              <g id="layer-choke-nodes">
                {CHOKE_POINTS.map((pt) => {
                  const isSelected = selectedItem?.id === pt.id
                  return (
                    <g key={pt.id} onClick={() => setSelectedItem(pt)} className="cursor-pointer group">
                      <circle
                        cx={pt.cx}
                        cy={pt.cy}
                        r={isSelected ? 13 : 9}
                        fill={isSelected ? '#f97316' : '#ef4444'}
                        stroke="#ffffff"
                        strokeWidth="2"
                        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                        className="transition-all duration-200 group-hover:scale-125 shadow-lg"
                      />
                      <text x={pt.cx + 14} y={pt.cy + 4} fill="#f8fafc" fontSize="10" fontWeight="bold">
                        {pt.name}
                      </text>
                    </g>
                  )
                })}
              </g>
            )}

            {/* 6. ANIMATED RESPONSE VEHICLE MARKER ALONG SELECTED ROUTE */}
            {(isSimulating || simProgress > 0) && (
              <g transform={`translate(${vehiclePos.x}, ${vehiclePos.y})`} className="transition-all duration-75">
                <circle
                  r="16"
                  fill={isVehicleHaltedAtBreach ? '#ef4444' : '#0284c7'}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  className={isVehicleHaltedAtBreach ? 'animate-bounce' : ''}
                />
                <text x="0" y="5" textAnchor="middle" fontSize="13">
                  {dispatchMode === 'AMBULANCE' ? '🚑' : '🚶‍♂️'}
                </text>
                {isVehicleHaltedAtBreach && (
                  <g transform="translate(-75, -34)">
                    <rect width="150" height="22" rx="5" fill="#7f1d1d" stroke="#f87171" strokeWidth="1.5" />
                    <text x="75" y="14" fill="#fef2f2" fontSize="8" fontWeight="extrabold" textAnchor="middle">
                      ⛔ HALTED — BREACHED SEGMENT
                    </text>
                  </g>
                )}
              </g>
            )}
          </svg>

          {/* Map Footer Telemetry Bar */}
          <div className="mt-3 flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-3.5 py-2 bg-slate-900/90 rounded-xl border border-slate-800">
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm"></span> Clear Corridor</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-sm"></span> Amber (≥0.5 p/m²)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block animate-pulse shadow-sm"></span> Breached (≥1.0 p/m²)</span>
            </div>
            <span className="font-semibold text-sky-400">X-Network Coverage: 100% Venue Quadrant Reachability</span>
          </div>
        </div>

        {/* Right Inspector & Dispatch Control Column (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">

          {/* URGENT OFFICIAL ACTION REPORT BANNER (WHEN VEHICLE IS HALTED) */}
          {isVehicleHaltedAtBreach && (
            <div className="p-4 rounded-2xl border bg-red-950/90 border-red-700/80 space-y-3 shadow-2xl animate-pulse backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-red-800/80 pb-2">
                <span className="text-xs font-black uppercase text-red-200 tracking-wider flex items-center gap-1.5">
                  🚨 OFFICIAL ACTION REPORT REQUIRED
                </span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-red-900 text-red-100 border border-red-700 font-mono">
                  URGENT ⚡
                </span>
              </div>

              <div className="text-xs space-y-2 text-red-100">
                <p className="text-[11px] leading-relaxed">
                  Response Unit <strong>{dispatchMode === 'AMBULANCE' ? '🚑 Ambulance' : '🚶‍♂️ QRT Medic'}</strong> HAS BEEN COMPLETELY HALTED at the entry point of <strong>{haltedSegment.name}</strong>.
                </p>

                <div className="p-2.5 rounded-xl bg-slate-950/90 border border-red-800 text-[11px] space-y-1">
                  <div className="text-amber-300 font-bold">
                    👮 Assigned Official: <tspan className="text-white">{haltedSegment.marshal}</tspan>
                  </div>
                  <div className="text-slate-300 text-[10px]">
                    Current Segment Density: <strong className="text-red-400">{segmentDensities[haltedSegment.id]} p/m²</strong> (BREACHED).
                  </div>
                  <div className="text-slate-300 text-[10px] italic">
                    Requesting IMMEDIATE ACTION from {haltedSegment.marshal} to clear crowd barricades before vehicle can enter!
                  </div>
                </div>

                <button
                  onClick={() => handleClearBreachAndResume(haltedSegment.id)}
                  className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg transition-all border border-red-400 flex items-center justify-center gap-2"
                >
                  <span>⚡ Report clearance &amp; Resume Vehicle</span>
                </button>
              </div>
            </div>
          )}

          {/* Targeted Marshal Breach Alerts Box */}
          <div className="p-4 rounded-2xl border bg-slate-900/90 border-slate-800 space-y-3 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <span>🚨 Targeted Marshal Breach Alerts</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800/80 font-mono-num font-bold">
                  {marshalAlerts.length} ACTIVE
                </span>
              </h3>
              {marshalAlerts.length > 0 && (
                <button
                  onClick={handleClearAllBreaches}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[10px] font-bold transition-all"
                >
                  🧹 Clear All Breaches
                </button>
              )}
            </div>

            {marshalAlerts.length > 0 ? (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {marshalAlerts.map((alert) => (
                  <div key={alert.id} className="p-3 rounded-xl bg-red-950/70 border border-red-800/80 text-xs space-y-2 animate-fade-in shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-red-300 uppercase text-[11px]">{alert.segmentName}</span>
                      <span className="text-[10px] text-red-400 font-mono">{alert.timestamp}</span>
                    </div>
                    <p className="text-slate-200 text-[11px]">
                      Density <strong className="text-red-300">{alert.density} p/m²</strong> exceeds safety threshold!
                    </p>
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-red-900/60 text-[10px] text-amber-300">
                      👉 <strong>Targeted Official:</strong> <strong>{alert.marshal}</strong>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleClearSegmentBreach(alert.segmentId)}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-[10px] uppercase transition-all shadow-md flex items-center justify-center gap-1"
                      >
                        <span>⚡ report Breach  cleared</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/60 text-slate-400 text-xs text-center py-5">
                ✓ All emergency corridor segments clear. Zero active marshal alerts.
              </div>
            )}
          </div>

          {/* Emergency Vehicle Dispatch Simulator with Target Selection */}
          <div className="p-4 rounded-2xl border bg-slate-900/90 border-slate-800 space-y-3 shadow-xl backdrop-blur-sm">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-400 flex items-center justify-between">
              <span>🚒 Emergency Dispatch Simulator</span>
              <span className="text-[10px] font-normal text-slate-400">X-Highway Network</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              {/* Unit Mode */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px] w-20 font-semibold">Unit Mode:</span>
                <button
                  onClick={() => setDispatchMode('AMBULANCE')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] border transition-all ${dispatchMode === 'AMBULANCE' ? 'bg-sky-600 text-white border-sky-500 shadow-md' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                    }`}
                >
                  🚑 Ambulance
                </button>
                <button
                  onClick={() => setDispatchMode('FOOT_MEDIC')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] border transition-all ${dispatchMode === 'FOOT_MEDIC' ? 'bg-sky-600 text-white border-sky-500 shadow-md' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                    }`}
                >
                  🚶‍♂️ QRT Medic
                </button>
              </div>

              {/* Target Destination Selection */}
              <div className="space-y-1">
                <span className="text-slate-400 text-[11px] font-semibold font-mono">Target Field Quadrant:</span>
                <select
                  value={dispatchTarget}
                  onChange={(e) => setDispatchTarget(e.target.value)}
                  disabled={isSimulating}
                  className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 font-bold focus:ring-1 focus:ring-sky-500"
                >
                  <option value="seg_3a">🎯 Stage Front Triage (North-East Branch)</option>
                  <option value="seg_3b">🎯 South Exit Gate (South-East Branch)</option>
                  <option value="seg_3c">🎯 North Ramp Access (North-West Branch)</option>
                  <option value="seg_2">🎯 Central X-Junction (Field Center)</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Transit Status:</span>
                  <span className={`font-extrabold ${isVehicleHaltedAtBreach ? 'text-red-400' : isSimulating ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {isVehicleHaltedAtBreach
                      ? `⛔ HALTED AT ${haltedSegment.id.toUpperCase()} ENTRY`
                      : isSimulating
                        ? '🔴 EN ROUTE (X-HIGHWAY)'
                        : 'STANDBY AT GATE A'}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Estimated Transit ETA:</span>
                  <span className="font-extrabold text-white">
                    {isVehicleHaltedAtBreach
                      ? `HALTED — AWAITING ${haltedSegment.marshal.split(' ')[1].toUpperCase()} ACTION`
                      : isSimulating
                        ? `${Math.max(1, Math.round((1 - simProgress) * 55))} seconds`
                        : '55 seconds'}
                  </span>
                </div>
              </div>

              {!isSimulating ? (
                <button
                  onClick={() => {
                    setSimProgress(0)
                    setIsSimulating(true)
                  }}
                  className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs uppercase shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <span>🚀 Launch Dispatch to Target Quadrant</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsSimulating(false)
                    setSimProgress(0)
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase border border-slate-700 transition-all"
                >
                  ⏹️ Cancel Dispatch Simulation
                </button>
              )}
            </div>
          </div>

          {/* Control Room Feed */}
          <div className="p-4 rounded-2xl border bg-slate-900/90 border-slate-800 space-y-2 shadow-xl backdrop-blur-sm">
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>📋 Control Room Telemetry Feed</span>
              <span className="text-[10px] text-slate-500 font-normal">Informational Log</span>
            </h3>

            <div className="space-y-1.5 max-h-32 overflow-y-auto font-mono text-[10px] text-slate-300 pr-1">
              {controlRoomLogs.length > 0 ? (
                controlRoomLogs.map((log) => (
                  <div key={log.id} className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-slate-300">
                    <span className="text-amber-400">{log.timestamp}</span> {log.text}
                  </div>
                ))
              ) : (
                <p className="text-slate-500 text-[10px] italic">No breach logs recorded in current session.</p>
              )}
            </div>
          </div>

          {/* Selected Inspector Item Details */}
          {selectedItem && (
            <div className="p-3.5 rounded-2xl border bg-slate-900/90 border-slate-800 text-xs space-y-1 text-slate-300 shadow-xl backdrop-blur-sm">
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800 uppercase tracking-wider">
                {selectedItem.marshal ? 'X-HIGHWAY SEGMENT' : selectedItem.type}
              </span>
              <h4 className="font-bold text-sky-400 text-xs mt-1.5">{selectedItem.name}</h4>
              {selectedItem.marshal && <p className="text-[11px]">Assigned Marshal: <strong className="text-white">{selectedItem.marshal}</strong></p>}
              <p className="text-[11px]">Passage Width: <strong className="text-white">{selectedItem.width}</strong></p>
            </div>
          )}

        </div>

      </div>
    </div>
  )
}




