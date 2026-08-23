/**
 * backend/src/routes/responders.js
 * Responder check-in and nearest-team lookup.
 *
 * Check-in store is in-memory (Map). No persistence needed for this demo —
 * responders re-check-in if the backend restarts. Same pattern as
 * escalationManager's activeZoneAlerts Map.
 *
 * Zone adjacency and response routes are PRE-AUTHORED config data,
 * not computed at runtime. No pathfinding algorithm is used.
 * See ZONE_ADJACENCY and RESPONSE_ROUTES constants below.
 */
'use strict';

const express = require('express');
const router = express.Router();

// ── In-memory check-in store ──────────────────────────────────────────────────
// Shape: Map<responder_id, { name, zone_id, checked_in_at }>
const responderCheckIns = new Map();

// ── Pre-authored zone adjacency ───────────────────────────────────────────────
// Hand-defined connections. With only 2 zones, the distance-2 (non-adjacent)
// case in findNearestTeam() is currently UNREACHABLE — every zone is either
// the same or exactly 1 hop away.
//
// TODO: When zone_3 is added (blueprint multi-zone feature), update this table
// AND retest the distance logic — do not assume it still works without a test.
const ZONE_ADJACENCY = {
  zone_1: ['zone_2'],  // Arrival/Waiting Staging -> Main Field via Gate Throat
  zone_2: ['zone_1'],  // Main Gathering Field -> Arrival/Waiting via Gate Throat
};

// ── Pre-authored response routes ─────────────────────────────────────────────
// Each entry defines a pre-planned path label and steps shown to the responder.
// "Same zone" case: label is null -> UI shows "On-site -- no travel needed".
// These are static config values -- no routing algorithm computes them.
const RESPONSE_ROUTES = {
  'zone_1->zone_1': {
    label: null,  // null = "On-site -- no travel needed"
    steps: [],
  },
  'zone_2->zone_2': {
    label: null,  // null = "On-site -- no travel needed"
    steps: [],
  },
  'zone_1->zone_2': {
    label: 'Zone 1 -> Gate Throat -> Zone 2',
    steps: ['Zone 1 — Arrival Staging', 'Gate Throat Channels', 'Zone 2 — Main Field'],
  },
  'zone_2->zone_1': {
    label: 'Zone 2 -> Gate Throat -> Zone 1',
    steps: ['Zone 2 — Main Field', 'Gate Throat Channels', 'Zone 1 — Arrival Staging'],
  },
  // FUTURE: Add zone_3 entries when third zone is built.
};

/**
 * Find the nearest checked-in responder team to a given alert zone.
 * Returns the responder entry (or null) and the pre-authored route.
 *
 * Distance logic:
 *   0 = same zone as alert
 *   1 = adjacent zone (1 hop in ZONE_ADJACENCY)
 *   2 = not adjacent (currently unreachable with 2 zones -- see TODO above)
 *
 * This is a simple lookup, NOT GPS-based distance calculation.
 *
 * @param {string} alertZoneId
 * @returns {{ responder: Object|null, distance: number, route: Object|null }}
 */
function findNearestTeam(alertZoneId) {
  const checkedIn = Array.from(responderCheckIns.values());
  if (checkedIn.length === 0) {
    return { responder: null, distance: Infinity, route: null };
  }

  let best = null;
  let bestDistance = Infinity;

  for (const r of checkedIn) {
    let distance;
    if (r.zone_id === alertZoneId) {
      distance = 0;
    } else if ((ZONE_ADJACENCY[alertZoneId] || []).includes(r.zone_id)) {
      distance = 1;
    } else {
      distance = 2; // Non-adjacent -- unreachable with current 2-zone setup
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      best = r;
    }
  }

  const routeKey = best ? `${best.zone_id}->${alertZoneId}` : null;
  const route = routeKey ? (RESPONSE_ROUTES[routeKey] || null) : null;

  return { responder: best, distance: bestDistance, route };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/responders/checkin
 * Body: { responder_id: string, name: string, zone_id: string }
 * Upserts the responder's check-in entry and emits 'responder_checkin' socket event.
 */
router.post('/responders/checkin', (req, res) => {
  const { responder_id, name, zone_id } = req.body || {};

  if (!responder_id || !name || !zone_id) {
    return res.status(400).json({ error: 'responder_id, name, and zone_id are required' });
  }

  if (!ZONE_ADJACENCY[zone_id]) {
    return res.status(400).json({ error: `Unknown zone_id: ${zone_id}. Valid zones: ${Object.keys(ZONE_ADJACENCY).join(', ')}` });
  }

  const entry = {
    responder_id,
    name,
    zone_id,
    checked_in_at: new Date().toISOString(),
  };

  responderCheckIns.set(responder_id, entry);

  const io = req.app.get('io');
  if (io) {
    io.emit('responder_checkin', entry);
  }

  console.log(`[Responders] Check-in: ${name} (${responder_id}) -> ${zone_id}`);
  return res.status(200).json({ success: true, responder: entry });
});

/**
 * GET /api/responders
 * Returns all currently checked-in responders.
 */
router.get('/responders', (_req, res) => {
  return res.status(200).json({
    responders: Array.from(responderCheckIns.values()),
  });
});

/**
 * GET /api/responders/nearest?zone_id=zone_1
 * Returns nearest checked-in team to the given zone.
 * Uses manual zone check-in + ZONE_ADJACENCY table -- NOT GPS-based.
 */
router.get('/responders/nearest', (req, res) => {
  const { zone_id } = req.query;
  if (!zone_id) {
    return res.status(400).json({ error: 'zone_id query param required' });
  }

  const result = findNearestTeam(zone_id);
  return res.status(200).json(result);
});

/**
 * Get total checked-in responders count for a specific zone.
 * @param {string} zoneId
 * @returns {number}
 */
function getCheckedInCountByZone(zoneId) {
  if (!zoneId) return 0;
  let count = 0;
  for (const r of responderCheckIns.values()) {
    if (r.zone_id === zoneId) {
      count++;
    }
  }
  return count;
}

/**
 * Get all current responder check-in records.
 * @returns {Array<Object>}
 */
function getCheckedInResponders() {
  return Array.from(responderCheckIns.values());
}

module.exports = {
  router,
  findNearestTeam,
  RESPONSE_ROUTES,
  getCheckedInCountByZone,
  getCheckedInResponders,
  responderCheckIns,
};
