/**
 * backend/src/routes/reports.js
 * Express routes for Capstone Post-Event Safety & Accountability Reports.
 *
 * Provides endpoints for:
 * - POST /api/reports/generate — Aggregates real data & generates report via Groq LLM (or honest fallback)
 * - GET  /api/reports/latest   — Instant retrieval of most recently saved report (Demo Safety)
 * - GET  /api/reports/history  — List of historical generated reports
 * - GET  /api/reports/raw-data — Inspect raw aggregated JSON payload before or after generation
 * - GET  /api/reports/:id      — Retrieve specific report by ID
 */
'use strict';

const express = require('express');
const router = express.Router();
const { aggregateReportData } = require('../services/reportAggregationService');
const { generateAndPersistReport } = require('../services/groqReportService');
const { getLatestReport, getReportHistory, getReportById } = require('../db/database');

/**
 * POST /api/reports/generate
 * Body: { scope?: 'all' | 'zone_1' | 'zone_2', include_simulated_reference?: boolean, venue_name?: string }
 */
router.post('/reports/generate', async (req, res) => {
  try {
    const { scope = 'all', include_simulated_reference = false, venue_name } = req.body || {};

    // 1. Aggregate system-collected operational data
    const aggregatedData = await aggregateReportData({
      scope,
      includeSimulatedReference: Boolean(include_simulated_reference),
      venueName: venue_name,
    });

    // 2. Generate report via Groq LLM or local deterministic fallback
    const report = await generateAndPersistReport(aggregatedData, scope);

    return res.status(200).json({
      success: true,
      report,
    });
  } catch (err) {
    console.error('[Route] POST /api/reports/generate error:', err);
    return res.status(500).json({
      error: 'Failed to generate post-event report',
      details: err.message,
    });
  }
});

/**
 * GET /api/reports/latest
 * Returns the most recently generated report from SQLite cache for demo safety.
 */
router.get('/reports/latest', async (_req, res) => {
  try {
    const latest = await getLatestReport();
    if (!latest) {
      return res.status(404).json({ error: 'No generated reports found in cache.' });
    }
    return res.status(200).json({
      success: true,
      report: latest,
      is_fallback: latest.generation_source === 'local_fallback',
    });
  } catch (err) {
    console.error('[Route] GET /api/reports/latest error:', err);
    return res.status(500).json({ error: 'Failed to fetch latest report' });
  }
});

/**
 * GET /api/reports/history
 * Returns metadata summary of past generated reports.
 */
router.get('/reports/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10', 10);
    const history = await getReportHistory(limit);
    return res.status(200).json({ history });
  } catch (err) {
    console.error('[Route] GET /api/reports/history error:', err);
    return res.status(500).json({ error: 'Failed to fetch report history' });
  }
});

/**
 * GET /api/reports/raw-data
 * Returns the aggregated JSON payload without generating markdown, for auditing.
 */
router.get('/reports/raw-data', async (req, res) => {
  try {
    const { scope = 'all', include_simulated_reference = 'false' } = req.query;
    const aggregatedData = await aggregateReportData({
      scope,
      includeSimulatedReference: include_simulated_reference === 'true',
    });
    return res.status(200).json(aggregatedData);
  } catch (err) {
    console.error('[Route] GET /api/reports/raw-data error:', err);
    return res.status(500).json({ error: 'Failed to aggregate report data' });
  }
});

/**
 * GET /api/reports/:id
 */
router.get('/reports/:id', async (req, res) => {
  try {
    const report = await getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    return res.status(200).json({ success: true, report });
  } catch (err) {
    console.error(`[Route] GET /api/reports/${req.params.id} error:`, err);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
});

module.exports = router;
