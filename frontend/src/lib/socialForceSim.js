/**
 * frontend/src/lib/socialForceSim.js
 *
 * Social Force Model crowd simulation engine (Helbing & Molnár, 1995).
 * Pure JavaScript — no dependencies, runs entirely client-side.
 *
 * All spatial units are METERS. The caller is responsible for converting
 * canvas-pixel venue geometry to meters before passing it in.
 *
 * Reference: Helbing, D. & Molnár, P. (1995). Social force model for
 * pedestrian dynamics. Physical Review E, 51(5), 4282.
 *
 * NOT a certified evacuation-engineering model. Parameters are not
 * empirically calibrated for any specific venue.
 */

/** Default SFM parameters — tune empirically, never hardcode call sites */
export const DEFAULT_SFM_PARAMS = {
  desiredSpeed: 1.3,            // m/s — typical comfortable walking speed
  panicSpeedMultiplier: 2.0,    // ×desiredSpeed when isPanic = true
  rushedMultiplier: 2.0,        // ×desiredSpeed when rushed focus mode is active
  relaxationTime: 0.5,          // s — τ in Helbing eq. (how fast agent reaches v0)
  agentRepulsionA: 2400,        // N — social repulsion magnitude (paper: A_ij)
  agentRepulsionB: 0.16,        // m — social repulsion range (tighter for authentic dense crowd packing)
  wallRepulsionA: 2800,         // N — wall repulsion magnitude
  wallRepulsionB: 0.16,         // m — wall repulsion range (tighter wall clearance)
  agentMass: 80,                // kg — used to convert N→m/s²
  agentRadius: 0.28,            // m — physical body radius (standard shoulder clearance)
  panicPersonalSpaceFactor: 0.5,// shrinks agentRepulsionB in panic (compressed panic crowds)
  maxSpeed: 4.0,                // m/s — hard velocity cap
  maxAcceleration: 40.0,        // m/s² — clamp on total force/mass (prevents explosion)
  wallCheckRadius: 3.5,         // m — only compute wall repulsion if wall is within this distance
  agentCheckRadius: 2.8,        // m — only compute agent-agent repulsion within this distance
  exitReachRadius: 0.8,         // m — agent is removed when within this distance of exit segment
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

/**
 * Squared distance between two points.
 */
export function dist2(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

/**
 * Euclidean distance between two points.
 */
export function dist(a, b) {
  return Math.sqrt(dist2(a, b))
}

/**
 * Closest point on segment [segA, segB] to point p.
 * Returns the closest point as {x, y}.
 */
export function closestPointOnSegment(p, segA, segB) {
  const dx = segB.x - segA.x
  const dy = segB.y - segA.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-8) return { x: segA.x, y: segA.y }

  const t = Math.max(0, Math.min(1, ((p.x - segA.x) * dx + (p.y - segA.y) * dy) / len2))
  return { x: segA.x + t * dx, y: segA.y + t * dy }
}

/**
 * Distance from point p to segment [segA, segB].
 */
export function distToSegment(p, segA, segB) {
  const cp = closestPointOnSegment(p, segA, segB)
  return dist(p, cp)
}

/**
 * Check if 2D line segment [p1, p2] intersects line segment [p3, p4].
 * Returns intersection details or null if no intersection.
 */
export function segmentIntersection(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x
  const d1y = p2.y - p1.y
  const d2x = p4.x - p3.x
  const d2y = p4.y - p3.y
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 1e-9) return null

  const dx = p3.x - p1.x
  const dy = p3.y - p1.y
  const t = (dx * d2y - dy * d2x) / cross
  const u = (dx * d1y - dy * d1x) / cross

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: p1.x + t * d1x,
      y: p1.y + t * d1y,
      t,
      u,
    }
  }
  return null
}

/**
 * Test if point p is inside a 2D polygon (ray-casting algorithm).
 */
export function isPointInPolygon(pt, poly) {
  if (!poly || poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Compute the verified outward unit normal for a polygon edge [pA, pB] at contact point cp.
 * Guarantees the normal vector points strictly AWAY from the polygon interior.
 */
export function getPolygonOutwardNormal(cp, pA, pB, poly) {
  const edx = pB.x - pA.x
  const edy = pB.y - pA.y
  const elen = Math.hypot(edx, edy) || 1

  // Normal candidates
  const n1 = { x: -edy / elen, y: edx / elen }
  const n2 = { x: edy / elen, y: -edx / elen }

  const testD = 0.05 // 5 cm probe
  const t1 = { x: cp.x + n1.x * testD, y: cp.y + n1.y * testD }
  const t2 = { x: cp.x + n2.x * testD, y: cp.y + n2.y * testD }

  const in1 = isPointInPolygon(t1, poly)
  const in2 = isPointInPolygon(t2, poly)

  if (!in1 && in2) return n1
  if (in1 && !in2) return n2

  // Fallback: point away from polygon centroid
  let cx = 0, cy = 0
  for (const p of poly) { cx += p.x; cy += p.y }
  cx /= poly.length; cy /= poly.length

  const toCpX = cp.x - cx
  const toCpY = cp.y - cy
  const dot1 = n1.x * toCpX + n1.y * toCpY
  return dot1 >= 0 ? n1 : n2
}

// ─── Coordinate conversions ──────────────────────────────────────────────────

/**
 * Convert pixel wall polylines into an array of meter segments [[ptA, ptB], ...].
 */
export function extractWallSegments(walls, pxPerMeter) {
  const segments = []
  for (const wall of (walls || [])) {
    const pts = wall.points
    if (!pts || pts.length < 2) continue
    const count = wall.closed ? pts.length : pts.length - 1
    for (let i = 0; i < count; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      segments.push([
        { x: a.x / pxPerMeter, y: a.y / pxPerMeter },
        { x: b.x / pxPerMeter, y: b.y / pxPerMeter },
      ])
    }
  }
  return segments
}

/**
 * Extract closed building polygon point arrays in meters.
 */
export function extractBuildingPolygons(walls, pxPerMeter) {
  const polys = []
  for (const wall of (walls || [])) {
    if (wall.closed && wall.points && wall.points.length >= 3) {
      polys.push(wall.points.map(p => ({ x: p.x / pxPerMeter, y: p.y / pxPerMeter })))
    }
  }
  return polys
}

/**
 * Convert exit pixel coords to meter coords.
 */
export function convertExitsToMeters(exits, pxPerMeter) {
  return (exits || []).map(e => ({
    ...e,
    a_m: { x: e.a.x / pxPerMeter, y: e.a.y / pxPerMeter },
    b_m: { x: e.b.x / pxPerMeter, y: e.b.y / pxPerMeter },
    center_m: {
      x: (e.a.x + e.b.x) / 2 / pxPerMeter,
      y: (e.a.y + e.b.y) / 2 / pxPerMeter,
    },
  }))
}

/**
 * Convert spawn pixel coords to meter coords.
 */
export function convertSpawnsToMeters(spawns, pxPerMeter) {
  return (spawns || []).map(s => ({
    ...s,
    x_m: s.x / pxPerMeter,
    y_m: s.y / pxPerMeter,
  }))
}

// ─── Agent lifecycle ─────────────────────────────────────────────────────────

let _agentIdCounter = 0

/**
 * Create a new agent at a spawn point heading toward a goal exit or focus target.
 * Validates spawn position to guarantee agent never starts inside a building or wall.
 *
 * @param {object} spawnPoint_m   — { x_m, y_m } in meters
 * @param {object} goalExit_m     — { center_m: {x,y} } in meters (optional if focus mode)
 * @param {object} params         — SFM param object (uses desiredSpeed)
 * @param {object} focusOptions   — { active: boolean, target_m: {x,y}, condition: 'normal'|'rushed' }
 * @param {Array}  buildingPolys_m— optional array of closed building polygons in meters
 * @param {Array}  wallSegs       — optional array of wall segments in meters
 * @returns {object} agent
 */
export function spawnAgent(
  spawnPoint_m,
  goalExit_m,
  params = DEFAULT_SFM_PARAMS,
  focusOptions = null,
  buildingPolys_m = null,
  wallSegs = null
) {
  const jitter = 0.4 // m (safe tight jitter)
  const isFocus = focusOptions && focusOptions.active && focusOptions.target_m
  const isRushed = isFocus && focusOptions.condition === 'rushed'

  const desiredSpeed = isRushed
    ? params.desiredSpeed * (params.rushedMultiplier || 2.0)
    : params.desiredSpeed * (0.85 + Math.random() * 0.3)

  const goal = isFocus
    ? { x: focusOptions.target_m.x, y: focusOptions.target_m.y }
    : (goalExit_m?.center_m ? { ...goalExit_m.center_m } : { x: spawnPoint_m.x_m, y: spawnPoint_m.y_m })

  let spawnX = spawnPoint_m.x_m + (Math.random() - 0.5) * jitter
  let spawnY = spawnPoint_m.y_m + (Math.random() - 0.5) * jitter
  const curPos = { x: spawnX, y: spawnY }

  // Check if spawn position intersects any building polygon
  if (buildingPolys_m && buildingPolys_m.length > 0) {
    for (const poly of buildingPolys_m) {
      if (isPointInPolygon(curPos, poly)) {
        // Find closest edge and push outside
        let minDist = Infinity
        let bestClosest = null
        let bestNormal = null
        for (let k = 0; k < poly.length; k++) {
          const pA = poly[k]
          const pB = poly[(k + 1) % poly.length]
          const cp = closestPointOnSegment(curPos, pA, pB)
          const d = dist(curPos, cp)
          if (d < minDist) {
            minDist = d
            bestClosest = cp
            bestNormal = getPolygonOutwardNormal(cp, pA, pB, poly)
          }
        }
        if (bestClosest && bestNormal) {
          spawnX = bestClosest.x + bestNormal.x * (params.agentRadius + 0.1)
          spawnY = bestClosest.y + bestNormal.y * (params.agentRadius + 0.1)
        }
      }
    }
  }

  // Check clearance against wall segments
  if (wallSegs && wallSegs.length > 0) {
    for (const seg of wallSegs) {
      const cp = closestPointOnSegment({ x: spawnX, y: spawnY }, seg[0], seg[1])
      const d = dist({ x: spawnX, y: spawnY }, cp)
      if (d < params.agentRadius + 0.05) {
        const dx = spawnX - cp.x
        const dy = spawnY - cp.y
        const dlen = Math.hypot(dx, dy) || 1
        spawnX = cp.x + (dx / dlen) * (params.agentRadius + 0.1)
        spawnY = cp.y + (dy / dlen) * (params.agentRadius + 0.1)
      }
    }
  }

  return {
    id: ++_agentIdCounter,
    pos: { x: spawnX, y: spawnY },
    vel: { x: 0, y: 0 },
    desiredSpeed,
    goal,
    isPanic: isRushed,
    isFocus: !!isFocus,
    reachedExit: false,
    spawnId: spawnPoint_m.id,
  }
}

/**
 * Switch all active agents to panic mode: highest-priority nearest-exit goal.
 */
export function triggerEmergency(agents, exits_m, params = DEFAULT_SFM_PARAMS) {
  if (!exits_m || exits_m.length === 0) return
  for (const agent of agents) {
    if (agent.reachedExit) continue
    agent.isPanic = true
    agent.isFocus = false
    agent.desiredSpeed = params.desiredSpeed * params.panicSpeedMultiplier

    let nearestExit = exits_m[0]
    let minDist = Infinity
    for (const exit of exits_m) {
      const d = dist(agent.pos, exit.center_m)
      if (d < minDist) {
        minDist = d
        nearestExit = exit
      }
    }
    agent.goal = { ...nearestExit.center_m }
  }
}

/**
 * Switch all active agents to focus on a designated point of interest.
 *
 * @param {Array}  agents        — live agent array
 * @param {object} focusPoint_m  — { x: number, y: number } in meters
 * @param {string} condition     — 'normal' | 'rushed'
 * @param {object} params        — SFM params
 */
export function setFocusTarget(agents, focusPoint_m, condition = 'normal', params = DEFAULT_SFM_PARAMS) {
  if (!focusPoint_m) return
  const isRushed = condition === 'rushed'
  for (const agent of agents) {
    if (agent.reachedExit) continue
    agent.isFocus = true
    agent.isPanic = isRushed
    agent.desiredSpeed = isRushed
      ? params.desiredSpeed * (params.rushedMultiplier || 2.0)
      : params.desiredSpeed * (0.85 + Math.random() * 0.3)
    agent.goal = { x: focusPoint_m.x, y: focusPoint_m.y }
  }
}

// ─── Core simulation step with Strict Impenetrable Boundaries ────────────────

export function step(
  agents,
  wallSegs,
  exits_m,
  dt,
  params = DEFAULT_SFM_PARAMS,
  boundary_m = null,
  buildingPolys_m = null
) {
  const {
    relaxationTime,
    agentRepulsionA,
    agentRepulsionB,
    wallRepulsionA,
    wallRepulsionB,
    agentMass,
    agentRadius,
    panicPersonalSpaceFactor,
    maxSpeed,
    maxAcceleration,
    wallCheckRadius,
    agentCheckRadius,
    exitReachRadius,
  } = params

  const agentA = agentRepulsionA / agentMass
  const wallA  = wallRepulsionA  / agentMass

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    if (agent.reachedExit) continue

    // ── Exit detection (only if agent is not in focus mode or explicitly at an exit) ──
    if (exits_m && exits_m.length > 0 && !agent.isFocus) {
      for (const exit of exits_m) {
        if (distToSegment(agent.pos, exit.a_m, exit.b_m) < exitReachRadius) {
          agent.reachedExit = true
          break
        }
      }
    }
    if (agent.reachedExit) continue

    // ── Driving force (social force eq. 2) ───────────────────────────────
    const gx = agent.goal.x - agent.pos.x
    const gy = agent.goal.y - agent.pos.y
    const gDist = Math.sqrt(gx * gx + gy * gy)
    // Normalized desired direction e_i
    const ex = gDist > 0.001 ? gx / gDist : 0
    const ey = gDist > 0.001 ? gy / gDist : 0

    // When near a focus point, decelerate smoothly to cluster without jitter
    let vDesired = agent.desiredSpeed
    if (agent.isFocus && gDist < 2.5) {
      vDesired = Math.max(0.15, agent.desiredSpeed * (gDist / 2.5))
    }

    // a_drive = (v0·e - v) / τ
    let fx = (vDesired * ex - agent.vel.x) / relaxationTime
    let fy = (vDesired * ey - agent.vel.y) / relaxationTime

    // ── Agent–agent repulsion (social force eq. 4) ───────────────────────
    const repB = agent.isPanic
      ? agentRepulsionB * panicPersonalSpaceFactor
      : agentRepulsionB

    for (let j = 0; j < agents.length; j++) {
      if (i === j) continue
      const other = agents[j]
      if (other.reachedExit) continue

      const rdx = agent.pos.x - other.pos.x
      const rdy = agent.pos.y - other.pos.y
      const rDist2 = rdx * rdx + rdy * rdy
      if (rDist2 > agentCheckRadius * agentCheckRadius) continue
      if (rDist2 < 1e-8) continue

      const rDist = Math.sqrt(rDist2)
      // gap = distance between body surfaces
      const gap = rDist - 2 * agentRadius
      let mag = agentA * Math.exp(-Math.max(0, gap) / repB)
      if (gap < 0) {
        mag += 90000 * (-gap) // Contact body compression stiffness
      }

      // Direction: from other center to this agent center
      fx += mag * (rdx / rDist)
      fy += mag * (rdy / rDist)
    }

    // ── Wall repulsion with Contact Stiffness ────────────────────────────
    for (const seg of wallSegs) {
      const dToSeg = distToSegment(agent.pos, seg[0], seg[1])
      if (dToSeg > wallCheckRadius) continue

      const closest = closestPointOnSegment(agent.pos, seg[0], seg[1])
      const wdx = agent.pos.x - closest.x
      const wdy = agent.pos.y - closest.y
      const wDist = Math.sqrt(wdx * wdx + wdy * wdy)
      if (wDist < 1e-8) continue

      const gap = wDist - agentRadius
      let mag = wallA * Math.exp(-Math.max(0, gap) / wallRepulsionB)

      // Stiff body compression force when touching a wall (Helbing 2000)
      if (gap < 0) {
        mag += 200000 * (-gap)
      }

      fx += mag * (wdx / wDist)
      fy += mag * (wdy / wDist)
    }

    // ── Virtual Venue Boundary Repulsion ──────────────────────────────────
    if (boundary_m) {
      const { minX, maxX, minY, maxY } = boundary_m
      // Left boundary (x = minX)
      if (agent.pos.x - minX < wallCheckRadius) {
        const gap = agent.pos.x - minX - agentRadius
        let mag = wallA * Math.exp(-Math.max(0, gap) / wallRepulsionB)
        if (gap < 0) mag += 200000 * (-gap)
        fx += mag
      }
      // Right boundary (x = maxX)
      if (maxX - agent.pos.x < wallCheckRadius) {
        const gap = maxX - agent.pos.x - agentRadius
        let mag = wallA * Math.exp(-Math.max(0, gap) / wallRepulsionB)
        if (gap < 0) mag += 200000 * (-gap)
        fx -= mag
      }
      // Top boundary (y = minY)
      if (agent.pos.y - minY < wallCheckRadius) {
        const gap = agent.pos.y - minY - agentRadius
        let mag = wallA * Math.exp(-Math.max(0, gap) / wallRepulsionB)
        if (gap < 0) mag += 200000 * (-gap)
        fy += mag
      }
      // Bottom boundary (y = maxY)
      if (maxY - agent.pos.y < wallCheckRadius) {
        const gap = maxY - agent.pos.y - agentRadius
        let mag = wallA * Math.exp(-Math.max(0, gap) / wallRepulsionB)
        if (gap < 0) mag += 200000 * (-gap)
        fy -= mag
      }
    }

    // ── Clamp acceleration ────────────────────────────────────────────────
    const fMag = Math.sqrt(fx * fx + fy * fy)
    if (fMag > maxAcceleration) {
      const scale = maxAcceleration / fMag
      fx *= scale
      fy *= scale
    }

    // ── Store previous position for Continuous Collision Detection (CCD) ──
    const prevX = agent.pos.x
    const prevY = agent.pos.y

    // ── Euler integration ─────────────────────────────────────────────────
    agent.vel.x += fx * dt
    agent.vel.y += fy * dt

    // Apply gentle velocity damping to prevent velocity flutter
    agent.vel.x *= 0.995
    agent.vel.y *= 0.995

    // Clamp speed
    const speed = Math.sqrt(agent.vel.x ** 2 + agent.vel.y ** 2)
    if (speed > maxSpeed) {
      agent.vel.x = (agent.vel.x / speed) * maxSpeed
      agent.vel.y = (agent.vel.y / speed) * maxSpeed
    }

    // Proposed new position
    let newX = agent.pos.x + agent.vel.x * dt
    let newY = agent.pos.y + agent.vel.y * dt

    // ── Layer 1: Continuous Collision Detection (CCD Ray-Segment Intercept) ─
    // If agent trajectory [prevPos -> newPos] crosses any wall segment, intercept BEFORE the wall
    for (const seg of wallSegs) {
      const isect = segmentIntersection({ x: prevX, y: prevY }, { x: newX, y: newY }, seg[0], seg[1])
      if (isect) {
        const segDx = seg[1].x - seg[0].x
        const segDy = seg[1].y - seg[0].y
        const segLen = Math.hypot(segDx, segDy) || 1
        const n1 = { x: -segDy / segLen, y: segDx / segLen }
        const toPrev = (prevX - isect.x) * n1.x + (prevY - isect.y) * n1.y
        const normal = toPrev >= 0 ? n1 : { x: -n1.x, y: -n1.y }

        newX = isect.x + normal.x * (agentRadius + 0.03)
        newY = isect.y + normal.y * (agentRadius + 0.03)

        // Cancel inward velocity component
        const vDotN = agent.vel.x * normal.x + agent.vel.y * normal.y
        if (vDotN < 0) {
          agent.vel.x -= vDotN * normal.x
          agent.vel.y -= vDotN * normal.y
        }
      }
    }

    agent.pos.x = newX
    agent.pos.y = newY

    // ── Layer 2 & 3: Multi-Pass Physical Wall and Building Polygon Resolution ─
    // Run 2 iterations of boundary constraint satisfaction for zero-penetration guarantee
    for (let pass = 0; pass < 2; pass++) {
      // 1. Solid wall segments projection
      for (const seg of wallSegs) {
        const closest = closestPointOnSegment(agent.pos, seg[0], seg[1])
        const wdx = agent.pos.x - closest.x
        const wdy = agent.pos.y - closest.y
        const wDist = Math.hypot(wdx, wdy)

        if (wDist < agentRadius + 0.01) {
          let nx = 0, ny = 0
          if (wDist > 1e-4) {
            nx = wdx / wDist
            ny = wdy / wDist
          } else {
            const sx = seg[1].x - seg[0].x
            const sy = seg[1].y - seg[0].y
            const slen = Math.hypot(sx, sy) || 1
            nx = -sy / slen
            ny = sx / slen
          }

          agent.pos.x = closest.x + nx * (agentRadius + 0.02)
          agent.pos.y = closest.y + ny * (agentRadius + 0.02)

          const vDotN = agent.vel.x * nx + agent.vel.y * ny
          if (vDotN < 0) {
            agent.vel.x -= vDotN * nx
            agent.vel.y -= vDotN * ny
          }
        }
      }

      // 2. Closed building polygons strict interior ejection
      if (buildingPolys_m && buildingPolys_m.length > 0) {
        for (const poly of buildingPolys_m) {
          if (isPointInPolygon(agent.pos, poly)) {
            let minDist = Infinity
            let bestClosest = null
            let bestNormal = null

            for (let k = 0; k < poly.length; k++) {
              const pA = poly[k]
              const pB = poly[(k + 1) % poly.length]
              const cp = closestPointOnSegment(agent.pos, pA, pB)
              const d = dist(agent.pos, cp)
              if (d < minDist) {
                minDist = d
                bestClosest = cp
                bestNormal = getPolygonOutwardNormal(cp, pA, pB, poly)
              }
            }

            if (bestClosest && bestNormal) {
              agent.pos.x = bestClosest.x + bestNormal.x * (agentRadius + 0.06)
              agent.pos.y = bestClosest.y + bestNormal.y * (agentRadius + 0.06)

              const vDotN = agent.vel.x * bestNormal.x + agent.vel.y * bestNormal.y
              if (vDotN < 0) {
                agent.vel.x -= vDotN * bestNormal.x
                agent.vel.y -= vDotN * bestNormal.y
              }
            }
          }
        }
      }

      // 3. Virtual Venue Boundary strict containment
      if (boundary_m) {
        const pad = agentRadius
        let atExit = false
        if (exits_m && exits_m.length > 0 && !agent.isFocus) {
          for (const exit of exits_m) {
            if (distToSegment(agent.pos, exit.a_m, exit.b_m) < exitReachRadius * 1.5) {
              atExit = true
              agent.reachedExit = true
              break
            }
          }
        }

        if (!atExit && !agent.reachedExit) {
          if (agent.pos.x < boundary_m.minX + pad) {
            agent.pos.x = boundary_m.minX + pad
            if (agent.vel.x < 0) agent.vel.x = 0
          } else if (agent.pos.x > boundary_m.maxX - pad) {
            agent.pos.x = boundary_m.maxX - pad
            if (agent.vel.x > 0) agent.vel.x = 0
          }

          if (agent.pos.y < boundary_m.minY + pad) {
            agent.pos.y = boundary_m.minY + pad
            if (agent.vel.y < 0) agent.vel.y = 0
          } else if (agent.pos.y > boundary_m.maxY - pad) {
            agent.pos.y = boundary_m.maxY - pad
            if (agent.vel.y > 0) agent.vel.y = 0
          }
        }
      }
    }
  }
}

/**
 * Reset agent ID counter (call when clearing simulation).
 */
export function resetAgentIds() {
  _agentIdCounter = 0
}
