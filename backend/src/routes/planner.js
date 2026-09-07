/**
 * backend/src/routes/planner.js
 *
 * POST /api/planner/narrate-report
 *
 * Accepts pre-computed, deterministic bottleneck analysis results and
 * matched recommendations, then makes a single LLM call to narrate them
 * into readable prose.
 *
 * The LLM is explicitly instructed to:
 *   - Only rephrase and organize the provided findings
 *   - Never invent additional numbers, recommendations, or safety claims
 *
 * If the LLM (Groq) is not configured or fails, returns { narration: null }
 * with HTTP 200 so the frontend can degrade gracefully — the report page
 * remains fully functional without narration.
 */
const express = require('express');
const router  = express.Router();
const { generatePlannerNarration } = require('../services/geminiPlannerService');

/**
 * POST /api/planner/narrate-report
 * Body: {
 *   bottleneckResults: object,   — structured analysis from bottleneckAnalysis.js
 *   recommendations:   Array,    — matched recommendations from recommendationRules.js
 *   venueName:         string,   — venue name for context
 *   scenarioLabels:    string[], — scenario labels run
 * }
 *
 * Returns: { narration: string, model: string, source: string, success: boolean }
 */
router.post('/planner/narrate-report', async (req, res) => {
  const { bottleneckResults, recommendations, venueName, scenarioLabels } = req.body || {};

  if (!bottleneckResults || !recommendations) {
    return res.status(400).json({ error: 'bottleneckResults and recommendations are required' });
  }

  // Build compact, structured prompt payload (avoid sending raw density Float32Arrays)
  const promptPayload = {
    venueName:      venueName || 'Venue Layout',
    scenariosRun:   scenarioLabels || [],
    bottleneckResults: {
      persistentBottleneckCount:  bottleneckResults.persistentBottlenecks?.length ?? 0,
      conditionalBottleneckCount: bottleneckResults.conditionalBottlenecks?.length ?? 0,
      topPersistentBottlenecks: (bottleneckResults.persistentBottlenecks || []).slice(0, 6).map(b => ({
        zoneName:      b.zoneName || b.cellName,
        zoneCode:      b.zoneCode,
        firstRedTime:  b.firstRedTime,
        redDuration:   b.redDuration,
        peakDensity:   b.peakDensity,
        appearedIn:    b.appearedIn,
      })),
      topConditionalBottlenecks: (bottleneckResults.conditionalBottlenecks || []).slice(0, 6).map(b => ({
        zoneName:      b.zoneName || b.cellName,
        zoneCode:      b.zoneCode,
        scenarioCount: b.appearedIn?.length || b.scenarioCount,
        appearedIn:    b.appearedIn,
        peakDensity:   b.peakDensity,
      })),
      mitigationEffectiveness: bottleneckResults.mitigationEffectiveness || [],
    },
    recommendations: (recommendations || []).map(r => ({
      ruleId:   r.ruleId,
      text:     r.text,
      zoneName: r.zoneName || r.triggerData?.zoneName,
      zoneCode: r.triggerData?.zoneCode,
      triggerSummary: r.triggerData ? {
        zoneName:       r.triggerData.zoneName,
        cellName:       r.triggerData.cellName,
        firstRedTime:   r.triggerData.firstRedTime,
        redDuration:    r.triggerData.redDuration,
        peakDensity:    r.triggerData.peakDensity,
        scenarioCount:  r.triggerData.scenarioCount,
        totalScenarios: r.triggerData.totalScenarios,
      } : null,
    })),
  };

  try {
    const result = await generatePlannerNarration(promptPayload);
    return res.status(200).json({
      success: true,
      narration: result.narration,
      model: result.model,
      source: result.source,
    });
  } catch (err) {
    console.error('[Planner] LLM narration error:', err.message);
    return res.status(500).json({
      success: false,
      narration: null,
      error: err.message,
    });
  }
});

module.exports = router;
