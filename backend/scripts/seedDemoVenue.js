'use strict';

/**
 * backend/scripts/seedDemoVenue.js
 *
 * Seeds the Temple Chariot Procession Corridor demo venue into the SQLite
 * venues table if it doesn't already exist. Run once on backend startup.
 *
 * Standalone closed building blocks with full-height continuous structures,
 * physical crowd control barricades, and interactive emergency gates.
 */

const { upsertVenue, getVenueById } = require('../src/db/database');

const DEMO_VENUE_ID = 'demo-temple-procession';

const DEMO_LAYOUT = {
  canvasWidth:  800,
  canvasHeight: 850,
  scale: {
    px_per_meter:          25,
    reference_distance_m:  15.0,
    reference_description: 'South Broadway corridor width (~375 px ≈ 15 m), estimated from venue sketch.',
    scale_is_estimated:    true,
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
