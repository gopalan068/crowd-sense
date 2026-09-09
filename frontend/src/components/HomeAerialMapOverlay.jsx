/**
 * frontend/src/components/HomeAerialMapOverlay.jsx
 *
 * Real-Time Aerial Spatial Intelligence Overlay for the Home Page.
 * Accurately calibrated to event-aerial.png street corridors, building facades,
 * barriers, and relief alleys without overlapping rooftops or obstacles.
 *
 * Zones:
 *   - Zone 1A & Zone 1B (South Broadway Chute & Main Arrival)
 *   - Zone 2A & Zone 2B (Central Broadway West Chute & Main Corridor)
 *   - Zone 3A & Zone 3B (Temple Square West Chute & Chariot Main Plaza)
 *   - Zone 4 (North Concourse & Exit 2)
 *   - Zone 5 (North-West Feeder & Exit 1)
 */
import React, { useState } from 'react'

const VENUE_ZONES = [
  {
    id: 'z1a_south_west',
    code: 'Zone 1A',
    name: 'South Broadway (West Chute)',
    shortName: 'South West Chute',
    color: '#0284c7',
    strokeColor: '#38bdf8',
    fillColor: 'rgba(2, 132, 199, 0.22)',
    points: '188,850 190,700 170,645 205,600 208,580 310,580 308,850',
    labelPos: { x: 250, y: 730 },
    defaultDensity: 1.4,
    capacity: '1,200 persons',
    description: 'Channeled arrival chute west of central barricade',
  },
  {
    id: 'z1b_south_east',
    code: 'Zone 1B',
    name: 'South Broadway (East Main Lane)',
    shortName: 'South East Main',
    color: '#0ea5e9',
    strokeColor: '#38bdf8',
    fillColor: 'rgba(14, 165, 233, 0.20)',
    points: '308,850 310,580 500,580 490,700 480,850',
    labelPos: { x: 400, y: 730 },
    defaultDensity: 2.1,
    capacity: '2,800 persons',
    description: 'Main arrival thoroughfare east of central barricade',
  },
  {
    id: 'z2a_mid_west',
    code: 'Zone 2A',
    name: 'Central Broadway (West Lane)',
    shortName: 'Central West Lane',
    color: '#8b5cf6',
    strokeColor: '#c084fc',
    fillColor: 'rgba(139, 92, 246, 0.24)',
    points: '208,580 216,480 222,380 228,280 314,280 310,580',
    labelPos: { x: 265, y: 430 },
    defaultDensity: 1.8,
    capacity: '1,500 persons',
    description: 'Mid-avenue channelized lane west of barrier',
  },
  {
    id: 'z2b_mid_east',
    code: 'Zone 2B',
    name: 'Central Broadway (East Main)',
    shortName: 'Central Main Avenue',
    color: '#a855f7',
    strokeColor: '#e879f9',
    fillColor: 'rgba(168, 85, 247, 0.20)',
    points: '310,580 314,280 495,280 515,400 500,580',
    labelPos: { x: 410, y: 430 },
    defaultDensity: 2.4,
    capacity: '3,200 persons',
    description: 'Primary procession approach to Temple Forecourt',
  },
  {
    id: 'z3a_temple_west',
    code: 'Zone 3A',
    name: 'Temple Forecourt (West Bypass)',
    shortName: 'Temple West Lane',
    color: '#f59e0b',
    strokeColor: '#fbbf24',
    fillColor: 'rgba(245, 158, 11, 0.24)',
    points: '228,280 238,180 248,110 240,90 316,90 314,280',
    labelPos: { x: 272, y: 185 },
    defaultDensity: 2.2,
    capacity: '1,400 persons',
    description: 'West pedestrian channel adjacent to Chariot (Rath)',
  },
  {
    id: 'z3b_temple_east',
    code: 'Zone 3B',
    name: 'Temple Forecourt (Chariot Plaza)',
    shortName: 'Chariot Main Plaza',
    color: '#d97706',
    strokeColor: '#f59e0b',
    fillColor: 'rgba(217, 119, 6, 0.26)',
    points: '314,280 316,90 430,90 465,120 498,160 508,200 495,280',
    labelPos: { x: 410, y: 185 },
    defaultDensity: 2.9,
    capacity: '3,600 persons',
    description: 'Primary ceremonial plaza around Temple Chariot (Rath)',
  },
  {
    id: 'z4_north',
    code: 'Zone 4',
    name: 'North Exit & Gate Concourse',
    shortName: 'North Exit Concourse',
    color: '#10b981',
    strokeColor: '#34d399',
    fillColor: 'rgba(16, 185, 129, 0.22)',
    points: '240,90 316,90 430,90 425,0 240,0',
    labelPos: { x: 345, y: 45 },
    defaultDensity: 0.9,
    capacity: '1,800 persons',
    description: 'Northern exit concourse and Emergency Gates 1 & 2',
  },
  {
    id: 'z5_west',
    code: 'Zone 5',
    name: 'North-West Feeder & West Exit',
    shortName: 'West Feeder & Exit 1',
    color: '#ec4899',
    strokeColor: '#f472b6',
    fillColor: 'rgba(236, 72, 153, 0.20)',
    points: '0,35 150,45 240,90 248,110 205,112 0,95',
    labelPos: { x: 120, y: 75 },
    defaultDensity: 0.7,
    capacity: '1,200 persons',
    description: 'North-West entry spawn and Exit 1 evacuation portal',
  },
]

const IOT_SENSORS = [
  { id: 'IOT-01', x: 245, y: 780, label: 'IoT-01 (South West Chute)' },
  { id: 'IOT-02', x: 400, y: 760, label: 'IoT-02 (South East Main)' },
  { id: 'IOT-03', x: 270, y: 480, label: 'IoT-03 (Central West Lane)' },
  { id: 'IOT-04', x: 415, y: 480, label: 'IoT-04 (Broadway Main Avenue)' },
  { id: 'IOT-05A', x: 285, y: 190, label: 'IoT-05A (Temple West Chute)' },
  { id: 'IOT-05B', x: 430, y: 210, label: 'IoT-05B (Chariot Main Plaza)' },
]

const CCTV_TOWERS = [
  { id: 'CCTV-01', x: 190, y: 650, label: 'CCTV Tower 01 (South West Corner)' },
  { id: 'CCTV-02', x: 358, y: 105, label: 'CCTV Tower 02 (North Concourse)' },
  { id: 'CCTV-03', x: 515, y: 400, label: 'CCTV Tower 03 (East Arcade)' },
]

export default function HomeAerialMapOverlay({ zoneMap = {}, weatherState = null }) {
  const [hoveredZone, setHoveredZone] = useState(null)
  const [selectedZone, setSelectedZone] = useState(null)
  const [layers, setLayers] = useState({
    zones: true,
    barricades: true,
    sensors: true,
    drone: true,
    exits: true,
  })

  const toggleLayer = (layerName) => {
    setLayers(prev => ({ ...prev, [layerName]: !prev[layerName] }))
  }

  // Determine dynamic density for each zone from socket zoneMap or default
  const getZoneDensity = (zone) => {
    if ((zone.id === 'z3b_temple_east' || zone.id === 'z3a_temple_west') && zoneMap.zone_2?.density) {
      return parseFloat(zoneMap.zone_2.density).toFixed(1)
    }
    if (zone.id === 'z1b_south_east' && zoneMap.zone_1?.density) {
      return parseFloat(zoneMap.zone_1.density).toFixed(1)
    }
    return zone.defaultDensity.toFixed(1)
  }

  const getFruinLOS = (d) => {
    const val = parseFloat(d)
    if (val < 1.08) return { band: 'LOS A / B', status: 'SAFE · UNRESTRICTED', color: 'var(--green)' }
    if (val < 2.15) return { band: 'LOS C / D', status: 'FLOWING · MODERATE', color: 'var(--cyan)' }
    if (val < 3.8) return { band: 'LOS E', status: 'ELEVATED · SLOW', color: 'var(--orange)' }
    return { band: 'LOS F', status: 'CRITICAL · JAMMED', color: 'var(--red)' }
  }

  const activeZoneInfo = hoveredZone || selectedZone

  return (
    <div className="hero-map relative group" style={{ aspectRatio: '800 / 850' }}>
      <div className="scan-line" />

      {/* Layer 1: Real Aerial Venue Photo */}
      <img
        src="/event-aerial.png"
        alt="Aerial view of crowd event venue"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center top',
          display: 'block',
          filter: 'brightness(0.76) saturate(0.92) contrast(1.04)',
        }}
      />

      {/* Layer 2: Precision Architectural & Spatial SVG Overlay */}
      <svg
        viewBox="0 0 800 850"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 w-full h-full pointer-events-auto select-none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          {/* Subtle Glow Filters */}
          <filter id="neon-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="neon-amber" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="neon-green" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ─── 1. PEDESTRIAN & OPERATIONAL ZONES ────────────────────────────── */}
        {layers.zones && (
          <g id="operational-zones">
            {VENUE_ZONES.map((zone) => {
              const isHovered = hoveredZone?.id === zone.id
              const isSelected = selectedZone?.id === zone.id

              return (
                <g
                  key={zone.id}
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setHoveredZone(zone)}
                  onMouseLeave={() => setHoveredZone(null)}
                  onClick={() => setSelectedZone(isSelected ? null : zone)}
                >
                  <polygon
                    points={zone.points}
                    fill={isHovered || isSelected ? zone.fillColor.replace('0.2', '0.40') : zone.fillColor}
                    stroke={isHovered || isSelected ? '#ffffff' : zone.strokeColor}
                    strokeWidth={isHovered || isSelected ? 2.8 : 1.6}
                    strokeDasharray={isHovered ? 'none' : '6 3'}
                    filter={isHovered || isSelected ? 'url(#neon-cyan)' : 'none'}
                    style={{ transition: 'all 0.2s ease' }}
                  />

                  {/* Zone Tag & Badge Marker */}
                  <g transform={`translate(${zone.labelPos.x}, ${zone.labelPos.y})`}>
                    <rect
                      x="-38"
                      y="-12"
                      width="76"
                      height="24"
                      rx="6"
                      fill="#0b1329"
                      stroke={zone.strokeColor}
                      strokeWidth="1.2"
                      opacity={isHovered ? 0.98 : 0.88}
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontFamily="var(--font-d)"
                      fontSize="10"
                      fontWeight="700"
                      letterSpacing="0.4px"
                    >
                      {zone.code}
                    </text>
                  </g>
                </g>
              )
            })}
          </g>
        )}

        {/* ─── 2. BARRICADES & DIVIDERS ────────────────────────────────────── */}
        {layers.barricades && (
          <g id="barricade-network">
            {/* Longitudinal Broadway Dividing Bamboo Barrier (Aligned directly over image barrier) */}
            <line
              x1="316"
              y1="90"
              x2="308"
              y2="850"
              stroke="#eab308"
              strokeWidth="4"
              strokeDasharray="10 5"
              filter="url(#neon-amber)"
            />
            {/* Barrier Warning Posts */}
            <circle cx="316" cy="90" r="5" fill="#eab308" />
            <circle cx="314" cy="280" r="4.5" fill="#eab308" />
            <circle cx="310" cy="580" r="4.5" fill="#eab308" />
            <circle cx="308" cy="850" r="5" fill="#eab308" />

            {/* Rear Temple Barricade (In back / flank of chariot area) */}
            <line x1="316" y1="90" x2="275" y2="95" stroke="#eab308" strokeWidth="3.5" strokeDasharray="6 3" />
            <circle cx="275" cy="95" r="4" fill="#eab308" />

            {/* Barrier Label Badge */}
            <g transform="translate(307, 530) rotate(-88)">
              <rect x="-55" y="-9" width="110" height="18" rx="4" fill="#0f172a" stroke="#eab308" strokeWidth="1" opacity="0.95" />
              <text x="0" y="3.5" textAnchor="middle" fill="#fef08a" fontFamily="var(--font-m)" fontSize="8.5" fontWeight="700">
                BARRIER · FLOW DIVIDER
              </text>
            </g>
          </g>
        )}

        {/* ─── 3. EMERGENCY GATES & OPENINGS ──────────────────────────────── */}
        {layers.barricades && (
          <g id="emergency-gates">
            {/* Gate 1 (North-East Temple Link — OPEN) */}
            <g transform="translate(410, 68)">
              <line x1="-13" y1="-3" x2="12" y2="2" stroke="#22c55e" strokeWidth="6" strokeDasharray="4 2" />
              <circle cx="-13" cy="-3" r="5" fill="#22c55e" filter="url(#neon-green)" />
              <circle cx="12" cy="2" r="5" fill="#22c55e" filter="url(#neon-green)" />
              <rect x="-42" y="-24" width="84" height="16" rx="4" fill="#0f172a" stroke="#22c55e" strokeWidth="1" opacity="0.95" />
              <text x="0" y="-13" textAnchor="middle" fill="#4ade80" fontFamily="var(--font-m)" fontSize="8" fontWeight="700">
                GATE 1 · OPEN
              </text>
            </g>

            {/* Gate 2 (Courtyard Flank — STANDBY) */}
            <g transform="translate(430, 125)">
              <line x1="-21" y1="-12" x2="21" y2="12" stroke="#f59e0b" strokeWidth="5" strokeDasharray="5 3" />
              <circle cx="-21" cy="-12" r="4.5" fill="#f59e0b" />
              <circle cx="21" cy="12" r="4.5" fill="#f59e0b" />
              <rect x="-44" y="15" width="88" height="16" rx="4" fill="#0f172a" stroke="#f59e0b" strokeWidth="1" opacity="0.95" />
              <text x="0" y="26" textAnchor="middle" fill="#fde68a" fontFamily="var(--font-m)" fontSize="8" fontWeight="700">
                GATE 2 · STANDBY
              </text>
            </g>
          </g>
        )}

        {/* ─── 4. DESIGNATED EXITS & INGRESS SPAWNS ────────────────────────── */}
        {layers.exits && (
          <g id="exits-and-spawns">
            {/* Ingress Flow Guidance Arrows (South Arrival) */}
            <g stroke="#38bdf8" strokeWidth="2.5" fill="none" opacity="0.75">
              <path d="M 250 820 L 250 760 M 245 770 L 250 760 L 255 770" />
              <path d="M 400 820 L 400 760 M 395 770 L 400 760 L 405 770" />
            </g>
          </g>
        )}

        {/* ─── 5. DRONE TACTICAL FEED TAG ─────────────────────────────────── */}
        {layers.drone && (
          <g id="drone-tactical-sweep" transform="translate(480, 105)">
            {/* Clean Static Drone Indicator Badge */}
            <rect x="0" y="0" width="84" height="20" rx="4" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.2" opacity="0.95" />
            <text x="42" y="13.5" textAnchor="middle" fill="#38bdf8" fontFamily="var(--font-m)" fontSize="9" fontWeight="700">
              🛩 DRONE-01
            </text>
          </g>
        )}

        {/* ─── 6. IOT SENSORS & CCTV SENTINELS ──────────────────────────────── */}
        {layers.sensors && (
          <g id="iot-cctv-network">
            {/* IoT Sensor Beacons */}
            {IOT_SENSORS.map((s) => (
              <g key={s.id} transform={`translate(${s.x}, ${s.y})`}>
                <circle cx="0" cy="0" r="4.5" fill="#38bdf8" filter="url(#neon-cyan)" />
                <circle cx="0" cy="0" r="10" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.6">
                  <animate attributeName="r" values="4;14" dur="2.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0" dur="2.2s" repeatCount="indefinite" />
                </circle>
              </g>
            ))}

            {/* CCTV Towers */}
            {CCTV_TOWERS.map((c) => (
              <g key={c.id} transform={`translate(${c.x}, ${c.y})`}>
                <rect x="-6" y="-6" width="12" height="12" rx="3" fill="#10b981" filter="url(#neon-green)" />
                <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
              </g>
            ))}
          </g>
        )}

        {/* ─── 7. HUD TOP & BOTTOM TELEMETRY LABELS ────────────────────────── */}
        <g id="hud-telemetry-decorations">
          {/* Top Telemetry Strip */}
          <rect x="0" y="0" width="800" height="34" fill="rgba(10, 15, 29, 0.85)" />
          <line x1="0" y1="34" x2="800" y2="34" stroke="rgba(58,217,245,0.25)" strokeWidth="1" />
          <text x="18" y="21" fontFamily="var(--font-m)" fontSize="11" fill="#38bdf8" fontWeight="600">
            📡 128 IoT SENSORS · 🎥 9 CCTV TOWERS · 🛩 4 DRONE FEEDS · 🔊 SOUND NOMINAL
          </text>
          <text x="782" y="21" textAnchor="end" fontFamily="var(--font-m)" fontSize="10.5" fill="#94a3b8">
            SCALE: 13.36 px/m · 3.5m² GRID
          </text>

          {/* Bottom Telemetry Strip */}
          <rect x="0" y="816" width="800" height="34" fill="rgba(10, 15, 29, 0.88)" />
          <line x1="0" y1="816" x2="800" y2="816" stroke="rgba(58,217,245,0.25)" strokeWidth="1" />
          <text x="18" y="837" fontFamily="var(--font-m)" fontSize="10.5" fill="#94a3b8">
            TEMPLE CHARIOT BROADWAY · SPATIAL MODEL CALIBRATED
          </text>
          <text x="782" y="837" textAnchor="end" fontFamily="var(--font-m)" fontSize="10.5" fill="#38bdf8" fontWeight="600">
            DRONE COVERAGE 98% · LIVE AI ACTIVE
          </text>
        </g>
      </svg>

      {/* Layer 4: Interactive Zone Detail Hover Card (Bottom Left Floating Glass HUD) */}
      {activeZoneInfo && (
        <div
          className="absolute bottom-11 left-3 right-3 z-20 p-3 rounded-xl bg-slate-950/92 border border-sky-500/40 shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3 animate-fadeIn"
          style={{ animation: 'fadeIn 0.15s ease' }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="w-3.5 h-3.5 rounded-full shadow-lg"
              style={{ background: activeZoneInfo.strokeColor, boxShadow: `0 0 10px ${activeZoneInfo.strokeColor}` }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm tracking-wide">{activeZoneInfo.code} · {activeZoneInfo.shortName}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Cap: {activeZoneInfo.capacity}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{activeZoneInfo.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-mono">LIVE DENSITY</span>
              <span className="text-sm font-bold text-white font-mono">{getZoneDensity(activeZoneInfo)} p/m²</span>
            </div>
            <div className="text-right pl-3 border-l border-slate-800">
              <span className="text-[10px] text-slate-400 block font-mono">FRUIN LOS</span>
              <span
                className="text-xs font-bold font-mono"
                style={{ color: getFruinLOS(getZoneDensity(activeZoneInfo)).color }}
              >
                {getFruinLOS(getZoneDensity(activeZoneInfo)).status}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
