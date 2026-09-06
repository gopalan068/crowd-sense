/**
 * frontend/src/pages/PlannerPage.jsx
 *
 * CrowdSense Planner — Pre-Event Venue Simulation Module.
 *
 * Two-panel layout:
 *   Left:  Venue layout editor (canvas drawing tools + venue management)
 *   Right: Simulation canvas + PlannerControls
 *
 * Simulation uses the Social Force Model (Helbing & Molnár, 1995).
 * All simulation runs client-side; no backend round-trips per frame.
 *
 * DISCLAIMER: Illustrative planning aid only — not a certified
 * evacuation-engineering tool. See persistent banner in render.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

import PlannerControls from '../components/PlannerControls.jsx'

import {
  DEFAULT_SFM_PARAMS,
  spawnAgent,
  triggerEmergency as sfmTriggerEmergency,
  setFocusTarget,
  step as sfmStep,
  extractWallSegments,
  convertExitsToMeters,
  convertSpawnsToMeters,
  resetAgentIds,
} from '../lib/socialForceSim.js'

import {
  buildGrid,
  computeDensity,
  renderHeatmap,
  getMaxDensity,
} from '../lib/densityGrid.js'

// ─── Canvas dimensions ────────────────────────────────────────────────────────
const CANVAS_W = 800
const CANVAS_H = 580

// ─── Drawing tool IDs ─────────────────────────────────────────────────────────
const TOOLS = {
  WALL:  'WALL',
  EXIT:  'EXIT',
  SPAWN: 'SPAWN',
  FOCUS: 'FOCUS',
  SCALE: 'SCALE',
  SELECT:'SELECT',
}

// ─── Demo venue: Temple Chariot Procession & Broadway Network (Demo) ─────────
const DEMO_VENUE = {
  id:   'demo-temple-procession',
  name: 'Temple Chariot Procession & Broadway Network (Demo)',
  canvasWidth:  CANVAS_W,
  canvasHeight: CANVAS_H,
  scale: {
    px_per_meter: 25,
    reference_distance_m: 15.0,
    reference_description: 'South Broadway corridor width (~375 px ≈ 15 m), estimated from venue sketch.',
    scale_is_estimated: true,          // ← honesty field per spec
  },
  walls: [
    // ── South-West Broadway building facade ──────────────────────────────
    {
      id: 'w_sw_buildings',
      label: 'South-West Broadway Buildings',
      points: [
        { x: 0, y: 83 },
        { x: 208, y: 108 },
        { x: 195, y: 240 },
        { x: 180, y: 360 },
        { x: 160, y: 480 },
        { x: 115, y: 580 },
      ],
      closed: false,
    },

    // ── North-West Avenue building facade ────────────────────────────────
    {
      id: 'w_nw_buildings',
      label: 'North-West Avenue Buildings',
      points: [
        { x: 0, y: 45 },
        { x: 100, y: 50 },
        { x: 220, y: 55 },
        { x: 280, y: 20 },
        { x: 300, y: 0 },
      ],
      closed: false,
    },

    // ── Central-East Broadway curved building facade ─────────────────────
    {
      id: 'w_ce_buildings',
      label: 'Central-East Broadway Buildings',
      points: [
        { x: 405, y: 0 },
        { x: 415, y: 55 },
        { x: 450, y: 135 },
        { x: 510, y: 135 },
        { x: 550, y: 190 },
        { x: 555, y: 240 },
        { x: 478, y: 255 },
        { x: 475, y: 300 },
        { x: 500, y: 420 },
        { x: 490, y: 580 },
      ],
      closed: false,
    },

    // ── North-East Building Block ────────────────────────────────────────
    {
      id: 'w_ne_block',
      label: 'North-East Building Block',
      points: [
        { x: 600, y: 0 },
        { x: 605, y: 40 },
        { x: 660, y: 75 },
        { x: 740, y: 80 },
        { x: 800, y: 75 },
      ],
      closed: false,
    },

    // ── Middle-East Building Island ──────────────────────────────────────
    {
      id: 'w_me_island',
      label: 'East Side Building Island',
      points: [
        { x: 640, y: 120 },
        { x: 700, y: 112 },
        { x: 800, y: 120 },
        { x: 800, y: 175 },
        { x: 740, y: 195 },
        { x: 685, y: 175 },
      ],
      closed: true,
    },

    // ── South-East Building Block ────────────────────────────────────────
    {
      id: 'w_se_block',
      label: 'South-East Building Block',
      points: [
        { x: 650, y: 580 },
        { x: 675, y: 460 },
        { x: 700, y: 360 },
        { x: 675, y: 245 },
        { x: 730, y: 220 },
        { x: 800, y: 230 },
      ],
      closed: false,
    },

    // ── Temple Gateway & Chariot Compound Enclosure ───────────────────────
    {
      id: 'w_compound',
      label: 'Temple Compound Wall',
      points: [
        { x: 312, y: 70 },
        { x: 406, y: 70 },
        { x: 406, y: 135 },
        { x: 382, y: 145 },
        { x: 383, y: 210 },
        { x: 372, y: 238 },
        { x: 345, y: 242 },
        { x: 320, y: 232 },
        { x: 320, y: 135 },
        { x: 312, y: 135 },
      ],
      closed: true,
    },

    // ── Temple Gateway (Central Gopuram Structure) ───────────────────────
    {
      id: 'w_temple_gate',
      label: 'Temple Gateway',
      points: [
        { x: 312, y: 72 },
        { x: 406, y: 72 },
        { x: 406, y: 135 },
        { x: 312, y: 135 },
      ],
      closed: true,
    },

    // ── Procession Chariot Obstacle (Rath) ───────────────────────────────
    {
      id: 'w_chariot',
      label: 'Chariot Obstacle',
      points: [
        { x: 328, y: 180 },
        { x: 380, y: 180 },
        { x: 380, y: 215 },
        { x: 328, y: 215 },
      ],
      closed: true,
    },
  ],
  exits: [],
  spawns: [],
}

// ─── Colour constants for drawing ────────────────────────────────────────────
const DRAW_COLORS = {
  wall:       '#6366f1',   // indigo
  wallFill:   'rgba(99,102,241,0.18)',
  exit:       '#10b981',   // emerald
  spawn:      '#f59e0b',   // amber
  scale:      '#e879f9',   // fuchsia
  agent:      '#38bdf8',   // sky (normal)
  agentPanic: '#f87171',   // red (panic)
  grid:       'rgba(100,116,139,0.18)',
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function ptDist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function segMidpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlannerPage({ backendUrl = '' }) {
  // ── Venue ────────────────────────────────────────────────────────────────
  const [layout, setLayout]           = useState(null)    // loaded venue layout
  const [savedVenues, setSavedVenues] = useState([])
  const [venueName, setVenueName]     = useState('Untitled Venue')
  const [venueId, setVenueId]         = useState(null)
  const [saveStatus, setSaveStatus]   = useState('')      // '', 'saving', 'saved', 'error'

  // ── Drawing ──────────────────────────────────────────────────────────────
  const [drawTool, setDrawTool]         = useState(TOOLS.SELECT)
  const [currentPoly, setCurrentPoly]   = useState([])    // in-progress wall polygon
  const [exitLine, setExitLine]         = useState(null)  // first click of EXIT tool
  const [scalePoints, setScalePoints]   = useState([])
  const [scaleDistance, setScaleDistance] = useState('')
  const [showScaleDialog, setShowScaleDialog] = useState(false)
  const [mousePos, setMousePos]         = useState({ x: 0, y: 0 })
  const [hovered, setHovered]           = useState(false)

  // ── Simulation state ─────────────────────────────────────────────────────
  const [simMode, setSimMode]           = useState('edit')   // 'edit'|'running'|'paused'
  const [isEmergency, setIsEmergency]   = useState(false)
  const [agentCount, setAgentCount]     = useState(0)
  const [simTimeSec, setSimTimeSec]     = useState(0)
  const [maxDensity, setMaxDensity]     = useState(0)
  const [fps, setFps]                   = useState(0)

  // ── Focus mode state ─────────────────────────────────────────────────────
  const [focusPoint, setFocusPoint]             = useState({ x: 355, y: 195 })
  const [isFocusMode, setIsFocusMode]           = useState(false)
  const [focusCondition, setFocusCondition]     = useState('normal') // 'normal' | 'rushed'

  // ── Sim params ───────────────────────────────────────────────────────────
  const [spawnRate, setSpawnRate]       = useState(5)
  const [maxAgents, setMaxAgents]       = useState(800)
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.45)
  const [showGrid, setShowGrid]         = useState(false)
  const [activeSpawnIds, setActiveSpawnIds] = useState(new Set(['spawn_north', 'spawn_south']))

  // ── Refs (mutable access inside rAF loop) ────────────────────────────────
  const canvasRef        = useRef(null)
  const animFrameRef     = useRef(null)
  const agentsRef        = useRef([])
  const lastTsRef        = useRef(null)
  const simTimeRef       = useRef(0)
  const spawnAccumRef    = useRef({})
  const layoutRef        = useRef(null)
  const simModeRef       = useRef('edit')
  const isEmergencyRef   = useRef(false)
  const focusPointRef    = useRef({ x: 355, y: 195 })
  const isFocusModeRef   = useRef(false)
  const focusConditionRef = useRef('normal')
  const spawnRateRef     = useRef(5)
  const maxAgentsRef     = useRef(800)
  const heatmapOpacityRef = useRef(0.45)
  const showGridRef      = useRef(false)
  const activeSpawnIdsRef = useRef(new Set(['spawn_north', 'spawn_south']))
  const fpsCounterRef    = useRef({ frames: 0, lastTs: 0 })

  // Keep refs in sync with state
  useEffect(() => { simModeRef.current = simMode }, [simMode])
  useEffect(() => { isEmergencyRef.current = isEmergency }, [isEmergency])
  useEffect(() => { focusPointRef.current = focusPoint }, [focusPoint])
  useEffect(() => { isFocusModeRef.current = isFocusMode }, [isFocusMode])
  useEffect(() => { focusConditionRef.current = focusCondition }, [focusCondition])
  useEffect(() => { spawnRateRef.current = spawnRate }, [spawnRate])
  useEffect(() => { maxAgentsRef.current = maxAgents }, [maxAgents])
  useEffect(() => { heatmapOpacityRef.current = heatmapOpacity }, [heatmapOpacity])
  useEffect(() => { showGridRef.current = showGrid }, [showGrid])
  useEffect(() => { activeSpawnIdsRef.current = activeSpawnIds }, [activeSpawnIds])
  useEffect(() => { layoutRef.current = layout }, [layout])

  // ── Auto-restore / initial load on mount ──────────────────────────────────
  useEffect(() => {
    fetchSavedVenues()

    // 1. Check for active working draft in localStorage
    try {
      const savedDraft = localStorage.getItem('planner_active_draft')
      if (savedDraft) {
        const { layout: dLayout, venueName: dName, venueId: dId } = JSON.parse(savedDraft)
        if (dLayout && dLayout.walls) {
          setLayout(dLayout)
          if (dName) setVenueName(dName)
          if (dId) setVenueId(dId)
          if (dLayout.spawns) setActiveSpawnIds(new Set(dLayout.spawns.map(s => s.id)))
          return
        }
      }
    } catch { /* ignore parse error */ }

    // 2. Otherwise auto-load default reference demo venue
    setLayout(DEMO_VENUE)
    setVenueName(DEMO_VENUE.name)
    setVenueId(DEMO_VENUE.id)
    setActiveSpawnIds(new Set(DEMO_VENUE.spawns.map(s => s.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-save active draft to localStorage on every change ────────────────
  useEffect(() => {
    if (layout) {
      try {
        localStorage.setItem(
          'planner_active_draft',
          JSON.stringify({ layout, venueName, venueId })
        )
      } catch { /* ignore storage quota error */ }
    }
  }, [layout, venueName, venueId])

  // ── Canvas render loop ───────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const lay = layoutRef.current

    // Clear & fill with solid plain black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    if (!lay) {
      // Empty state prompt
      ctx.fillStyle = 'rgba(148,163,184,0.7)'
      ctx.font = 'bold 15px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Load a venue or draw walls to begin', CANVAS_W / 2, CANVAS_H / 2 - 10)
      ctx.font = '12px ui-monospace, monospace'
      ctx.fillStyle = 'rgba(100,116,139,0.7)'
      ctx.fillText('Select a tool above, then click on the canvas', CANVAS_W / 2, CANVAS_H / 2 + 14)
      ctx.textAlign = 'left'
      return
    }

    const pxM = lay.scale?.px_per_meter || 25

    // ── Grid lines ────────────────────────────────────────────────────────
    if (showGridRef.current) {
      ctx.strokeStyle = DRAW_COLORS.grid
      ctx.lineWidth = 0.5
      const cellPx = pxM // 1 m per cell
      for (let x = 0; x < CANVAS_W; x += cellPx) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke()
      }
      for (let y = 0; y < CANVAS_H; y += cellPx) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke()
      }
    }

    // ── Density heatmap ───────────────────────────────────────────────────
    if (agentsRef.current.length > 0 && heatmapOpacityRef.current > 0.01) {
      const grid = buildGrid(CANVAS_W, CANVAS_H, pxM, 1.0)
      const density = computeDensity(agentsRef.current, grid, pxM)
      renderHeatmap(ctx, density, grid, heatmapOpacityRef.current)
    }

    // ── Walls ─────────────────────────────────────────────────────────────
    ctx.lineWidth = 3
    ctx.strokeStyle = DRAW_COLORS.wall
    ctx.fillStyle = DRAW_COLORS.wallFill
    for (const wall of lay.walls) {
      if (!wall.points || wall.points.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(wall.points[0].x, wall.points[0].y)
      for (let i = 1; i < wall.points.length; i++) {
        ctx.lineTo(wall.points[i].x, wall.points[i].y)
      }
      if (wall.closed) {
        ctx.closePath()
        ctx.fill()
      }
      ctx.stroke()

      // Label for named obstacles
      if (wall.label && wall.closed && wall.points.length > 2) {
        const cx = wall.points.reduce((s, p) => s + p.x, 0) / wall.points.length
        const cy = wall.points.reduce((s, p) => s + p.y, 0) / wall.points.length
        ctx.fillStyle = 'rgba(165,180,252,0.9)'
        ctx.font = 'bold 9px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(wall.label.toUpperCase(), cx, cy + 3)
        ctx.textAlign = 'left'
        ctx.fillStyle = DRAW_COLORS.wallFill
      }
    }

    // ── Exits ─────────────────────────────────────────────────────────────
    for (const exit of lay.exits) {
      // Line
      ctx.lineWidth = 4
      ctx.strokeStyle = DRAW_COLORS.exit
      ctx.setLineDash([8, 4])
      ctx.beginPath()
      ctx.moveTo(exit.a.x, exit.a.y)
      ctx.lineTo(exit.b.x, exit.b.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Label
      const mid = segMidpoint(exit.a, exit.b)
      ctx.fillStyle = DRAW_COLORS.exit
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`🚪 ${exit.name || exit.id}`, mid.x, mid.y - 6)
      ctx.textAlign = 'left'
    }

    // ── Spawn points ──────────────────────────────────────────────────────
    for (const sp of lay.spawns) {
      const isActive = activeSpawnIdsRef.current.has(sp.id)
      ctx.fillStyle = isActive ? DRAW_COLORS.spawn : 'rgba(100,116,139,0.5)'
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('S', sp.x, sp.y + 3)
      ctx.textAlign = 'left'
      // Name
      ctx.fillStyle = DRAW_COLORS.spawn
      ctx.font = '9px ui-monospace, monospace'
      ctx.fillText(sp.name || sp.id, sp.x + 12, sp.y + 3)
    }

    // ── Focus Point Target & Radar Rings ──────────────────────────────────
    if (focusPoint) {
      const fx = focusPoint.x
      const fy = focusPoint.y
      const isActive = isFocusModeRef.current
      const isRushed = isActive && focusConditionRef.current === 'rushed'
      const themeColor = isActive ? (isRushed ? '#ef4444' : '#a855f7') : '#94a3b8'

      // Pulsing concentric radar rings when active
      if (isActive) {
        const pulse = (Date.now() % 1600) / 1600
        const pulseRadius1 = 10 + pulse * 32
        const pulseAlpha1 = Math.max(0, 1 - pulse)
        const pulse2 = ((Date.now() + 800) % 1600) / 1600
        const pulseRadius2 = 10 + pulse2 * 32
        const pulseAlpha2 = Math.max(0, 1 - pulse2)

        ctx.save()
        ctx.strokeStyle = themeColor
        ctx.lineWidth = 1.8

        ctx.globalAlpha = pulseAlpha1 * 0.7
        ctx.beginPath(); ctx.arc(fx, fy, pulseRadius1, 0, Math.PI * 2); ctx.stroke()

        ctx.globalAlpha = pulseAlpha2 * 0.7
        ctx.beginPath(); ctx.arc(fx, fy, pulseRadius2, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }

      // Outer bullseye ring
      ctx.save()
      ctx.strokeStyle = themeColor
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(fx, fy, 11, 0, Math.PI * 2)
      ctx.stroke()

      // Target core
      ctx.fillStyle = themeColor
      ctx.beginPath()
      ctx.arc(fx, fy, 6, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(fx, fy, 2.5, 0, Math.PI * 2)
      ctx.fill()

      // Crosshairs
      ctx.strokeStyle = themeColor
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(fx - 15, fy); ctx.lineTo(fx - 8, fy)
      ctx.moveTo(fx + 8, fy); ctx.lineTo(fx + 15, fy)
      ctx.moveTo(fx, fy - 15); ctx.lineTo(fx, fy - 8)
      ctx.moveTo(fx, fy + 8); ctx.lineTo(fx, fy + 15)
      ctx.stroke()

      // Badge Label
      ctx.fillStyle = themeColor
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.textAlign = 'center'
      const labelText = isActive
        ? (isRushed ? '⚡ RUSHED FOCUS' : '🎯 FOCUS POINT')
        : '📍 FOCUS (OFF)'
      ctx.fillText(labelText, fx, fy - 14)
      ctx.textAlign = 'left'
      ctx.restore()
    }

    // ── Agents ────────────────────────────────────────────────────────────
    for (const agent of agentsRef.current) {
      if (agent.reachedExit) continue
      const px = agent.pos.x * pxM
      const py = agent.pos.y * pxM
      ctx.fillStyle = agent.isPanic
        ? DRAW_COLORS.agentPanic
        : agent.isFocus
        ? '#c084fc'
        : DRAW_COLORS.agent
      ctx.beginPath()
      ctx.arc(px, py, Math.max(2.5, pxM * 0.22), 0, Math.PI * 2)
      ctx.fill()
    }

    // ── In-progress drawing ───────────────────────────────────────────────
    if (drawTool === TOOLS.WALL && currentPoly.length > 0) {
      ctx.strokeStyle = DRAW_COLORS.wall
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(currentPoly[0].x, currentPoly[0].y)
      for (let i = 1; i < currentPoly.length; i++) ctx.lineTo(currentPoly[i].x, currentPoly[i].y)
      if (hovered) ctx.lineTo(mousePos.x, mousePos.y)
      ctx.stroke()
      ctx.setLineDash([])
      // Dots for placed points
      for (const pt of currentPoly) {
        ctx.fillStyle = DRAW_COLORS.wall
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2); ctx.fill()
      }
      // Close hint if near first point
      if (currentPoly.length > 2 && ptDist(mousePos, currentPoly[0]) < 18) {
        ctx.strokeStyle = '#a5b4fc'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(currentPoly[0].x, currentPoly[0].y, 10, 0, Math.PI * 2); ctx.stroke()
      }
    }

    if (drawTool === TOOLS.EXIT && exitLine) {
      ctx.strokeStyle = DRAW_COLORS.exit
      ctx.lineWidth = 3
      ctx.setLineDash([6, 3])
      ctx.beginPath(); ctx.moveTo(exitLine.x, exitLine.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke()
      ctx.setLineDash([])
    }

    if (drawTool === TOOLS.FOCUS && hovered) {
      ctx.save()
      ctx.strokeStyle = '#a855f7'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.arc(mousePos.x, mousePos.y, 14, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#a855f7'
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('CLICK TO SET FOCUS', mousePos.x, mousePos.y - 18)
      ctx.restore()
    }

    if (drawTool === TOOLS.SCALE && scalePoints.length > 0) {
      ctx.strokeStyle = DRAW_COLORS.scale
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(scalePoints[0].x, scalePoints[0].y)
      if (scalePoints.length === 1 && hovered) ctx.lineTo(mousePos.x, mousePos.y)
      if (scalePoints.length === 2) ctx.lineTo(scalePoints[1].x, scalePoints[1].y)
      ctx.stroke()
      ctx.setLineDash([])
      for (const pt of scalePoints) {
        ctx.fillStyle = DRAW_COLORS.scale
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2); ctx.fill()
      }
    }
  }, [currentPoly, exitLine, scalePoints, mousePos, hovered, drawTool, focusPoint])

  // ── Simulation animation loop ─────────────────────────────────────────────
  const runSimLoop = useCallback(() => {
    const tick = (timestamp) => {
      const lay = layoutRef.current
      if (!lay) { animFrameRef.current = requestAnimationFrame(tick); return }

      // dt capped to prevent spiral-of-death on tab-resume
      const dt = lastTsRef.current
        ? Math.min((timestamp - lastTsRef.current) / 1000, 0.033)
        : 0.016
      lastTsRef.current = timestamp

      const pxM = lay.scale?.px_per_meter || 25
      const wallSegs  = extractWallSegments(lay.walls, pxM)
      const exits_m   = convertExitsToMeters(lay.exits, pxM)
      const spawns_m  = convertSpawnsToMeters(lay.spawns, pxM)

      // ── Spawn agents ───────────────────────────────────────────────────
      if (
        simModeRef.current === 'running' &&
        agentsRef.current.length < maxAgentsRef.current &&
        exits_m.length > 0 &&
        spawns_m.length > 0
      ) {
        for (const sp_m of spawns_m) {
          if (!activeSpawnIdsRef.current.has(sp_m.id)) continue
          if (!spawnAccumRef.current[sp_m.id]) spawnAccumRef.current[sp_m.id] = 0
          spawnAccumRef.current[sp_m.id] += dt * spawnRateRef.current

          while (
            spawnAccumRef.current[sp_m.id] >= 1 &&
            agentsRef.current.length < maxAgentsRef.current
          ) {
            spawnAccumRef.current[sp_m.id] -= 1
            // Assign goal to opposite exit (bidirectional & multi-branch flow)
            const isSouth = sp_m.id.includes('south') || sp_m.id.includes('se')
            const oppositeExits = exits_m.filter(e => isSouth ? (!e.id.includes('south') && !e.id.includes('se')) : (e.id.includes('south') || e.id.includes('se')))
            const goalExit = oppositeExits.length > 0
              ? oppositeExits[Math.floor(Math.random() * oppositeExits.length)]
              : (exits_m.find(e => isSouth ? e.id.includes('north') : e.id.includes('south')) || exits_m[0])
            agentsRef.current.push(spawnAgent(sp_m, goalExit, DEFAULT_SFM_PARAMS))
          }
        }
      }

      // ── Step SFM ──────────────────────────────────────────────────────
      if (simModeRef.current === 'running' && agentsRef.current.length > 0) {
        sfmStep(agentsRef.current, wallSegs, exits_m, dt, DEFAULT_SFM_PARAMS)
      }

      // ── Remove exited agents ──────────────────────────────────────────
      const before = agentsRef.current.length
      agentsRef.current = agentsRef.current.filter(a => !a.reachedExit)
      if (agentsRef.current.length !== before) {
        // Trigger React state update for count
        setAgentCount(agentsRef.current.length)
      }

      // ── Sim time ──────────────────────────────────────────────────────
      if (simModeRef.current === 'running') {
        simTimeRef.current += dt
        // Update display at ~10Hz to avoid too-frequent React re-renders
        if (Math.floor(simTimeRef.current * 10) !== Math.floor((simTimeRef.current - dt) * 10)) {
          setSimTimeSec(simTimeRef.current)
          setAgentCount(agentsRef.current.length)

          // Max density stat
          if (agentsRef.current.length > 0) {
            const grid = buildGrid(CANVAS_W, CANVAS_H, pxM, 1.0)
            const dens = computeDensity(agentsRef.current, grid, pxM)
            setMaxDensity(getMaxDensity(dens))
          } else {
            setMaxDensity(0)
          }
        }
      }

      // ── FPS counter ───────────────────────────────────────────────────
      fpsCounterRef.current.frames++
      if (timestamp - fpsCounterRef.current.lastTs >= 1000) {
        setFps(fpsCounterRef.current.frames)
        fpsCounterRef.current = { frames: 0, lastTs: timestamp }
      }

      // ── Draw ──────────────────────────────────────────────────────────
      drawCanvas()

      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)
  }, [drawCanvas])

  // Start loop on mount, stop on unmount
  useEffect(() => {
    runSimLoop()
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [runSimLoop])

  // ── Canvas mouse events ───────────────────────────────────────────────────
  const getCanvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    const scaleY = CANVAS_H / rect.height
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top)  * scaleY),
    }
  }

  const handleCanvasMouseMove = (e) => {
    setMousePos(getCanvasPos(e))
  }

  const handleCanvasClick = (e) => {
    const pos = getCanvasPos(e)

    if (drawTool === TOOLS.FOCUS) {
      setFocusPoint(pos)
      setIsFocusMode(true)
      const pxM = layout?.scale?.px_per_meter || 25
      if (agentsRef.current.length > 0) {
        setFocusTarget(agentsRef.current, { x: pos.x / pxM, y: pos.y / pxM }, focusCondition)
      }
      return
    }

    if (simMode !== 'edit') return

    if (drawTool === TOOLS.WALL) {
      // Close polygon if clicking near first point
      if (currentPoly.length > 2 && ptDist(pos, currentPoly[0]) < 18) {
        // Close and save
        const newWall = {
          id: `wall_${Date.now()}`,
          label: '',
          points: [...currentPoly],
          closed: true,
        }
        setLayout(prev => ({ ...prev, walls: [...(prev?.walls || []), newWall] }))
        setCurrentPoly([])
      } else {
        setCurrentPoly(prev => [...prev, pos])
      }

    } else if (drawTool === TOOLS.EXIT) {
      if (!exitLine) {
        setExitLine(pos)
      } else {
        const name = prompt('Exit name:', `Exit ${(layout?.exits?.length || 0) + 1}`) || 'Exit'
        const newExit = { id: `exit_${Date.now()}`, name, a: exitLine, b: pos }
        setLayout(prev => ({ ...prev, exits: [...(prev?.exits || []), newExit] }))
        setExitLine(null)
      }

    } else if (drawTool === TOOLS.SPAWN) {
      const name = prompt('Spawn name:', `Entry ${(layout?.spawns?.length || 0) + 1}`) || 'Entry'
      const newSpawn = { id: `spawn_${Date.now()}`, name, x: pos.x, y: pos.y }
      setLayout(prev => ({ ...prev, spawns: [...(prev?.spawns || []), newSpawn] }))
      // Auto-activate new spawn
      setActiveSpawnIds(prev => new Set([...prev, newSpawn.id]))

    } else if (drawTool === TOOLS.SCALE) {
      if (scalePoints.length < 2) {
        const updated = [...scalePoints, pos]
        setScalePoints(updated)
        if (updated.length === 2) setShowScaleDialog(true)
      }
    }
  }

  const toggleFocusMode = (active) => {
    const newActive = typeof active === 'boolean' ? active : !isFocusMode
    setIsFocusMode(newActive)
    const lay = layoutRef.current
    if (newActive && focusPointRef.current && lay?.scale?.px_per_meter) {
      const pxM = lay.scale.px_per_meter
      setFocusTarget(
        agentsRef.current,
        { x: focusPointRef.current.x / pxM, y: focusPointRef.current.y / pxM },
        focusConditionRef.current
      )
    } else if (!newActive && lay) {
      const pxM = lay.scale?.px_per_meter || 25
      const exits_m = convertExitsToMeters(lay.exits, pxM)
      for (const a of agentsRef.current) {
        a.isFocus = false
        a.isPanic = false
        a.desiredSpeed = DEFAULT_SFM_PARAMS.desiredSpeed * (0.85 + Math.random() * 0.3)
        if (exits_m.length > 0) {
          a.goal = { ...exits_m[Math.floor(Math.random() * exits_m.length)].center_m }
        }
      }
    }
  }

  const handleFocusConditionChange = (cond) => {
    setFocusCondition(cond)
    if (isFocusMode && focusPointRef.current && layoutRef.current?.scale?.px_per_meter) {
      const pxM = layoutRef.current.scale.px_per_meter
      setFocusTarget(
        agentsRef.current,
        { x: focusPointRef.current.x / pxM, y: focusPointRef.current.y / pxM },
        cond
      )
    }
  }

  const handleCanvasDoubleClick = (e) => {
    if (drawTool === TOOLS.WALL && currentPoly.length >= 2) {
      // Double-click to finish open polyline (not closed)
      const pos = getCanvasPos(e)
      const finalPoly = [...currentPoly, pos]
      const newWall = { id: `wall_${Date.now()}`, label: '', points: finalPoly, closed: false }
      setLayout(prev => ({ ...prev, walls: [...(prev?.walls || []), newWall] }))
      setCurrentPoly([])
    }
  }

  // ── Venue actions ─────────────────────────────────────────────────────────
  const fetchSavedVenues = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/venues`)
      if (res.ok) {
        const data = await res.json()
        setSavedVenues(data.venues || [])
      }
    } catch {
      // Backend offline — silently fall back to localStorage list
      const stored = localStorage.getItem('planner_venues_index')
      if (stored) setSavedVenues(JSON.parse(stored))
    }
  }

  const loadVenue = async (id) => {
    // Check for demo venue
    if (id === DEMO_VENUE.id) {
      setLayout(DEMO_VENUE)
      setVenueName(DEMO_VENUE.name)
      setVenueId(DEMO_VENUE.id)
      setActiveSpawnIds(new Set(DEMO_VENUE.spawns.map(s => s.id)))
      resetSimState()
      return
    }

    // Try backend
    try {
      const res = await fetch(`${backendUrl}/api/venues/${id}`)
      if (res.ok) {
        const data = await res.json()
        setLayout(data.layout)
        setVenueName(data.name)
        setVenueId(data.venue_id)
        setActiveSpawnIds(new Set((data.layout?.spawns || []).map(s => s.id)))
        resetSimState()
        return
      }
    } catch { /* fall through */ }

    // Try localStorage
    const stored = localStorage.getItem(`planner_venue_${id}`)
    if (stored) {
      const data = JSON.parse(stored)
      setLayout(data.layout)
      setVenueName(data.name)
      setVenueId(id)
      setActiveSpawnIds(new Set((data.layout?.spawns || []).map(s => s.id)))
      resetSimState()
    }
  }

  const saveVenue = async () => {
    if (!layout) return
    setSaveStatus('saving')
    const id = venueId || `venue_${Date.now()}`
    const payload = { venue_id: id, name: venueName, layout }

    try {
      const res = await fetch(`${backendUrl}/api/venues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setVenueId(id)
        setSaveStatus('saved')
        fetchSavedVenues()
        setTimeout(() => setSaveStatus(''), 2000)
        return
      }
    } catch { /* fall through */ }

    // localStorage fallback
    localStorage.setItem(`planner_venue_${id}`, JSON.stringify(payload))
    const index = JSON.parse(localStorage.getItem('planner_venues_index') || '[]')
    if (!index.find(v => v.venue_id === id)) {
      index.push({ venue_id: id, name: venueName, created_at: new Date().toISOString() })
      localStorage.setItem('planner_venues_index', JSON.stringify(index))
    }
    setVenueId(id)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus(''), 2000)
  }

  const resetToDemoVenue = () => {
    if (window.confirm('Reset map to original reference venue? Any unsaved custom tweaks will be replaced.')) {
      try { localStorage.removeItem('planner_active_draft') } catch { /* ignore */ }
      resetSimState()
      setLayout(DEMO_VENUE)
      setVenueName(DEMO_VENUE.name)
      setVenueId(DEMO_VENUE.id)
      setActiveSpawnIds(new Set(DEMO_VENUE.spawns.map(s => s.id)))
    }
  }

  const newBlankVenue = () => {
    resetSimState()
    try { localStorage.removeItem('planner_active_draft') } catch { /* ignore */ }
    setLayout({
      walls: [], exits: [], spawns: [],
      scale: { px_per_meter: 25, reference_distance_m: 15, scale_is_estimated: true },
    })
    setVenueName('Untitled Custom Venue')
    setVenueId(null)
  }

  // ── Simulation controls ───────────────────────────────────────────────────
  const resetSimState = () => {
    agentsRef.current = []
    simTimeRef.current = 0
    spawnAccumRef.current = {}
    lastTsRef.current = null
    resetAgentIds()
    setAgentCount(0)
    setSimTimeSec(0)
    setMaxDensity(0)
    setFps(0)
    setIsEmergency(false)
    setSimMode('edit')
  }

  const handleStart = () => {
    if (!layout) return
    lastTsRef.current = null
    setSimMode('running')
  }

  const handlePause = () => setSimMode('paused')

  const handleReset = () => resetSimState()

  const handleTriggerEmergency = () => {
    if (simMode === 'edit') return
    const lay = layoutRef.current
    if (!lay) return
    const pxM = lay.scale?.px_per_meter || 25
    const exits_m = convertExitsToMeters(lay.exits, pxM)
    sfmTriggerEmergency(agentsRef.current, exits_m, DEFAULT_SFM_PARAMS)
    setIsEmergency(true)
  }

  // Scale dialog confirm
  const handleScaleConfirm = () => {
    const d = parseFloat(scaleDistance)
    if (!d || d <= 0 || scalePoints.length < 2) { setShowScaleDialog(false); return }
    const pixelDist = ptDist(scalePoints[0], scalePoints[1])
    const pxPerMeter = pixelDist / d
    setLayout(prev => ({
      ...(prev || { walls:[], exits:[], spawns:[] }),
      scale: { px_per_meter: pxPerMeter, reference_distance_m: d, scale_is_estimated: false },
    }))
    setScalePoints([])
    setScaleDistance('')
    setShowScaleDialog(false)
  }

  // ── Undo last wall polygon ────────────────────────────────────────────────
  const handleUndoWall = () => {
    if (currentPoly.length > 0) {
      setCurrentPoly(prev => prev.slice(0, -1))
    } else {
      setLayout(prev => prev ? { ...prev, walls: prev.walls.slice(0, -1) } : prev)
    }
  }

  const handleClearAll = () => {
    if (!window.confirm('Clear all walls, exits, and spawn points?')) return
    setLayout(prev => prev ? { ...prev, walls: [], exits: [], spawns: [] } : prev)
    setCurrentPoly([])
    setExitLine(null)
    resetSimState()
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const toolDefs = [
    { id: TOOLS.SELECT, label: '↖ SELECT',  tip: 'Pan / inspect (no drawing)' },
    { id: TOOLS.WALL,   label: '⬛ WALL',   tip: 'Click to place polygon points; double-click or click near start to close' },
    { id: TOOLS.EXIT,   label: '🚪 EXIT',   tip: 'Click point A then point B to draw an exit line' },
    { id: TOOLS.SPAWN,  label: '📍 SPAWN',  tip: 'Click to place an agent spawn / entry point' },
    { id: TOOLS.FOCUS,  label: '🎯 FOCUS',  tip: 'Click canvas to set crowd attraction / focus point target' },
    { id: TOOLS.SCALE,  label: '📏 SCALE',  tip: 'Click two points then enter real-world distance to set px/m scale' },
  ]

  return (
    <div className="flex flex-col gap-0" style={{ minHeight: 0 }}>

      {/* ── Persistent Disclaimer Banner ──────────────────────────────── */}
      <div
        className="flex items-start gap-2.5 px-4 py-2.5 border-b border-amber-300/60 dark:border-amber-800/60 text-xs"
        style={{ background: 'rgba(217,119,6,0.08)', color: 'var(--risk-yellow)' }}
        role="status"
        aria-label="Planning tool disclaimer"
      >
        <span className="text-base shrink-0 mt-px">⚠️</span>
        <span className="font-semibold leading-relaxed">
          <strong>Illustrative planning aid</strong> — simplified Social Force Model simulation (Helbing &amp; Molnár, 1995).{' '}
          <strong>Not a certified evacuation-engineering tool.</strong>{' '}
          Parameters are not empirically calibrated against real crowd data for this venue.
          All outputs show <em>simulated</em> bottleneck locations and relative density buildup under stated assumptions only —
          not predicted casualties or guaranteed evacuation times.
        </span>
      </div>

      {/* ── Main Layout: Editor Left + Sim Right ──────────────────────── */}
      <div className="flex gap-4 p-4" style={{ minHeight: 0 }}>

        {/* ── Left Panel: Venue Management + Drawing Tools ──────────── */}
        <div className="flex flex-col gap-3 w-52 shrink-0">

          {/* Header */}
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--color-text)' }}>
              🏗️ Venue Editor
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
              Draw walls, exits &amp; spawns
            </p>
          </div>

          {/* Venue selector */}
          <div
            className="rounded-xl p-3 border flex flex-col gap-2"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            <p className="font-bold uppercase text-[10px] tracking-wider" style={{ color: 'var(--color-muted)' }}>Venue</p>
            <input
              value={venueName}
              onChange={e => setVenueName(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg border w-full font-mono-num"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              placeholder="Venue name…"
            />
            <select
              id="planner-venue-select"
              className="text-xs px-2 py-1.5 rounded-lg border w-full font-mono-num"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              value={venueId || ''}
              onChange={e => e.target.value && loadVenue(e.target.value)}
            >
              <option value="">— Load venue —</option>
              <option value={DEMO_VENUE.id}>{DEMO_VENUE.name}</option>
              {savedVenues
                .filter(v => v.venue_id !== DEMO_VENUE.id)
                .map(v => (
                  <option key={v.venue_id} value={v.venue_id}>{v.name}</option>
                ))}
            </select>
            <div className="flex gap-1.5">
              <button
                onClick={saveVenue}
                disabled={!layout}
                className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-all"
                title="Save this venue to database and browser storage"
              >
                {saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓ Saved' : '💾 Save'}
              </button>
              <button
                onClick={newBlankVenue}
                className="text-[10px] font-bold py-1.5 px-2 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                title="Create a new blank venue"
              >
                + New
              </button>
              <button
                onClick={resetToDemoVenue}
                className="text-[10px] font-bold py-1.5 px-2 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-amber-500"
                style={{ borderColor: 'var(--color-border)' }}
                title="Reset map to clean default reference venue"
              >
                🔄 Reset
              </button>
            </div>
          </div>

          {/* Drawing tools */}
          <div
            className="rounded-xl p-3 border"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            <p className="font-bold uppercase text-[10px] tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>
              Drawing Tool
            </p>
            {toolDefs.map(t => (
              <button
                key={t.id}
                id={`planner-tool-${t.id.toLowerCase()}`}
                title={t.tip}
                onClick={() => {
                  setDrawTool(t.id)
                  setCurrentPoly([])
                  setExitLine(null)
                  setScalePoints([])
                }}
                className={`w-full text-left text-[10px] font-bold px-2 py-1.5 rounded-lg mb-1 transition-all ${
                  drawTool === t.id
                    ? 'bg-sky-600 text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                style={drawTool !== t.id ? { color: 'var(--color-text)' } : {}}
              >
                {t.label}
              </button>
            ))}

            {/* Tool hint */}
            <p className="text-[9px] mt-1 leading-tight" style={{ color: 'var(--color-muted)' }}>
              {toolDefs.find(t => t.id === drawTool)?.tip}
            </p>
          </div>

          {/* Edit actions */}
          <div className="flex gap-1.5">
            <button
              onClick={handleUndoWall}
              className="flex-1 text-[10px] font-bold py-1.5 rounded-lg border transition-all hover:bg-slate-100 dark:hover:bg-slate-700"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
              title="Undo last placed point or wall"
            >
              ↩ Undo
            </button>
            <button
              onClick={handleClearAll}
              className="flex-1 text-[10px] font-bold py-1.5 rounded-lg border border-red-400/40 text-red-500 dark:text-red-400 transition-all hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              🗑 Clear
            </button>
          </div>

          {/* Scale info */}
          {layout?.scale && (
            <div
              className="rounded-lg p-2.5 border text-[9px] font-mono-num"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
            >
              <span className="font-bold">Scale:</span>{' '}
              {layout.scale.px_per_meter?.toFixed(1)} px/m
              {layout.scale.scale_is_estimated && (
                <span className="ml-1 text-amber-500">(estimated)</span>
              )}
            </div>
          )}
        </div>

        {/* ── Centre: Simulation Canvas ─────────────────────────────── */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div
            className="relative rounded-xl overflow-hidden border shadow-inner"
            style={{ borderColor: 'var(--color-border)', background: '#0f172a' }}
          >
            <canvas
              ref={canvasRef}
              id="planner-canvas"
              width={CANVAS_W}
              height={CANVAS_H}
              className="block w-full"
              style={{
                cursor: simMode === 'edit' ? (drawTool === TOOLS.SELECT ? 'default' : 'crosshair') : 'default',
                maxHeight: '68vh',
                objectFit: 'contain',
              }}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
              onMouseMove={handleCanvasMouseMove}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => { setHovered(false); setMousePos({ x: -999, y: -999 }) }}
            />

            {/* Sim mode badge overlay */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/70 backdrop-blur text-xs font-mono-num">
              <span
                className={`w-2 h-2 rounded-full ${simMode === 'running' ? 'pulse-dot' : ''}`}
                style={{ background: simMode === 'running' ? '#10b981' : simMode === 'paused' ? '#f59e0b' : '#64748b' }}
              />
              <span className="text-white font-bold uppercase">{simMode}</span>
              {isEmergency && (
                <span className="ml-1 text-red-400 font-extrabold animate-pulse">🚨 EMERGENCY</span>
              )}
            </div>

            {/* Mouse coordinate overlay (edit mode) */}
            {simMode === 'edit' && hovered && (
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur text-[9px] font-mono-num text-slate-300">
                {mousePos.x}, {mousePos.y} px
                {layout?.scale?.px_per_meter
                  ? ` · ${(mousePos.x / layout.scale.px_per_meter).toFixed(1)}, ${(mousePos.y / layout.scale.px_per_meter).toFixed(1)} m`
                  : ''}
              </div>
            )}
          </div>

          {/* Canvas legend */}
          <div className="flex flex-wrap gap-3 text-[9px] font-mono-num px-1" style={{ color: 'var(--color-muted)' }}>
            <span><span style={{ color: '#6366f1' }}>■</span> Walls/Obstacles</span>
            <span><span style={{ color: '#10b981' }}>- -</span> Exits</span>
            <span><span style={{ color: '#f59e0b' }}>●</span> Spawn points</span>
            <span><span style={{ color: '#38bdf8' }}>●</span> Agents (normal)</span>
            <span><span style={{ color: '#f87171' }}>●</span> Agents (panic)</span>
            <span>Heatmap: Fruin LOS A→F bands</span>
          </div>
        </div>

        {/* ── Right Panel: Simulation Controls ──────────────────────── */}
        <div
          className="w-56 shrink-0 rounded-xl border p-3 overflow-y-auto"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            maxHeight: '82vh',
          }}
        >
          <h2 className="text-xs font-extrabold uppercase tracking-widest mb-3" style={{ color: 'var(--color-text)' }}>
            ▶ Simulation
          </h2>
          <PlannerControls
            simMode={simMode}
            isEmergency={isEmergency}
            onStart={handleStart}
            onPause={handlePause}
            onReset={handleReset}
            onTriggerEmergency={handleTriggerEmergency}
            focusPoint={focusPoint}
            isFocusMode={isFocusMode}
            onToggleFocusMode={toggleFocusMode}
            focusCondition={focusCondition}
            onFocusConditionChange={handleFocusConditionChange}
            onSelectFocusTool={() => {
              setDrawTool(TOOLS.FOCUS)
              setCurrentPoly([])
              setExitLine(null)
              setScalePoints([])
            }}
            spawnRate={spawnRate}
            onSpawnRateChange={setSpawnRate}
            maxAgents={maxAgents}
            onMaxAgentsChange={setMaxAgents}
            activeSpawnIds={activeSpawnIds}
            spawns={layout?.spawns || []}
            onToggleSpawn={(id) =>
              setActiveSpawnIds(prev => {
                const next = new Set(prev)
                next.has(id) ? next.delete(id) : next.add(id)
                return next
              })
            }
            heatmapOpacity={heatmapOpacity}
            onHeatmapOpacityChange={setHeatmapOpacity}
            showGrid={showGrid}
            onShowGridChange={setShowGrid}
            agentCount={agentCount}
            simTimeSec={simTimeSec}
            maxDensityPpm2={maxDensity}
            fps={fps}
            hasVenue={!!layout}
          />
        </div>
      </div>

      {/* ── Scale Dialog ───────────────────────────────────────────── */}
      {showScaleDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowScaleDialog(false)}>
          <div
            className="rounded-2xl p-6 border shadow-2xl w-80"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-base mb-1" style={{ color: 'var(--color-text)' }}>Set Scale Reference</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
              Pixel distance: {scalePoints.length === 2 ? Math.round(ptDist(scalePoints[0], scalePoints[1])) : '—'} px<br />
              Enter the real-world distance this represents:
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={scaleDistance}
                onChange={e => setScaleDistance(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border text-sm font-mono-num"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                placeholder="e.g. 14"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleScaleConfirm()}
              />
              <span className="text-sm font-bold" style={{ color: 'var(--color-muted)' }}>meters</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleScaleConfirm}
                className="flex-1 py-2 rounded-lg font-bold text-sm bg-sky-600 hover:bg-sky-500 text-white transition-all"
              >
                Set Scale
              </button>
              <button
                onClick={() => { setShowScaleDialog(false); setScalePoints([]) }}
                className="flex-1 py-2 rounded-lg font-bold text-sm border transition-all hover:bg-slate-100 dark:hover:bg-slate-700"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
