'use strict';

/**
 * backend/scripts/seedDemoVenue.js
 *
 * Seeds the Temple Chariot Procession Corridor demo venue into the SQLite
 * venues table if it doesn't already exist. Run once on backend startup.
 *
 * This demo venue uses frame.png (served from frontend/public/frame.png)
 * as its background reference image. The corridor geometry is manually
 * traced from the aerial frame — ground plane only, rooftop areas excluded.
 *
 * Scale is ESTIMATED (scale_is_estimated: true). Corridor width assumed
 * ≈ 14.4 m based on typical temple procession street widths in India.
 * This is NOT a surveyed measurement.
 */

const { upsertVenue, getVenueById } = require('../src/db/database');

const DEMO_VENUE_ID = 'demo-temple-procession';

const DEMO_LAYOUT = {
  canvasWidth:  800,
  canvasHeight: 580,
  backgroundImageUrl: '/venue_sketch.png',
  scale: {
    px_per_meter:          25,
    reference_distance_m:  15.0,
    reference_description: 'South Broadway corridor width (~375 px ≈ 15 m), estimated from venue sketch.',
    scale_is_estimated:    true,
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
};

/**
 * Insert / update demo venue.
 * Called from backend startup — updates demo venue geometry if changed.
 */
function seedDemoVenue() {
  const now = new Date().toISOString();
  upsertVenue(
    {
      venue_id:    DEMO_VENUE_ID,
      name:        'Temple Chariot Procession & Broadway Network (Demo)',
      layout_json: JSON.stringify(DEMO_LAYOUT),
      created_at:  now,
      updated_at:  now,
    },
    (seedErr) => {
      if (seedErr) {
        console.error('[Seed] Failed to seed demo venue:', seedErr.message);
      } else {
        console.log('[Seed] Temple Procession & Broadway Network demo venue updated & seeded ✓');
      }
    },
  );
}

module.exports = { seedDemoVenue };
