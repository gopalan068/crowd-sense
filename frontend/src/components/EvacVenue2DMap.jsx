import React, { useRef, useEffect, useState, useCallback } from 'react'

/**
 * frontend/src/components/EvacVenue2DMap.jsx
 *
 * Dedicated 2D Venue Architectural Map for the Evacuation Page.
 * Uses the exact 2D venue spatial model from the Plan & Simulate module.
 */

const CANVAS_W = 800
const CANVAS_H = 850

const DRAW_COLORS = {
  wall: '#6366f1', // indigo
  wallFill: 'rgba(99,102,241,0.18)',
  barricade: '#f59e0b', // amber
  exit: '#10b981', // emerald
  spawn: '#f59e0b', // amber
  opening: '#ef4444', // red
  grid: 'rgba(100,116,139,0.18)',
}

const DEMO_VENUE = {
  id: 'demo-temple-procession',
  name: 'Temple Chariot Procession & Broadway Network (Demo)',
  canvasWidth: CANVAS_W,
  canvasHeight: CANVAS_H,
  scale: {
    px_per_meter: 13.363,
    reference_distance_m: 28.06,
    reference_description: 'South Broadway corridor width (~375 px ≈ 28.1 m, calibrated to 3.5 sq.m per 25px grid square).',
    scale_is_estimated: true,
  },
  walls: [
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
      name: 'Exit 1 (West Concourse)',
      a: { x: 4, y: 37 },
      b: { x: 4, y: 103 },
    },
    {
      id: 'exit_north',
      name: 'Exit 2 (North Broadway)',
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
}

function segMidpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export default function EvacVenue2DMap() {
  const canvasRef = useRef(null)
  const [layout, setLayout] = useState(DEMO_VENUE)
  const [mousePos, setMousePos] = useState({ x: -999, y: -999 })
  const [hovered, setHovered] = useState(false)

  // Auto-load draft from localStorage if available
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem('planner_active_draft')
      if (savedDraft) {
        const { layout: dLayout } = JSON.parse(savedDraft)
        if (dLayout && dLayout.walls && dLayout.walls.length > 0) {
          setLayout(dLayout)
          return
        }
      }
    } catch {
      /* ignore */
    }
    setLayout(DEMO_VENUE)
  }, [])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const lay = layout

    // Clear & fill with solid plain black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // ── Grid lines (25px cell spacing) ──────────────────────────────────
    ctx.strokeStyle = DRAW_COLORS.grid
    ctx.lineWidth = 0.5
    const cellPx = 25
    for (let x = 0; x < CANVAS_W; x += cellPx) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, CANVAS_H)
      ctx.stroke()
    }
    for (let y = 0; y < CANVAS_H; y += cellPx) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(CANVAS_W, y)
      ctx.stroke()
    }

    // ── Walls & Building Polygons ────────────────────────────────────────
    for (const wall of lay.walls || []) {
      if (!wall.points || wall.points.length < 2) continue

      ctx.lineWidth = 3
      ctx.strokeStyle = DRAW_COLORS.wall
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

      // Wall vertex dots
      for (let i = 0; i < wall.points.length; i++) {
        const pt = wall.points[i]
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = '#818cf8'
        ctx.fill()
      }

      // Label for named obstacles
      if (wall.label && wall.closed && wall.points.length > 2) {
        const cx = wall.points.reduce((s, p) => s + p.x, 0) / wall.points.length
        const cy = wall.points.reduce((s, p) => s + p.y, 0) / wall.points.length
        ctx.fillStyle = 'rgba(165, 180, 252, 0.9)'
        ctx.font = 'bold 9px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(wall.label.toUpperCase(), cx, cy + 3)
        ctx.textAlign = 'left'
      }
    }

    // ── Dynamic Emergency Gates ─────────────────────────────────────────
    for (const op of lay.openings || []) {
      const mid = segMidpoint(op.a, op.b)

      if (!op.isOpen) {
        // Closed Gate: Solid barrier wall with red/amber hazard pattern
        ctx.save()
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(op.a.x, op.a.y)
        ctx.lineTo(op.b.x, op.b.y)
        ctx.stroke()

        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 2.5
        ctx.setLineDash([6, 6])
        ctx.beginPath()
        ctx.moveTo(op.a.x, op.a.y)
        ctx.lineTo(op.b.x, op.b.y)
        ctx.stroke()
        ctx.setLineDash([])

        // Posts
        ctx.fillStyle = '#ef4444'
        ctx.beginPath()
        ctx.arc(op.a.x, op.a.y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(op.b.x, op.b.y, 5, 0, Math.PI * 2)
        ctx.fill()

        // Label
        ctx.font = 'bold 8.5px ui-monospace, monospace'
        ctx.fillStyle = '#f87171'
        ctx.textAlign = 'center'
        ctx.fillText(`🔒 ${op.name || 'GATE'} (CLOSED)`, mid.x, mid.y - 8)
        ctx.textAlign = 'left'
        ctx.restore()
      } else {
        // Open Gate: Active egress exit route with emerald green glow
        ctx.save()
        ctx.strokeStyle = '#22c55e'
        ctx.lineWidth = 4
        ctx.setLineDash([5, 4])
        ctx.beginPath()
        ctx.moveTo(op.a.x, op.a.y)
        ctx.lineTo(op.b.x, op.b.y)
        ctx.stroke()
        ctx.setLineDash([])

        // Posts
        ctx.fillStyle = '#22c55e'
        ctx.beginPath()
        ctx.arc(op.a.x, op.a.y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(op.b.x, op.b.y, 5, 0, Math.PI * 2)
        ctx.fill()

        // Label
        ctx.font = 'bold 8.5px ui-monospace, monospace'
        ctx.fillStyle = '#4ade80'
        ctx.textAlign = 'center'
        ctx.fillText(`🔓 ${op.name || 'GATE'} (OPEN)`, mid.x, mid.y - 8)
        ctx.textAlign = 'left'
        ctx.restore()
      }
    }

    // ── Barricades (Crowd Control / Police Barriers) ─────────────────────
    for (const bar of lay.barricades || []) {
      const mid = segMidpoint(bar.a, bar.b)

      ctx.save()
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(bar.a.x, bar.a.y)
      ctx.lineTo(bar.b.x, bar.b.y)
      ctx.stroke()

      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 3
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(bar.a.x, bar.a.y)
      ctx.lineTo(bar.b.x, bar.b.y)
      ctx.stroke()
      ctx.setLineDash([])

      // End posts
      const drawPost = (pt) => {
        ctx.fillStyle = '#f59e0b'
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      drawPost(bar.a)
      drawPost(bar.b)

      // Label
      ctx.font = 'bold 8.5px ui-monospace, monospace'
      ctx.fillStyle = '#fbbf24'
      ctx.textAlign = 'center'
      ctx.fillText(`🚧 ${bar.name || 'BARRICADE'}`, mid.x, mid.y - 8)
      ctx.textAlign = 'left'
      ctx.restore()
    }

    // ── Exits ────────────────────────────────────────────────────────────
    for (const exit of lay.exits || []) {
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

    // ── Spawn / Entry Points ─────────────────────────────────────────────
    for (const sp of lay.spawns || []) {
      ctx.fillStyle = DRAW_COLORS.spawn
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('S', sp.x, sp.y + 3)
      ctx.textAlign = 'left'

      // Name
      ctx.fillStyle = DRAW_COLORS.spawn
      ctx.font = '9px ui-monospace, monospace'
      ctx.fillText(sp.name || sp.id, sp.x + 12, sp.y + 3)
    }
  }, [layout])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  const handleMouseMove = (e) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    const scaleY = CANVAS_H / rect.height
    setMousePos({
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    })
  }

  return (
    <div
      className="rounded-xl border overflow-hidden shadow-2xl"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-surface)',
      }}
    >
      {/* Top Header Strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 18px',
          background: 'rgba(18, 27, 49, 0.75)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🗺️</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text)' }}>
                Venue 2D Spatial &amp; Egress Layout
              </h3>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-m)',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'rgba(58, 217, 245, 0.15)',
                  color: 'var(--cyan)',
                  border: '1px solid rgba(58, 217, 245, 0.3)',
                }}
              >
                2D ARCHITECTURAL MODEL
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {layout.name || 'Temple Chariot Procession & Broadway Network'} · Calibrated at 13.4 px/m
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {hovered && mousePos.x >= 0 && (
            <div
              style={{
                fontFamily: 'var(--font-m)',
                fontSize: 10.5,
                color: 'var(--cyan)',
                background: 'rgba(6, 10, 19, 0.7)',
                padding: '3px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
              }}
            >
              {mousePos.x}, {mousePos.y} px · {(mousePos.x / 13.363).toFixed(1)}, {(mousePos.y / 13.363).toFixed(1)} m
            </div>
          )}
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-m)',
              color: 'var(--text-faint)',
              textTransform: 'uppercase',
            }}
          >
            Resolution: {CANVAS_W} × {CANVAS_H}
          </span>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '16px',
          background: '#040811',
        }}
      >
        <div
          style={{
            position: 'relative',
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
            width: '100%',
            maxWidth: `${CANVAS_W}px`,
          }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{
              width: '100%',
              maxWidth: `${CANVAS_W}px`,
              aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
              display: 'block',
              cursor: 'crosshair',
            }}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => {
              setHovered(false)
              setMousePos({ x: -999, y: -999 })
            }}
          />
        </div>
      </div>

      {/* Map Legend Strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 18px',
          background: 'rgba(13, 20, 36, 0.9)',
          borderTop: '1px solid var(--border)',
          fontFamily: 'var(--font-m)',
          fontSize: 10.5,
          color: 'var(--text-dim)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#6366f1', fontSize: 13 }}>■</span> Building Walls &amp; Compounds
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#f59e0b', fontSize: 13 }}>■</span> Crowd Barricades
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#10b981', fontWeight: 700 }}>- -</span> Egress Exits
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#ef4444', fontSize: 13 }}>■</span> Emergency Gates (🔒 Closed / 🔓 Open)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#f59e0b', fontSize: 13 }}>●</span> Spawn / Inflow Points
          </span>
        </div>

        <div style={{ color: 'var(--text-faint)' }}>
          Grid: 25px ≈ 3.5 m² cell
        </div>
      </div>
    </div>
  )
}
