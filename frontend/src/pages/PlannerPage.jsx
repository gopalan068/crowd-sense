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
import Venue25DViewer from '../components/Venue25DViewer.jsx'
import PlannerReportPage from './PlannerReportPage.jsx'

import {
  DEFAULT_SFM_PARAMS,
  spawnAgent,
  triggerEmergency as sfmTriggerEmergency,
  setFocusTarget,
  step as sfmStep,
  extractWallSegments,
  extractBuildingPolygons,
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
const CANVAS_H = 850

// ─── Drawing tool IDs ─────────────────────────────────────────────────────────
const TOOLS = {
  WALL: 'WALL',
  BARRICADE: 'BARRICADE',
  EXIT: 'EXIT',
  OPENING: 'OPENING',
  SPAWN: 'SPAWN',
  FOCUS: 'FOCUS',
  SCALE: 'SCALE',
  SELECT: 'SELECT',
}

// ─── Demo venue: Temple Chariot Procession & Broadway Network (Demo) ─────────
const DEMO_VENUE = {
  id: 'demo-temple-procession',
  name: 'Temple Chariot Procession & Broadway Network (Demo)',
  canvasWidth: CANVAS_W,
  canvasHeight: CANVAS_H,
  scale: {
    px_per_meter: 13.363,
    reference_distance_m: 28.06,
    reference_description: 'South Broadway corridor width (~375 px ≈ 28.1 m, calibrated to 3.5 sq.m per 25px grid square).',
    scale_is_estimated: true,          // ← honesty field per spec
  },
  walls: [
    // ── 1. North-West Building Block (Top-Left) ──────────────────────────
    {
      id: 'w_nw_block',
      label: 'North-West Building Block',
      points: [
        { x: 0, y: 0 },
        { x: 311, y: 2 },
        { x: 282, y: 21 },
        { x: 220, y: 55 },
        { x: 100, y: 50 },
        { x: 0, y: 45 },
      ],
      closed: true,
    },

    // ── 2. South-West Broadway Buildings (Middle-Left) ───────────────────
    {
      id: 'w_sw_block',
      label: 'South-West Broadway Buildings',
      points: [
        { x: 0, y: 83 },
        { x: 208, y: 108 },
        { x: 195, y: 240 },
        { x: 180, y: 360 },
        { x: 160, y: 480 },
        { x: 115, y: 580 },
        { x: 0, y: 580 },
      ],
      closed: true,
    },

    // ── 3. Lower South-West Building Block (Bottom-Left) ─────────────────
    {
      id: 'w_lsw_block',
      label: 'Lower South-West Building Block',
      points: [
        { x: 0, y: 639 },
        { x: 146, y: 641 },
        { x: 165, y: 708 },
        { x: 163, y: 777 },
        { x: 160, y: 849 },
        { x: 0, y: 849 },
      ],
      closed: true,
    },

    // ── 4. Central-East Building Complex (Single Unified Full-Height) ────
    {
      id: 'w_ce_complex',
      label: 'Central-East Building Complex',
      points: [
        { x: 405, y: 0 },
        { x: 517, y: 1 },
        { x: 623, y: 233 },
        { x: 629, y: 359 },
        { x: 618, y: 462 },
        { x: 597, y: 560 },
        { x: 589, y: 577 },
        { x: 579, y: 847 },
        { x: 472, y: 849 },
        { x: 490, y: 577 },
        { x: 500, y: 420 },
        { x: 475, y: 300 },
        { x: 478, y: 255 },
        { x: 555, y: 240 },
        { x: 550, y: 190 },
        { x: 510, y: 135 },
        { x: 450, y: 135 },
        { x: 415, y: 55 },
      ],
      closed: true,
    },

    // ── 5. North-East Building Block (Top-Right) ─────────────────────────
    {
      id: 'w_ne_block',
      label: 'North-East Building Block',
      points: [
        { x: 600, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 75 },
        { x: 740, y: 80 },
        { x: 660, y: 75 },
        { x: 605, y: 40 },
      ],
      closed: true,
    },

    // ── 6. East Side Building Island ─────────────────────────────────────
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

    // ── 7. South-East Building Block (Bottom-Right) ──────────────────────
    {
      id: 'w_se_block',
      label: 'South-East Building Block',
      points: [
        { x: 800, y: 230 },
        { x: 730, y: 220 },
        { x: 675, y: 245 },
        { x: 700, y: 360 },
        { x: 675, y: 460 },
        { x: 650, y: 580 },
        { x: 657, y: 636 },
        { x: 653, y: 687 },
        { x: 648, y: 717 },
        { x: 630, y: 834 },
        { x: 628, y: 847 },
        { x: 800, y: 847 },
      ],
      closed: true,
    },

    // ── 8. Temple Gateway (Central Gopuram Tower Landmark) ───────────────
    {
      id: 'w_temple_gate',
      label: 'Temple Gateway (Gopuram)',
      points: [
        { x: 311, y: 108 },
        { x: 405, y: 108 },
        { x: 405, y: 171 },
        { x: 311, y: 171 },
      ],
      closed: true,
    },

    // ── 9. Temple Compound Wall (Courtyard Enclosure) ─────────────────────
    {
      id: 'w_compound',
      label: 'Temple Compound Wall',
      points: [
        { x: 312, y: 106 },
        { x: 406, y: 106 },
        { x: 406, y: 171 },
        { x: 382, y: 181 },
        { x: 383, y: 246 },
        { x: 372, y: 274 },
        { x: 345, y: 278 },
        { x: 320, y: 268 },
        { x: 320, y: 171 },
        { x: 312, y: 171 },
      ],
      closed: true,
    },

    // ── 10. Procession Chariot Obstacle (Rath) ───────────────────────────
    {
      id: 'w_chariot',
      label: 'Chariot Obstacle (Rath)',
      points: [
        { x: 323, y: 230 },
        { x: 375, y: 230 },
        { x: 375, y: 265 },
        { x: 323, y: 265 },
      ],
      closed: true,
    },
  ],
  exits: [
    {
      id: 'exit_west',
      name: 'Exit 1 (West)',
      a: { x: 4, y: 37 },
      b: { x: 4, y: 103 },
    },
    {
      id: 'exit_north',
      name: 'Exit 2 (North)',
      a: { x: 313, y: 6 },
      b: { x: 407, y: 6 },
    },
  ],
  spawns: [
    {
      id: 'spawn_nw',
      name: 'Entry 1 (North-West)',
      x: 50,
      y: 66,
    },
    {
      id: 'spawn_south',
      name: 'Entry (South Broadway)',
      x: 215,
      y: 818,
    },
  ],
  barricades: [
    {
      id: 'barricade_main',
      name: 'Longitudinal Broadway Barricade',
      a: { x: 284, y: 121 },
      b: { x: 265, y: 824 },
    },
    {
      id: 'barricade_north',
      name: 'North Temple Barricade',
      a: { x: 397, y: 65 },
      b: { x: 296, y: 77 },
    },
    {
      id: 'barricade_flank',
      name: 'Temple NW Flank Barricade',
      a: { x: 285, y: 123 },
      b: { x: 295, y: 78 },
    },
  ],
  openings: [
    {
      id: 'opening_gate_1',
      name: 'Emergency Gate 1',
      a: { x: 422, y: 70 },
      b: { x: 397, y: 65 },
      isOpen: true,
    },
    {
      id: 'opening_gate_2',
      name: 'Emergency Gate 2',
      a: { x: 451, y: 137 },
      b: { x: 408, y: 113 },
      isOpen: false,
    },
  ],
  zones: [
    {
      id: 'z1a_south_west',
      code: 'Zone 1A',
      name: 'South Broadway (West / Behind Barricade)',
      color: '#0284c7',
      bounds: { minX: 0, maxX: 275, minY: 580, maxY: 850 },
      description: 'South arrival lane west of central barricade (channeled chute)',
    },
    {
      id: 'z1b_south_east',
      code: 'Zone 1B',
      name: 'South Broadway (East / Main Lane)',
      color: '#0ea5e9',
      bounds: { minX: 275, maxX: 600, minY: 580, maxY: 850 },
      description: 'South arrival main thoroughfare east of central barricade',
    },
    {
      id: 'z2a_mid_west',
      code: 'Zone 2A',
      name: 'Central Broadway (West / Behind Barricade)',
      color: '#8b5cf6',
      bounds: { minX: 0, maxX: 275, minY: 300, maxY: 580 },
      description: 'Mid-avenue channelized lane west of central barrier',
    },
    {
      id: 'z2b_mid_east',
      code: 'Zone 2B',
      name: 'Central Broadway (East / Main Avenue)',
      color: '#a855f7',
      bounds: { minX: 275, maxX: 600, minY: 300, maxY: 580 },
      description: 'Mid-avenue main corridor approaching Temple Forecourt',
    },
    {
      id: 'z3_temple',
      code: 'Zone 3',
      name: 'Temple Square & Chariot Basin',
      color: '#f59e0b',
      bounds: { minX: 180, maxX: 500, minY: 120, maxY: 300 },
      description: 'Gopuram plaza, Courtyard gate, and Chariot (Rath) focal point',
    },
    {
      id: 'z4_north',
      code: 'Zone 4',
      name: 'North Exit & Gate Concourse',
      color: '#10b981',
      bounds: { minX: 220, maxX: 580, minY: 0, maxY: 120 },
      description: 'Northern exit concourse and Emergency Gates 1 & 2',
    },
    {
      id: 'z5_west',
      code: 'Zone 5',
      name: 'North-West Feeder & West Exit',
      color: '#ec4899',
      bounds: { minX: 0, maxX: 220, minY: 0, maxY: 300 },
      description: 'North-West entry spawn and West evacuation gate',
    },
    {
      id: 'z6_east',
      code: 'Zone 6',
      name: 'East Flank Relief Corridor',
      color: '#6366f1',
      bounds: { minX: 500, maxX: 800, minY: 0, maxY: 580 },
      description: 'Eastern perimeter bypass and relief channel',
    },
  ],
}

// ─── Colour constants for drawing ────────────────────────────────────────────
const DRAW_COLORS = {
  wall: '#6366f1',   // indigo
  wallFill: 'rgba(99,102,241,0.18)',
  barricade: '#eab308',   // warning yellow
  exit: '#10b981',   // emerald
  spawn: '#f59e0b',   // amber
  opening: '#ef4444',   // red
  scale: '#e879f9',   // fuchsia
  agent: '#38bdf8',   // sky (normal)
  agentPanic: '#f87171',   // red (panic)
  grid: 'rgba(100,116,139,0.18)',
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function ptDist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function segMidpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function distToSegment(p, v, w) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2
  if (l2 === 0) return ptDist(p, v)
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
  t = Math.max(0, Math.min(1, t))
  return ptDist(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) })
}

function findHit(pos, lay, selectedItem, focusPoint) {
  if (!lay) return null

  // 1. If a wall is currently selected, check its vertex handles first (priority for vertex editing)
  if (selectedItem?.type === 'wall') {
    const selWall = lay.walls?.find(w => w.id === selectedItem.id)
    if (selWall && selWall.points) {
      for (let i = 0; i < selWall.points.length; i++) {
        if (ptDist(pos, selWall.points[i]) <= 14) {
          return { type: 'wall', id: selWall.id, vertexIndex: i, name: selWall.label || 'Wall' }
        }
      }
    }
  }

  // 2. Emergency Openings / Gates (endpoints first <= 14px, then line segment <= 12px)
  for (const op of lay.openings || []) {
    if (ptDist(pos, op.a) <= 14) {
      return { type: 'opening', id: op.id, endpoint: 'a', name: op.name || op.id, isOpen: op.isOpen }
    }
    if (ptDist(pos, op.b) <= 14) {
      return { type: 'opening', id: op.id, endpoint: 'b', name: op.name || op.id, isOpen: op.isOpen }
    }
    if (distToSegment(pos, op.a, op.b) <= 12) {
      return { type: 'opening', id: op.id, name: op.name || op.id, isOpen: op.isOpen }
    }
  }

  // 3. Barricades (endpoints first <= 14px, then line segment <= 12px)
  for (const bar of lay.barricades || []) {
    if (ptDist(pos, bar.a) <= 14) {
      return { type: 'barricade', id: bar.id, endpoint: 'a', name: bar.name || bar.id }
    }
    if (ptDist(pos, bar.b) <= 14) {
      return { type: 'barricade', id: bar.id, endpoint: 'b', name: bar.name || bar.id }
    }
    if (distToSegment(pos, bar.a, bar.b) <= 12) {
      return { type: 'barricade', id: bar.id, name: bar.name || bar.id }
    }
  }

  // 4. Spawn points (radius 14px)
  for (const sp of lay.spawns || []) {
    if (ptDist(pos, sp) <= 14) {
      return { type: 'spawn', id: sp.id, name: sp.name || sp.id }
    }
  }

  // 5. Exits (endpoints first <= 14px, then line segment <= 10px)
  for (const ex of lay.exits || []) {
    if (ptDist(pos, ex.a) <= 14) {
      return { type: 'exit', id: ex.id, endpoint: 'a', name: ex.name || ex.id }
    }
    if (ptDist(pos, ex.b) <= 14) {
      return { type: 'exit', id: ex.id, endpoint: 'b', name: ex.name || ex.id }
    }
    if (distToSegment(pos, ex.a, ex.b) <= 10) {
      return { type: 'exit', id: ex.id, name: ex.name || ex.id }
    }
  }

  // 6. Focus Point
  if (focusPoint && ptDist(pos, focusPoint) <= 16) {
    return { type: 'focus', name: 'Focus Point' }
  }

  // 7. Wall vertex points of all walls (radius 10px)
  for (const w of lay.walls || []) {
    for (let i = 0; i < w.points.length; i++) {
      if (ptDist(pos, w.points[i]) <= 10) {
        return { type: 'wall', id: w.id, vertexIndex: i, name: w.label || 'Wall' }
      }
    }
  }

  // 8. Wall segments (distToSegment <= 10px)
  for (const w of lay.walls || []) {
    if (!w.points || w.points.length < 2) continue
    for (let i = 0; i < w.points.length - 1; i++) {
      if (distToSegment(pos, w.points[i], w.points[i + 1]) <= 10) {
        return { type: 'wall', id: w.id, name: w.label || 'Wall' }
      }
    }
    if (w.closed && w.points.length > 2) {
      if (distToSegment(pos, w.points[w.points.length - 1], w.points[0]) <= 10) {
        return { type: 'wall', id: w.id, name: w.label || 'Wall' }
      }
    }
  }

  return null
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlannerPage({ backendUrl = '' }) {
  // ── Venue ────────────────────────────────────────────────────────────────
  const [layout, setLayout] = useState(null)    // loaded venue layout
  const [savedVenues, setSavedVenues] = useState([])
  const [venueName, setVenueName] = useState('Untitled Venue')
  const [venueId, setVenueId] = useState(null)
  const [saveStatus, setSaveStatus] = useState('')      // '', 'saving', 'saved', 'error'
  const [isEditorOpen, setIsEditorOpen] = useState(false) // tap-to-open drawer

  // ── View Mode (2D Layout Editor vs 2.5D Isometric Venue Map) ───────────
  const [viewMode, setViewMode] = useState('2D')  // '2D' | '2.5D'

  // ── Planner top-level view ──────────────────────────────────────────────
  const [plannerView, setPlannerView] = useState('sim')  // 'sim' | 'report'

  // ── Drawing & Selection ──────────────────────────────────────────────────
  const [drawTool, setDrawTool] = useState(TOOLS.SELECT)
  const [selectedItem, setSelectedItem] = useState(null)  // { type: 'wall'|'barricade'|'spawn'|'exit'|'opening'|'focus', id, vertexIndex?, endpoint?, name?, isOpen? }
  const [dragState, setDragState] = useState(null)  // active drag operation
  const [hoveredHit, setHoveredHit] = useState(null)  // hit element under mouse
  const [currentPoly, setCurrentPoly] = useState([])    // in-progress wall polygon
  const [barricadeLine, setBarricadeLine] = useState(null) // first click of BARRICADE tool
  const [exitLine, setExitLine] = useState(null)  // first click of EXIT tool
  const [openingLine, setOpeningLine] = useState(null)  // first click of OPENING tool
  const [scalePoints, setScalePoints] = useState([])
  const [scaleDistance, setScaleDistance] = useState('')
  const [showScaleDialog, setShowScaleDialog] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)

  // ── Simulation state ─────────────────────────────────────────────────────
  const [simMode, setSimMode] = useState('edit')   // 'edit'|'running'|'paused'
  const [isEmergency, setIsEmergency] = useState(false)
  const [agentCount, setAgentCount] = useState(0)
  const [simTimeSec, setSimTimeSec] = useState(0)
  const [maxDensity, setMaxDensity] = useState(0)
  const [fps, setFps] = useState(0)

  // ── Focus mode state ─────────────────────────────────────────────────────
  const [focusPoint, setFocusPoint] = useState({ x: 355, y: 195 })
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [focusCondition, setFocusCondition] = useState('normal') // 'normal' | 'rushed'

  // ── Sim params ───────────────────────────────────────────────────────────
  const [spawnRate, setSpawnRate] = useState(5)
  const [maxAgents, setMaxAgents] = useState(800)
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.45)
  const [showGrid, setShowGrid] = useState(false)
  const [activeSpawnIds, setActiveSpawnIds] = useState(new Set(['spawn_north', 'spawn_south']))

  // ── Refs (mutable access inside rAF loop) ────────────────────────────────
  const canvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const agentsRef = useRef([])
  const lastTsRef = useRef(null)
  const simTimeRef = useRef(0)
  const spawnAccumRef = useRef({})
  const layoutRef = useRef(null)
  const simModeRef = useRef('edit')
  const isEmergencyRef = useRef(false)
  const focusPointRef = useRef({ x: 355, y: 195 })
  const isFocusModeRef = useRef(false)
  const focusConditionRef = useRef('normal')
  const spawnRateRef = useRef(5)
  const maxAgentsRef = useRef(800)
  const heatmapOpacityRef = useRef(0.45)
  const showGridRef = useRef(false)
  const activeSpawnIdsRef = useRef(new Set(['spawn_north', 'spawn_south']))
  const fpsCounterRef = useRef({ frames: 0, lastTs: 0 })

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

  // ── Deletion Actions ──────────────────────────────────────────────────────
  const deleteSelectedItem = useCallback(() => {
    if (!selectedItem) return

    if (selectedItem.type === 'wall') {
      setLayout(prev => {
        if (!prev) return prev
        return {
          ...prev,
          walls: (prev.walls || []).filter(w => w.id !== selectedItem.id),
        }
      })
      setSelectedItem(null)
    } else if (selectedItem.type === 'barricade') {
      setLayout(prev => {
        if (!prev) return prev
        return {
          ...prev,
          barricades: (prev.barricades || []).filter(b => b.id !== selectedItem.id),
        }
      })
      setSelectedItem(null)
    } else if (selectedItem.type === 'opening') {
      setLayout(prev => {
        if (!prev) return prev
        return {
          ...prev,
          openings: (prev.openings || []).filter(o => o.id !== selectedItem.id),
        }
      })
      setSelectedItem(null)
    } else if (selectedItem.type === 'spawn') {
      setLayout(prev => {
        if (!prev) return prev
        return {
          ...prev,
          spawns: (prev.spawns || []).filter(s => s.id !== selectedItem.id),
        }
      })
      setActiveSpawnIds(prev => {
        const next = new Set(prev)
        next.delete(selectedItem.id)
        return next
      })
      setSelectedItem(null)
    } else if (selectedItem.type === 'exit') {
      setLayout(prev => {
        if (!prev) return prev
        return {
          ...prev,
          exits: (prev.exits || []).filter(e => e.id !== selectedItem.id),
        }
      })
      setSelectedItem(null)
    }
  }, [selectedItem])

  const deleteSelectedVertex = useCallback(() => {
    if (selectedItem?.type === 'wall' && selectedItem.vertexIndex !== undefined) {
      setLayout(prev => {
        if (!prev) return prev
        return {
          ...prev,
          walls: (prev.walls || []).map(w => {
            if (w.id !== selectedItem.id) return w
            if (w.points.length <= 2) return null
            const newPoints = w.points.filter((_, idx) => idx !== selectedItem.vertexIndex)
            return { ...w, points: newPoints }
          }).filter(Boolean),
        }
      })
      setSelectedItem(prev => ({ ...prev, vertexIndex: undefined }))
    }
  }, [selectedItem])

  // ── Emergency Openings Toggle Actions ──────────────────────────────────────
  const toggleOpening = useCallback((id, forceState) => {
    setLayout(prev => {
      if (!prev) return prev
      const updated = (prev.openings || []).map(op => {
        if (op.id !== id) return op
        const newOpen = typeof forceState === 'boolean' ? forceState : !op.isOpen
        return { ...op, isOpen: newOpen }
      })
      return { ...prev, openings: updated }
    })
    setSelectedItem(prev => (prev && prev.id === id ? { ...prev, isOpen: typeof forceState === 'boolean' ? forceState : !prev.isOpen } : prev))
  }, [])

  const openAllOpenings = useCallback(() => {
    setLayout(prev => {
      if (!prev) return prev
      return {
        ...prev,
        openings: (prev.openings || []).map(op => ({ ...op, isOpen: true })),
      }
    })
  }, [])

  const closeAllOpenings = useCallback(() => {
    setLayout(prev => {
      if (!prev) return prev
      return {
        ...prev,
        openings: (prev.openings || []).map(op => ({ ...op, isOpen: false })),
      }
    })
  }, [])

  // ── Keyboard shortcuts (Delete / Backspace / Escape) ──────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (selectedItem) {
          e.preventDefault()
          deleteSelectedItem()
        }
      } else if (e.key === 'Escape') {
        setSelectedItem(null)
        setCurrentPoly([])
        setBarricadeLine(null)
        setExitLine(null)
        setOpeningLine(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedItem, deleteSelectedItem])

  // ── Auto-restore / initial load on mount ──────────────────────────────────
  useEffect(() => {
    fetchSavedVenues()

    // 1. Check for active working draft in localStorage
    try {
      const savedDraft = localStorage.getItem('planner_active_draft')
      if (savedDraft) {
        const { layout: dLayout, venueName: dName, venueId: dId } = JSON.parse(savedDraft)
        const isOldFragmentedDraft = dLayout?.walls?.some(
          w => (w.id && String(w.id).startsWith('wall_')) || w.id === 'w_sw_buildings' || w.id === 'w_nw_buildings' || w.id === 'w_ce_buildings'
        )
        if (dLayout && dLayout.walls && !isOldFragmentedDraft && dLayout.walls.length <= 12) {
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
    try {
      localStorage.setItem(
        'planner_active_draft',
        JSON.stringify({ layout: DEMO_VENUE, venueName: DEMO_VENUE.name, venueId: DEMO_VENUE.id })
      )
    } catch { /* ignore */ }
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

    const pxM = lay.scale?.px_per_meter || 13.363

    // ── Grid lines ────────────────────────────────────────────────────────
    if (showGridRef.current) {
      ctx.strokeStyle = DRAW_COLORS.grid
      ctx.lineWidth = 0.5
      const cellPx = 25 // 25 px per 3.5 sq.m cell
      for (let x = 0; x < CANVAS_W; x += cellPx) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke()
      }
      for (let y = 0; y < CANVAS_H; y += cellPx) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke()
      }
    }

    // ── Density heatmap ───────────────────────────────────────────────────
    if (agentsRef.current.length > 0 && heatmapOpacityRef.current > 0.01) {
      const grid = buildGrid(CANVAS_W, CANVAS_H, pxM)
      const density = computeDensity(agentsRef.current, grid, pxM)
      renderHeatmap(ctx, density, grid, heatmapOpacityRef.current)
    }

    // ── Walls ─────────────────────────────────────────────────────────────
    for (const wall of lay.walls) {
      if (!wall.points || wall.points.length < 2) continue

      const isWallSelected = selectedItem?.type === 'wall' && selectedItem.id === wall.id
      const isWallHovered = hoveredHit?.type === 'wall' && hoveredHit.id === wall.id

      ctx.lineWidth = isWallSelected ? 4 : isWallHovered ? 3.5 : 3
      ctx.strokeStyle = isWallSelected ? '#38bdf8' : isWallHovered ? '#818cf8' : DRAW_COLORS.wall
      ctx.fillStyle = DRAW_COLORS.wallFill

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

      // Vertex control handles if wall is selected
      if (isWallSelected) {
        for (let i = 0; i < wall.points.length; i++) {
          const pt = wall.points[i]
          const isVertexSelected = selectedItem.vertexIndex === i
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, isVertexSelected ? 6.5 : 5, 0, Math.PI * 2)
          ctx.fillStyle = isVertexSelected ? '#f59e0b' : '#ffffff'
          ctx.fill()
          ctx.strokeStyle = isVertexSelected ? '#ffffff' : '#38bdf8'
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      // Label for named obstacles
      if (wall.label && wall.closed && wall.points.length > 2) {
        const cx = wall.points.reduce((s, p) => s + p.x, 0) / wall.points.length
        const cy = wall.points.reduce((s, p) => s + p.y, 0) / wall.points.length
        ctx.fillStyle = isWallSelected ? '#38bdf8' : 'rgba(165,180,252,0.9)'
        ctx.font = 'bold 9px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(wall.label.toUpperCase(), cx, cy + 3)
        ctx.textAlign = 'left'
      }
    }

    // ── Emergency Openings / Dynamic Gates ────────────────────────────────
    for (const op of lay.openings || []) {
      const isOpSelected = selectedItem?.type === 'opening' && selectedItem.id === op.id
      const isOpHovered = hoveredHit?.type === 'opening' && hoveredHit.id === op.id
      const mid = segMidpoint(op.a, op.b)

      if (!op.isOpen) {
        // ── CLOSED: Solid barrier wall with red/amber hazard pattern ───────
        ctx.save()
        if (isOpSelected || isOpHovered) {
          ctx.strokeStyle = isOpSelected ? '#38bdf8' : '#f87171'
          ctx.lineWidth = isOpSelected ? 8 : 6
          ctx.beginPath(); ctx.moveTo(op.a.x, op.a.y); ctx.lineTo(op.b.x, op.b.y); ctx.stroke()
        }

        // Main barrier line
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 4
        ctx.beginPath(); ctx.moveTo(op.a.x, op.a.y); ctx.lineTo(op.b.x, op.b.y); ctx.stroke()

        // Hazard stripes
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 2.5
        ctx.setLineDash([6, 6])
        ctx.beginPath(); ctx.moveTo(op.a.x, op.a.y); ctx.lineTo(op.b.x, op.b.y); ctx.stroke()
        ctx.setLineDash([])

        // Posts at ends
        ctx.fillStyle = '#ef4444'
        ctx.beginPath(); ctx.arc(op.a.x, op.a.y, 5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(op.b.x, op.b.y, 5, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(op.a.x, op.a.y, 5, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.arc(op.b.x, op.b.y, 5, 0, Math.PI * 2); ctx.stroke()

        // Label (Clean floating text without background box)
        const labelText = `🔒 ${op.name || 'GATE'} (CLOSED)`
        ctx.font = 'bold 8.5px ui-monospace, monospace'
        ctx.fillStyle = isOpSelected ? '#38bdf8' : '#f87171'
        ctx.textAlign = 'center'
        ctx.fillText(labelText, mid.x, mid.y - 8)
        ctx.textAlign = 'left'
        ctx.restore()
      } else {
        // ── OPEN: Active egress exit route with emerald green glow ──────────
        ctx.save()
        if (isOpSelected || isOpHovered) {
          ctx.strokeStyle = isOpSelected ? '#38bdf8' : '#86efac'
          ctx.lineWidth = isOpSelected ? 8 : 6
          ctx.beginPath(); ctx.moveTo(op.a.x, op.a.y); ctx.lineTo(op.b.x, op.b.y); ctx.stroke()
        }

        // Open dashed green line
        ctx.strokeStyle = '#22c55e'
        ctx.lineWidth = 4
        ctx.setLineDash([5, 4])
        ctx.beginPath(); ctx.moveTo(op.a.x, op.a.y); ctx.lineTo(op.b.x, op.b.y); ctx.stroke()
        ctx.setLineDash([])

        // Posts at ends
        ctx.fillStyle = '#22c55e'
        ctx.beginPath(); ctx.arc(op.a.x, op.a.y, 5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(op.b.x, op.b.y, 5, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(op.a.x, op.a.y, 5, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.arc(op.b.x, op.b.y, 5, 0, Math.PI * 2); ctx.stroke()

        // Label (Clean floating text without background box)
        const labelText = `🔓 ${op.name || 'GATE'} (OPEN)`
        ctx.font = 'bold 8.5px ui-monospace, monospace'
        ctx.fillStyle = isOpSelected ? '#38bdf8' : '#4ade80'
        ctx.textAlign = 'center'
        ctx.fillText(labelText, mid.x, mid.y - 8)
        ctx.textAlign = 'left'
        ctx.restore()
      }

      // Endpoints handles when selected
      if (isOpSelected) {
        ctx.fillStyle = selectedItem.endpoint === 'a' ? '#f59e0b' : '#38bdf8'
        ctx.beginPath(); ctx.arc(op.a.x, op.a.y, 6.5, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()

        ctx.fillStyle = selectedItem.endpoint === 'b' ? '#f59e0b' : '#38bdf8'
        ctx.beginPath(); ctx.arc(op.b.x, op.b.y, 6.5, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
      }
    }

    // ── Barricades (Crowd Control / Police Barriers) ──────────────────────
    for (const bar of lay.barricades || []) {
      const isBarSelected = selectedItem?.type === 'barricade' && selectedItem.id === bar.id
      const isBarHovered = hoveredHit?.type === 'barricade' && hoveredHit.id === bar.id
      const mid = segMidpoint(bar.a, bar.b)

      ctx.save()
      // Selection / Hover highlight glow
      if (isBarSelected || isBarHovered) {
        ctx.strokeStyle = isBarSelected ? '#38bdf8' : '#fde047'
        ctx.lineWidth = isBarSelected ? 8 : 6
        ctx.beginPath(); ctx.moveTo(bar.a.x, bar.a.y); ctx.lineTo(bar.b.x, bar.b.y); ctx.stroke()
      }

      // Main heavy barricade rail (amber steel)
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(bar.a.x, bar.a.y); ctx.lineTo(bar.b.x, bar.b.y); ctx.stroke()

      // High-visibility black/dark caution hazard stripes on barricade rail
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 3
      ctx.setLineDash([5, 5])
      ctx.beginPath(); ctx.moveTo(bar.a.x, bar.a.y); ctx.lineTo(bar.b.x, bar.b.y); ctx.stroke()
      ctx.setLineDash([])

      // Stanchion end posts / heavy steel feet
      const drawPost = (pt) => {
        ctx.fillStyle = '#f59e0b'
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2); ctx.stroke()
      }
      drawPost(bar.a)
      drawPost(bar.b)

      // Label (Clean floating text without background box)
      const labelText = `🚧 ${bar.name || 'BARRICADE'}`
      ctx.font = 'bold 8.5px ui-monospace, monospace'
      ctx.fillStyle = isBarSelected ? '#38bdf8' : '#fbbf24'
      ctx.textAlign = 'center'
      ctx.fillText(labelText, mid.x, mid.y - 8)
      ctx.textAlign = 'left'
      ctx.restore()

      // Endpoint drag handles when selected
      if (isBarSelected) {
        ctx.fillStyle = selectedItem.endpoint === 'a' ? '#f59e0b' : '#38bdf8'
        ctx.beginPath(); ctx.arc(bar.a.x, bar.a.y, 6.5, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()

        ctx.fillStyle = selectedItem.endpoint === 'b' ? '#f59e0b' : '#38bdf8'
        ctx.beginPath(); ctx.arc(bar.b.x, bar.b.y, 6.5, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
      }
    }

    // ── Exits ─────────────────────────────────────────────────────────────
    for (const exit of lay.exits) {
      const isExitSelected = selectedItem?.type === 'exit' && selectedItem.id === exit.id
      const isExitHovered = hoveredHit?.type === 'exit' && hoveredHit.id === exit.id

      // Line
      ctx.lineWidth = isExitSelected ? 5 : isExitHovered ? 4.5 : 4
      ctx.strokeStyle = isExitSelected ? '#38bdf8' : DRAW_COLORS.exit
      ctx.setLineDash([8, 4])
      ctx.beginPath()
      ctx.moveTo(exit.a.x, exit.a.y)
      ctx.lineTo(exit.b.x, exit.b.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Endpoints handles when selected
      if (isExitSelected) {
        ctx.fillStyle = selectedItem.endpoint === 'a' ? '#f59e0b' : '#38bdf8'
        ctx.beginPath(); ctx.arc(exit.a.x, exit.a.y, 6, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()

        ctx.fillStyle = selectedItem.endpoint === 'b' ? '#f59e0b' : '#38bdf8'
        ctx.beginPath(); ctx.arc(exit.b.x, exit.b.y, 6, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
      }

      // Label
      const mid = segMidpoint(exit.a, exit.b)
      ctx.fillStyle = isExitSelected ? '#38bdf8' : DRAW_COLORS.exit
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`🚪 ${exit.name || exit.id}`, mid.x, mid.y - 6)
      ctx.textAlign = 'left'
    }

    // ── Spawn points ──────────────────────────────────────────────────────
    for (const sp of lay.spawns) {
      const isActive = activeSpawnIdsRef.current.has(sp.id)
      const isSpawnSelected = selectedItem?.type === 'spawn' && selectedItem.id === sp.id
      const isSpawnHovered = hoveredHit?.type === 'spawn' && hoveredHit.id === sp.id

      // Selection / Hover halo ring
      if (isSpawnSelected || isSpawnHovered) {
        ctx.strokeStyle = isSpawnSelected ? '#38bdf8' : '#f59e0b'
        ctx.lineWidth = 2.5
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.fillStyle = isActive ? DRAW_COLORS.spawn : 'rgba(100,116,139,0.5)'
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = isSpawnSelected ? '#38bdf8' : '#fff'
      ctx.lineWidth = isSpawnSelected ? 2.5 : 1.5
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('S', sp.x, sp.y + 3)
      ctx.textAlign = 'left'

      // Name
      ctx.fillStyle = isSpawnSelected ? '#38bdf8' : DRAW_COLORS.spawn
      ctx.font = '9px ui-monospace, monospace'
      ctx.fillText(sp.name || sp.id, sp.x + 12, sp.y + 3)
    }

    // ── Focus Point Target & Radar Rings ──────────────────────────────────
    if (focusPoint) {
      const fx = focusPoint.x
      const fy = focusPoint.y
      const isFocusSelected = selectedItem?.type === 'focus'
      const isActive = isFocusModeRef.current
      const isRushed = isActive && focusConditionRef.current === 'rushed'
      const themeColor = isFocusSelected
        ? '#38bdf8'
        : isActive
          ? (isRushed ? '#ef4444' : '#a855f7')
          : '#94a3b8'

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
      ctx.lineWidth = isFocusSelected ? 3 : 2
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
      const labelText = isFocusSelected
        ? '🎯 FOCUS (SELECTED / DRAGGABLE)'
        : isActive
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

    if (drawTool === TOOLS.BARRICADE && barricadeLine) {
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 4
      ctx.setLineDash([6, 3])
      ctx.beginPath(); ctx.moveTo(barricadeLine.x, barricadeLine.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#f59e0b'
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.fillText('CLICK TO COMPLETE BARRICADE', mousePos.x + 10, mousePos.y)
    }

    if (drawTool === TOOLS.EXIT && exitLine) {
      ctx.strokeStyle = DRAW_COLORS.exit
      ctx.lineWidth = 3
      ctx.setLineDash([6, 3])
      ctx.beginPath(); ctx.moveTo(exitLine.x, exitLine.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke()
      ctx.setLineDash([])
    }

    if (drawTool === TOOLS.OPENING && openingLine) {
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 3.5
      ctx.setLineDash([6, 3])
      ctx.beginPath(); ctx.moveTo(openingLine.x, openingLine.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#ef4444'
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.fillText('CLICK TO COMPLETE EMERGENCY GATE', mousePos.x + 10, mousePos.y)
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
  }, [currentPoly, barricadeLine, exitLine, openingLine, scalePoints, mousePos, hovered, drawTool, focusPoint, selectedItem, hoveredHit])

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

      const pxM = lay.scale?.px_per_meter || 13.363
      const wallSegs = extractWallSegments(lay.walls, pxM)
      const exits_m = convertExitsToMeters(lay.exits, pxM)
      const spawns_m = convertSpawnsToMeters(lay.spawns, pxM)

      // ── Incorporate Barricades (act as solid obstacle walls in SFM physics) ──
      for (const bar of lay.barricades || []) {
        wallSegs.push([
          { x: bar.a.x / pxM, y: bar.a.y / pxM },
          { x: bar.b.x / pxM, y: bar.b.y / pxM },
        ])
      }

      // ── Incorporate dynamic Emergency Openings into physics ──────────────
      // Closed: solid barrier obstacle wall segment (no one can pass)
      // Open: passageway is clear (agents can cross through freely toward their destination without despawning)
      for (const op of lay.openings || []) {
        if (!op.isOpen) {
          wallSegs.push([
            { x: op.a.x / pxM, y: op.a.y / pxM },
            { x: op.b.x / pxM, y: op.b.y / pxM },
          ])
        }
      }

      // ── Extract building closed polygons in meters ────────────────────
      const buildingPolys_m = extractBuildingPolygons(lay.walls, pxM)

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
            agentsRef.current.push(spawnAgent(sp_m, goalExit, DEFAULT_SFM_PARAMS, null, buildingPolys_m, wallSegs))
          }
        }
      }

      // ── Step SFM ──────────────────────────────────────────────────────
      const minX_m = 0
      const maxX_m = (lay.canvasWidth || CANVAS_W) / pxM
      const minY_m = 0
      const maxY_m = (lay.canvasHeight || CANVAS_H) / pxM
      const boundary_m = { minX: minX_m, maxX: maxX_m, minY: minY_m, maxY: maxY_m }

      if (simModeRef.current === 'running' && agentsRef.current.length > 0) {
        sfmStep(agentsRef.current, wallSegs, exits_m, dt, DEFAULT_SFM_PARAMS, boundary_m, buildingPolys_m)
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
            const grid = buildGrid(CANVAS_W, CANVAS_H, pxM)
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
      y: Math.round((e.clientY - rect.top) * scaleY),
    }
  }

  const handleCanvasMouseDown = (e) => {
    const pos = getCanvasPos(e)
    if (simMode !== 'edit') return

    if (drawTool === TOOLS.SELECT) {
      const hit = findHit(pos, layout, selectedItem, focusPoint)
      if (hit) {
        setSelectedItem(hit)
        if (hit.type === 'wall') {
          const w = layout?.walls?.find(x => x.id === hit.id)
          if (w) {
            setDragState({
              type: 'wall',
              id: hit.id,
              vertexIndex: hit.vertexIndex,
              origPoints: w.points.map(p => ({ ...p })),
              startPos: pos,
            })
          }
        } else if (hit.type === 'barricade') {
          const bar = layout?.barricades?.find(x => x.id === hit.id)
          if (bar) {
            setDragState({
              type: 'barricade',
              id: hit.id,
              endpoint: hit.endpoint,
              origA: { ...bar.a },
              origB: { ...bar.b },
              startPos: pos,
            })
          }
        } else if (hit.type === 'opening') {
          const op = layout?.openings?.find(x => x.id === hit.id)
          if (op) {
            setDragState({
              type: 'opening',
              id: hit.id,
              endpoint: hit.endpoint,
              origA: { ...op.a },
              origB: { ...op.b },
              startPos: pos,
            })
          }
        } else if (hit.type === 'spawn') {
          const s = layout?.spawns?.find(x => x.id === hit.id)
          if (s) {
            setDragState({
              type: 'spawn',
              id: hit.id,
              origX: s.x,
              origY: s.y,
              startPos: pos,
            })
          }
        } else if (hit.type === 'exit') {
          const ex = layout?.exits?.find(x => x.id === hit.id)
          if (ex) {
            setDragState({
              type: 'exit',
              id: hit.id,
              endpoint: hit.endpoint,
              origA: { ...ex.a },
              origB: { ...ex.b },
              startPos: pos,
            })
          }
        } else if (hit.type === 'focus') {
          setDragState({
            type: 'focus',
            origX: focusPoint.x,
            origY: focusPoint.y,
            startPos: pos,
          })
        }
      } else {
        setSelectedItem(null)
        setDragState(null)
      }
    }
  }

  const handleCanvasMouseMove = (e) => {
    const pos = getCanvasPos(e)
    setMousePos(pos)

    if (dragState) {
      const dx = pos.x - dragState.startPos.x
      const dy = pos.y - dragState.startPos.y

      if (dragState.type === 'wall') {
        if (dragState.vertexIndex !== undefined) {
          const vIdx = dragState.vertexIndex
          const newPoints = dragState.origPoints.map((p, idx) =>
            idx === vIdx
              ? {
                x: Math.max(0, Math.min(CANVAS_W, Math.round(p.x + dx))),
                y: Math.max(0, Math.min(CANVAS_H, Math.round(p.y + dy))),
              }
              : p
          )
          setLayout(prev => prev ? ({
            ...prev,
            walls: (prev.walls || []).map(w => w.id === dragState.id ? { ...w, points: newPoints } : w)
          }) : prev)
        } else {
          const newPoints = dragState.origPoints.map(p => ({
            x: Math.max(0, Math.min(CANVAS_W, Math.round(p.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(p.y + dy))),
          }))
          setLayout(prev => prev ? ({
            ...prev,
            walls: (prev.walls || []).map(w => w.id === dragState.id ? { ...w, points: newPoints } : w)
          }) : prev)
        }
      } else if (dragState.type === 'barricade') {
        if (dragState.endpoint === 'a') {
          const na = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origA.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origA.y + dy))),
          }
          setLayout(prev => prev ? ({
            ...prev,
            barricades: (prev.barricades || []).map(b => b.id === dragState.id ? { ...b, a: na } : b)
          }) : prev)
        } else if (dragState.endpoint === 'b') {
          const nb = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origB.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origB.y + dy))),
          }
          setLayout(prev => prev ? ({
            ...prev,
            barricades: (prev.barricades || []).map(b => b.id === dragState.id ? { ...b, b: nb } : b)
          }) : prev)
        } else {
          const na = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origA.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origA.y + dy))),
          }
          const nb = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origB.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origB.y + dy))),
          }
          setLayout(prev => prev ? ({
            ...prev,
            barricades: (prev.barricades || []).map(b => b.id === dragState.id ? { ...b, a: na, b: nb } : b)
          }) : prev)
        }
      } else if (dragState.type === 'opening') {
        if (dragState.endpoint === 'a') {
          const na = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origA.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origA.y + dy))),
          }
          setLayout(prev => prev ? ({
            ...prev,
            openings: (prev.openings || []).map(o => o.id === dragState.id ? { ...o, a: na } : o)
          }) : prev)
        } else if (dragState.endpoint === 'b') {
          const nb = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origB.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origB.y + dy))),
          }
          setLayout(prev => prev ? ({
            ...prev,
            openings: (prev.openings || []).map(o => o.id === dragState.id ? { ...o, b: nb } : o)
          }) : prev)
        } else {
          const na = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origA.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origA.y + dy))),
          }
          const nb = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origB.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origB.y + dy))),
          }
          setLayout(prev => prev ? ({
            ...prev,
            openings: (prev.openings || []).map(o => o.id === dragState.id ? { ...o, a: na, b: nb } : o)
          }) : prev)
        }
      } else if (dragState.type === 'spawn') {
        const nx = Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origX + dx)))
        const ny = Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origY + dy)))
        setLayout(prev => prev ? ({
          ...prev,
          spawns: (prev.spawns || []).map(s => s.id === dragState.id ? { ...s, x: nx, y: ny } : s)
        }) : prev)
      } else if (dragState.type === 'exit') {
        if (dragState.endpoint === 'a') {
          const na = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origA.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origA.y + dy))),
          }
          setLayout(prev => prev ? ({
            ...prev,
            exits: (prev.exits || []).map(ex => ex.id === dragState.id ? { ...ex, a: na } : ex)
          }) : prev)
        } else if (dragState.endpoint === 'b') {
          const nb = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origB.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origB.y + dy))),
          }
          setLayout(prev => prev ? ({
            ...prev,
            exits: (prev.exits || []).map(ex => ex.id === dragState.id ? { ...ex, b: nb } : ex)
          }) : prev)
        } else {
          const na = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origA.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origA.y + dy))),
          }
          const nb = {
            x: Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origB.x + dx))),
            y: Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origB.y + dy))),
          }
          setLayout(prev => prev ? ({
            ...prev,
            exits: (prev.exits || []).map(ex => ex.id === dragState.id ? { ...ex, a: na, b: nb } : ex)
          }) : prev)
        }
      } else if (dragState.type === 'focus') {
        const nfx = Math.max(0, Math.min(CANVAS_W, Math.round(dragState.origX + dx)))
        const nfy = Math.max(0, Math.min(CANVAS_H, Math.round(dragState.origY + dy)))
        setFocusPoint({ x: nfx, y: nfy })
        const pxM = layout?.scale?.px_per_meter || 13.363
        if (agentsRef.current.length > 0 && isFocusMode) {
          setFocusTarget(agentsRef.current, { x: nfx / pxM, y: nfy / pxM }, focusCondition)
        }
      }
    } else if (drawTool === TOOLS.SELECT && simMode === 'edit') {
      const hit = findHit(pos, layout, selectedItem, focusPoint)
      setHoveredHit(hit)
    }
  }

  const handleCanvasMouseUp = () => {
    setDragState(null)
  }

  const handleCanvasClick = (e) => {
    const pos = getCanvasPos(e)

    if (drawTool === TOOLS.FOCUS) {
      setFocusPoint(pos)
      setIsFocusMode(true)
      const pxM = layout?.scale?.px_per_meter || 13.363
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

    } else if (drawTool === TOOLS.BARRICADE) {
      if (!barricadeLine) {
        setBarricadeLine(pos)
      } else {
        const name = prompt('Barricade name:', `Barricade ${(layout?.barricades?.length || 0) + 1}`) || 'Barricade'
        const newBar = { id: `barricade_${Date.now()}`, name, a: barricadeLine, b: pos }
        setLayout(prev => ({ ...prev, barricades: [...(prev?.barricades || []), newBar] }))
        setBarricadeLine(null)
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

    } else if (drawTool === TOOLS.OPENING) {
      if (!openingLine) {
        setOpeningLine(pos)
      } else {
        const name = prompt('Emergency Opening / Gate name:', `Emergency Gate ${(layout?.openings?.length || 0) + 1}`) || 'Emergency Gate'
        const newOpening = { id: `opening_${Date.now()}`, name, a: openingLine, b: pos, isOpen: false }
        setLayout(prev => ({ ...prev, openings: [...(prev?.openings || []), newOpening] }))
        setOpeningLine(null)
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
    } else if (drawTool === TOOLS.SELECT) {
      // In select mode, check if clicking directly near the center badge of an emergency opening
      for (const op of layout?.openings || []) {
        const mid = segMidpoint(op.a, op.b)
        if (ptDist(pos, mid) <= 24) {
          toggleOpening(op.id)
          break
        }
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
      const pxM = lay.scale?.px_per_meter || 13.363
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

  const getCanvasCursor = () => {
    if (simMode !== 'edit') return 'default'
    if (drawTool !== TOOLS.SELECT) return 'crosshair'
    if (dragState) return 'grabbing'
    if (hoveredHit) {
      if (hoveredHit.vertexIndex !== undefined || hoveredHit.endpoint) return 'grab'
      return 'move'
    }
    return 'default'
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

  const export2DImage = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const dataUrl = canvas.toDataURL('image/png', 1.0)
      const link = document.createElement('a')
      const cleanName = (venueName || 'venue-2d-layout').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      link.download = `${cleanName || 'venue'}-2d-map-${timestamp}.png`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Failed to export 2D canvas image:', err)
    }
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
      walls: [], exits: [], spawns: [], openings: [], barricades: [],
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
    const pxM = lay.scale?.px_per_meter || 13.363
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
      ...(prev || { walls: [], exits: [], spawns: [], openings: [], barricades: [] }),
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
    if (!window.confirm('Clear all walls, barricades, exits, emergency openings, and spawn points?')) return
    setLayout(prev => prev ? { ...prev, walls: [], exits: [], spawns: [], openings: [], barricades: [] } : prev)
    setCurrentPoly([])
    setBarricadeLine(null)
    setExitLine(null)
    setOpeningLine(null)
    setSelectedItem(null)
    resetSimState()
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const toolDefs = [
    { id: TOOLS.SELECT, label: '↖ SELECT / MOVE', tip: 'Click/drag walls, points, barricades, exits, gates, spawns. Del key to remove' },
    { id: TOOLS.WALL, label: '⬛ WALL', tip: 'Click to place polygon points; double-click or click near start to finish' },
    { id: TOOLS.BARRICADE, label: '🚧 BARRICADE', tip: 'Click point A then point B to place a crowd control barrier / barricade' },
    { id: TOOLS.EXIT, label: '🚪 REGULAR EXIT', tip: 'Click point A then point B to draw a standard exit line' },
    { id: TOOLS.OPENING, label: '🚨 EMERGENCY GATE', tip: 'Click point A then point B to draw an emergency gate. Toggle open/closed' },
    { id: TOOLS.SPAWN, label: '📍 ENTRY / SPAWN', tip: 'Click to place an agent spawn / entry point' },
    { id: TOOLS.FOCUS, label: '🎯 FOCUS POINT', tip: 'Click canvas to set crowd attraction / focus point target' },
    { id: TOOLS.SCALE, label: '📏 SCALE', tip: 'Click two points then enter real-world distance to set px/m scale' },
  ]

  return (
    <div className="flex flex-col gap-3" style={{ minHeight: 0 }}>

      {/* ── Top Bar: Editor Drawer Toggle + View Mode Switcher ─────────────── */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border mx-4 mt-3 shadow-sm"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        {/* Left: Tap to open venue editor button */}
        <div className="flex items-center gap-2">
          <button
            id="planner-open-editor-btn"
            onClick={() => setIsEditorOpen(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition-all"
            title="Tap to open venue editor, tool selector, and layout manager"
          >
            <span>✏️</span>
            <span>VENUE EDITOR [TAP TO OPEN]</span>
            {drawTool !== TOOLS.SELECT && (
              <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-black/30 font-mono-num uppercase">
                Tool: {drawTool}
              </span>
            )}
          </button>
          <span className="text-xs font-mono-num hidden sm:inline" style={{ color: 'var(--color-muted)' }}>
            Venue: <strong className="text-sky-400">{layout?.name || venueName || 'Untitled Venue'}</strong>
          </span>
        </div>

        {/* Right: View mode switcher (2D Canvas vs 2.5D Isometric Map) */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 p-1 rounded-xl border shadow-sm"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
          >
            <button
              onClick={() => setViewMode('2D')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === '2D'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              style={viewMode !== '2D' ? { color: 'var(--color-muted)' } : {}}
            >
              <span>🗺️ 2D Interactive Canvas</span>
            </button>
            <button
              onClick={() => setViewMode('2.5D')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === '2.5D'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              style={viewMode !== '2.5D' ? { color: 'var(--color-muted)' } : {}}
            >
              <span>🏛️ 2.5D Isometric Map</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-500 dark:text-amber-300 font-extrabold uppercase">
                3D Extrusion
              </span>
            </button>
          </div>
          {viewMode === '2.5D' && (
            <span className="text-[10px] font-mono-num hidden md:inline" style={{ color: 'var(--color-muted)' }}>
              {layout?.walls?.length || 0} Structures Extruded
            </span>
          )}
        </div>
      </div>

      {/* ── Slide-Over Drawer: Venue Editor & Drawing Tools ───────────────── */}
      {isEditorOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsEditorOpen(false)}
        >
          <div
            className="w-80 max-w-[90vw] h-full p-4 overflow-y-auto border-r shadow-2xl flex flex-col gap-3"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--color-text)' }}>
                  🏗️ Venue Editor
                </h2>
                <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  Draw walls, exits, barricades &amp; emergency gates
                </p>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg border hover:bg-red-500/20 text-red-400 border-red-500/40 transition-all"
                title="Close Editor Drawer"
              >
                ✕ Close
              </button>
            </div>

            {/* Venue Selector Card */}
            <div
              className="rounded-xl p-3 border flex flex-col gap-2"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            >
              <p className="font-bold uppercase text-[10px] tracking-wider" style={{ color: 'var(--color-muted)' }}>Venue</p>
              <input
                value={venueName}
                onChange={e => setVenueName(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border w-full font-mono-num"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                placeholder="Venue name…"
              />
              <select
                id="planner-venue-select"
                className="text-xs px-2 py-1.5 rounded-lg border w-full font-mono-num"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
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
              <button
                onClick={export2DImage}
                disabled={!layout}
                className="w-full text-[10px] font-bold py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center justify-center gap-1.5"
                title="Download high-resolution 2D layout PNG image"
              >
                <span>📸</span>
                <span>Export 2D Layout PNG</span>
              </button>
            </div>

            {/* Selected element action card */}
            {selectedItem && (
              <div
                className="rounded-xl p-3 border flex flex-col gap-2 shadow-sm"
                style={{
                  borderColor: selectedItem.type === 'opening' ? 'rgba(239, 68, 68, 0.4)' : selectedItem.type === 'barricade' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.4)',
                  background: selectedItem.type === 'opening' ? 'rgba(239, 68, 68, 0.08)' : selectedItem.type === 'barricade' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(56, 189, 248, 0.08)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider ${selectedItem.type === 'opening'
                    ? 'text-red-400'
                    : selectedItem.type === 'barricade'
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-sky-500 dark:text-sky-400'
                    }`}>
                    Selected {selectedItem.type === 'opening' ? 'EMERGENCY GATE' : selectedItem.type === 'barricade' ? 'BARRICADE' : selectedItem.type.toUpperCase()}
                  </span>
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="text-[11px] text-slate-400 hover:text-white px-1"
                    title="Deselect"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-[11px] font-mono-num font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                  {selectedItem.name || selectedItem.id || selectedItem.type}
                  {selectedItem.vertexIndex !== undefined && (
                    <span className="text-amber-500 dark:text-amber-400 ml-1 font-bold">
                      (Point #{selectedItem.vertexIndex + 1})
                    </span>
                  )}
                </p>
                <p className="text-[9px] leading-tight" style={{ color: 'var(--color-muted)' }}>
                  Drag on canvas to move. Press <strong>Del / Backspace</strong> to delete.
                </p>

                {selectedItem.type === 'opening' && (
                  <div className="flex gap-1.5 mt-0.5">
                    <button
                      onClick={() => toggleOpening(selectedItem.id)}
                      className={`flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg text-white transition-all shadow-sm ${(layout?.openings?.find(o => o.id === selectedItem.id)?.isOpen)
                        ? 'bg-amber-600 hover:bg-amber-500'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                    >
                      {(layout?.openings?.find(o => o.id === selectedItem.id)?.isOpen) ? '🔒 Close Gate' : '🔓 Open Gate'}
                    </button>
                  </div>
                )}

                <div className="flex gap-1.5 mt-0.5">
                  <button
                    onClick={deleteSelectedItem}
                    className="flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-all shadow-sm"
                    title={`Delete this ${selectedItem.type}`}
                  >
                    🗑 Delete {selectedItem.type === 'wall' ? 'Wall' : selectedItem.type === 'barricade' ? 'Barricade' : selectedItem.type === 'spawn' ? 'Entry' : selectedItem.type === 'opening' ? 'Gate' : selectedItem.type === 'exit' ? 'Exit' : 'Item'}
                  </button>
                  {selectedItem.type === 'wall' && selectedItem.vertexIndex !== undefined && (
                    <button
                      onClick={deleteSelectedVertex}
                      className="text-[10px] font-bold py-1.5 px-2 rounded-lg border border-amber-500/50 hover:bg-amber-500/20 text-amber-500 dark:text-amber-300 transition-all"
                      title="Delete selected point only"
                    >
                      Del Pt
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Drawing Tools Selector Card */}
            <div
              className="rounded-xl p-3 border"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            >
              <p className="font-bold uppercase text-[10px] tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>
                Drawing Tool Selector
              </p>
              {toolDefs.map(t => (
                <button
                  key={t.id}
                  id={`planner-tool-${t.id.toLowerCase()}`}
                  title={t.tip}
                  onClick={() => {
                    setDrawTool(t.id)
                    setCurrentPoly([])
                    setBarricadeLine(null)
                    setExitLine(null)
                    setOpeningLine(null)
                    setScalePoints([])
                  }}
                  className={`w-full text-left text-[10px] font-bold px-2.5 py-2 rounded-lg mb-1 transition-all ${drawTool === t.id
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  style={drawTool !== t.id ? { color: 'var(--color-text)' } : {}}
                >
                  {t.label}
                </button>
              ))}

              <p className="text-[9px] mt-1.5 leading-tight" style={{ color: 'var(--color-muted)' }}>
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
        </div>
      )}

      {/* ── Main Upper Section: Map Canvas (3 parts) + Simulation Controls (2 parts) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 px-4" style={{ minHeight: 0 }}>

        {/* ── Map Canvas Viewer (3 parts width = 60%) ── */}
        <div className="flex flex-col gap-2 lg:col-span-3 min-w-0">
          {viewMode === '2.5D' ? (
            <Venue25DViewer
              layout={layout}
              focusPoint={focusPoint}
              isFocusMode={isFocusMode}
              width={CANVAS_W}
              height={CANVAS_H}
              onResetToDemo={resetToDemoVenue}
              agentsRef={agentsRef}
              simMode={simMode}
              isEmergency={isEmergency}
              agentCount={agentCount}
              simTimeSec={simTimeSec}
              maxDensityPpm2={maxDensity}
              fps={fps}
              onStart={handleStart}
              onPause={handlePause}
              onReset={handleReset}
              onTriggerEmergency={handleTriggerEmergency}
              onToggleEmergencyGate={toggleOpening}
              onOpenAllOpenings={openAllOpenings}
              onCloseAllOpenings={closeAllOpenings}
            />
          ) : (
            <>
              <div
                className="relative rounded-xl overflow-auto border shadow-2xl flex justify-center"
                style={{
                  borderColor: 'rgba(255, 255, 255, 0.08)',
                  background: '#000000',
                  maxHeight: '78vh',
                }}
              >
                <canvas
                  ref={canvasRef}
                  id="planner-canvas"
                  width={CANVAS_W}
                  height={CANVAS_H}
                  className="block"
                  style={{
                    cursor: getCanvasCursor(),
                    width: '100%',
                    maxWidth: `${CANVAS_W}px`,
                    aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
                    display: 'block',
                  }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseUp={handleCanvasMouseUp}
                  onClick={handleCanvasClick}
                  onDoubleClick={handleCanvasDoubleClick}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseEnter={() => setHovered(true)}
                  onMouseLeave={() => {
                    setHovered(false)
                    setHoveredHit(null)
                    setDragState(null)
                    setMousePos({ x: -999, y: -999 })
                  }}
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
                <span><span style={{ color: '#f59e0b' }}>■</span> Barricades</span>
                <span><span style={{ color: '#10b981' }}>- -</span> Exits</span>
                <span><span style={{ color: '#ef4444' }}>■</span> Emergency Gates (🔒 Closed / 🔓 Open)</span>
                <span><span style={{ color: '#f59e0b' }}>●</span> Spawn / Entry points</span>
                <span><span style={{ color: '#38bdf8' }}>●</span> Agents (normal)</span>
                <span><span style={{ color: '#f87171' }}>●</span> Agents (panic)</span>
                <span>Heatmap: Fruin LOS A→F bands</span>
              </div>
            </>
          )}
        </div>

        {/* ── Simulation Controls Panel (2 parts width = 40%) ───────────── */}
        <div
          className="w-full lg:col-span-2 min-w-0 rounded-xl border p-3.5 overflow-y-auto"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            maxHeight: '82vh',
          }}
        >
          <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-xs font-extrabold uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <span className="text-sm">🎛️</span> Simulation Command Center
            </h2>
            <span className="text-[10px] font-mono-num px-2 py-0.5 rounded border uppercase font-bold"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
              3 Map : 2 Sim Ratio
            </span>
          </div>
          <PlannerControls
            simMode={simMode}
            isEmergency={isEmergency}
            onStart={handleStart}
            onPause={handlePause}
            onReset={handleReset}
            onTriggerEmergency={handleTriggerEmergency}
            openings={layout?.openings || []}
            onToggleOpening={toggleOpening}
            onOpenAllOpenings={openAllOpenings}
            onCloseAllOpenings={closeAllOpenings}
            focusPoint={focusPoint}
            isFocusMode={isFocusMode}
            onToggleFocusMode={toggleFocusMode}
            focusCondition={focusCondition}
            onFocusConditionChange={handleFocusConditionChange}
            onSelectFocusTool={() => {
              setDrawTool(TOOLS.FOCUS)
              setCurrentPoly([])
              setBarricadeLine(null)
              setExitLine(null)
              setOpeningLine(null)
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

      {/* ── Lower Section: Venue Report & Handheld Safety Audit Dashboard ── */}
      <div className="px-4 pb-8 flex flex-col gap-3 mt-4">
        <div className="border-t pt-4 flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--color-text)' }}>
                On-Ground Venue Safety Audit &amp; Bottleneck Analysis
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                Field inspector terminal report · Fruin level thresholds · Automated NDMA mitigation playbooks
              </p>
            </div>
          </div>
        </div>

        {/* Embedded Venue Report Component directly below the map */}
        <div
          className="rounded-xl border overflow-hidden shadow-lg"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          <PlannerReportPage layout={layout} backendUrl={backendUrl} />
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

