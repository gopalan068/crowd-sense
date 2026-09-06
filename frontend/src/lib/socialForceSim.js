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
  agentRepulsionA: 2000,        // N — social repulsion magnitude (paper: A_ij)
  agentRepulsionB: 0.3,         // m — social repulsion range   (paper: B_ij, paper=0.08 — wider here for visual clarity)
  wallRepulsionA: 2000,         // N — wall repulsion magnitude
  wallRepulsionB: 0.2,          // m — wall repulsion range (tighter than agent-agent)
  agentMass: 80,                // kg — used to convert N→m/s²
  agentRadius: 0.25,            // m — physical body radius (personal space inner boundary)
  panicPersonalSpaceFactor: 0.6,// shrinks agentRepulsionB in panic (compressed panic crowds)
  maxSpeed: 4.0,                // m/s — hard velocity cap
  maxAcceleration: 40.0,        // m/s² — clamp on total force/mass (prevents explosion)
  wallCheckRadius: 3.0,         // m — only compute wall repulsion if wall is within this distance
  agentCheckRadius: 3.5,        // m — only compute agent-agent repulsion within this distance
  exitReachRadius: 0.8,         // m — agent is removed when within this distance of exit segment
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

/**
 * Squared distance between two points.
 */
function dist2(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

/**
 * Euclidean distance between two points.
 */
function dist(a, b) {
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

// ─── Coordinate conversions ──────────────────────────────────────────────────

/**
 * Convert pixel wall polylines into an array of meter segments [[ptA, ptB], ...].
 */
export function extractWallSegments(walls, pxPerMeter) {
  const segments = []
  for (const wall of walls) {
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
 *
 * @param {object} spawnPoint_m — { x_m, y_m } in meters
 * @param {object} goalExit_m   — { center_m: {x,y} } in meters (optional if focus mode)
 * @param {object} params       — SFM param object (uses desiredSpeed)
 * @param {object} focusOptions — { active: boolean, target_m: {x,y}, condition: 'normal'|'rushed' }
 * @returns {object} agent
 */
export function spawnAgent(spawnPoint_m, goalExit_m, params = DEFAULT_SFM_PARAMS, focusOptions = null) {
  const jitter = 0.6 // m
  const isFocus = focusOptions && focusOptions.active && focusOptions.target_m
  const isRushed = isFocus && focusOptions.condition === 'rushed'

  const desiredSpeed = isRushed
    ? params.desiredSpeed * (params.rushedMultiplier || 2.0)
    : params.desiredSpeed * (0.85 + Math.random() * 0.3)

  const goal = isFocus
    ? { x: focusOptions.target_m.x, y: focusOptions.target_m.y }
    : (goalExit_m?.center_m ? { ...goalExit_m.center_m } : { x: spawnPoint_m.x_m, y: spawnPoint_m.y_m })

  return {
    id: ++_agentIdCounter,
    pos: {
      x: spawnPoint_m.x_m + (Math.random() - 0.5) * jitter,
      y: spawnPoint_m.y_m + (Math.random() - 0.5) * jitter,
    },
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

// ─── Core simulation step ────────────────────────────────────────────────────

export function step(agents, wallSegs, exits_m, dt, params = DEFAULT_SFM_PARAMS) {
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
      const mag = agentA * Math.exp(-gap / repB)

      // Direction: from other center to this agent center
      fx += mag * (rdx / rDist)
      fy += mag * (rdy / rDist)
    }

    // ── Wall repulsion (social force eq. 6) ──────────────────────────────
    for (const seg of wallSegs) {
      // Broad-phase: skip if wall is clearly far
      const dToSeg = distToSegment(agent.pos, seg[0], seg[1])
      if (dToSeg > wallCheckRadius) continue

      const closest = closestPointOnSegment(agent.pos, seg[0], seg[1])
      const wdx = agent.pos.x - closest.x
      const wdy = agent.pos.y - closest.y
      const wDist = Math.sqrt(wdx * wdx + wdy * wdy)
      if (wDist < 1e-8) continue

      const gap = wDist - agentRadius
      const mag = wallA * Math.exp(-gap / wallRepulsionB)
      // Direction: from wall surface toward agent
      fx += mag * (wdx / wDist)
      fy += mag * (wdy / wDist)
    }

    // ── Clamp acceleration ────────────────────────────────────────────────
    const fMag = Math.sqrt(fx * fx + fy * fy)
    if (fMag > maxAcceleration) {
      const scale = maxAcceleration / fMag
      fx *= scale
      fy *= scale
    }

    // ── Euler integration ─────────────────────────────────────────────────
    agent.vel.x += fx * dt
    agent.vel.y += fy * dt

    // Apply gentle damping to prevent velocity oscillation
    agent.vel.x *= 0.995
    agent.vel.y *= 0.995

    // Clamp speed
    const speed = Math.sqrt(agent.vel.x ** 2 + agent.vel.y ** 2)
    if (speed > maxSpeed) {
      agent.vel.x = (agent.vel.x / speed) * maxSpeed
      agent.vel.y = (agent.vel.y / speed) * maxSpeed
    }

    // Update position
    agent.pos.x += agent.vel.x * dt
    agent.pos.y += agent.vel.y * dt
  }
}

/**
 * Reset agent ID counter (call when clearing simulation).
 */
export function resetAgentIds() {
  _agentIdCounter = 0
}
