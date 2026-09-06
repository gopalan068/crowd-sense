'use strict';

/**
 * backend/src/routes/venues.js
 *
 * REST endpoints for CrowdSense Planner venue persistence.
 *
 * GET    /api/venues            — list all saved venues (id, name, created_at)
 * GET    /api/venues/:id        — get full venue JSON (including layout_json)
 * POST   /api/venues            — create or upsert venue { name, layout_json }
 * DELETE /api/venues/:id        — delete venue
 *
 * Venues are stored in the existing SQLite database (venues table),
 * sharing the same database.js connection as the rest of the backend.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getVenues, getVenueById, upsertVenue, deleteVenue } = require('../db/database');

const router = express.Router();

// ── List all venues ──────────────────────────────────────────────────────────
router.get('/venues', (req, res) => {
  getVenues((err, rows) => {
    if (err) {
      console.error('[Venues] Error listing venues:', err);
      return res.status(500).json({ error: 'Failed to list venues' });
    }
    // Parse summary metadata from layout_json for the list view
    const venues = rows.map(row => ({
      venue_id:   row.venue_id,
      name:       row.name,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    return res.json({ venues });
  });
});

// ── Get single venue ─────────────────────────────────────────────────────────
router.get('/venues/:id', (req, res) => {
  getVenueById(req.params.id, (err, row) => {
    if (err) {
      console.error('[Venues] Error fetching venue:', err);
      return res.status(500).json({ error: 'Failed to fetch venue' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    let layout;
    try {
      layout = JSON.parse(row.layout_json);
    } catch {
      layout = {};
    }
    return res.json({
      venue_id:    row.venue_id,
      name:        row.name,
      created_at:  row.created_at,
      updated_at:  row.updated_at,
      layout,
    });
  });
});

// ── Create / upsert venue ────────────────────────────────────────────────────
router.post('/venues', (req, res) => {
  const { name, layout, venue_id } = req.body || {};

  if (!name || !layout) {
    return res.status(400).json({ error: 'name and layout are required' });
  }

  const now       = new Date().toISOString();
  const id        = venue_id || uuidv4();
  const layoutStr = JSON.stringify(layout);

  upsertVenue({ venue_id: id, name, layout_json: layoutStr, created_at: now, updated_at: now }, (err) => {
    if (err) {
      console.error('[Venues] Error saving venue:', err);
      return res.status(500).json({ error: 'Failed to save venue' });
    }
    console.log(`[Venues] Saved venue "${name}" (${id})`);
    return res.status(201).json({ venue_id: id, name, created_at: now });
  });
});

// ── Delete venue ─────────────────────────────────────────────────────────────
router.delete('/venues/:id', (req, res) => {
  deleteVenue(req.params.id, (err) => {
    if (err) {
      console.error('[Venues] Error deleting venue:', err);
      return res.status(500).json({ error: 'Failed to delete venue' });
    }
    return res.json({ deleted: true, venue_id: req.params.id });
  });
});

module.exports = router;
