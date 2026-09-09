/**
 * backend/src/routes/assistant.js
 *
 * REST Endpoints for Control Room Assistant:
 * - POST /api/assistant/ask — Q&A follow-up grounded in live zone status, alerts, and gate states.
 * - GET  /api/assistant/instructions — Historical push instructions from audit log.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { CONTROL_ROOM_ASSISTANT_PROMPT } = require('../services/controlRoomAssistantPrompt');
const { getLiveOperationalContext, cleanAssistantText } = require('../services/controlRoomAssistant');
const { getActiveAlerts } = require('../services/escalationManager');
const { getAssistantInstructions } = require('../db/database');
const { matchLiveRules } = require('../services/controlRoomRules');

const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const CANDIDATE_MODELS = [
  DEFAULT_GROQ_MODEL,
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
  'openai/gpt-oss-20b',
];

/**
 * Synthesize a grounded, deterministic local response for Q&A without invoking external LLMs.
 * Answers are strictly built from live in-memory telemetry, gate states, active alerts, and weather.
 */
function synthesizeLocalAnswer(question, promptContext) {
  const q = question.toLowerCase();
  const { live_zones = [], active_alerts = [], gate_states = {}, matched_recommendations = [], environmental_condition } = promptContext;

  // 1. Gate inquiries
  if (q.includes('gate') || q.includes('entry') || q.includes('exit')) {
    const gateSummary = Object.entries(gate_states || {})
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v ? 'OPEN' : 'CLOSED'}`)
      .join(', ');
    const gateRecs = matched_recommendations
      .filter((m) => m.rule?.text?.toLowerCase().includes('gate'))
      .map((m) => `(${m.zoneId}) ${m.rule.text}`);
    
    if (gateRecs.length > 0) {
      return `Gates: ${gateSummary || 'Configured'}. Recommended Action: ${gateRecs.join('; ')}`;
    }
    return `Current gate status: ${gateSummary || 'All standard gates operational'}. No gate adjustments currently recommended.`;
  }

  // 2. Weather & environmental conditions
  if (q.includes('weather') || q.includes('rain') || q.includes('heat') || q.includes('temp') || q.includes('wind')) {
    if (environmental_condition) {
      const temp = environmental_condition.temperature || '28°C';
      const preset = environmental_condition.preset || 'Clear';
      const humidity = environmental_condition.humidity || '60%';
      return `Environmental status: Preset "${preset}", Temp ${temp}, Humidity ${humidity}. Conditions are stable with no environmental alerts.`;
    }
    return 'Environmental conditions are normal (Clear, 28°C).';
  }

  // 3. Active alerts / incidents / SOS
  if (q.includes('alert') || q.includes('sos') || q.includes('emergency') || q.includes('incident')) {
    if (!active_alerts || active_alerts.length === 0) {
      return 'There are currently no active unresolved alerts across monitored zones.';
    }
    const alertList = active_alerts.map((a) => `${a.zone_id} [${a.severity.toUpperCase()} - ${a.alert_type || 'Escalation'}]`);
    return `Active Alerts (${active_alerts.length}): ${alertList.join(', ')}. Personnel should prioritize highest severity zones.`;
  }

  // 4. Specific zone inquiries
  const matchedZone = live_zones.find((z) => {
    const zid = (z.zoneId || '').toLowerCase();
    return q.includes(zid) || (zid === 'zone_1' && q.includes('zone 1')) || (zid === 'zone_2' && q.includes('zone 2'));
  });

  if (matchedZone) {
    const rec = matched_recommendations.find((m) => m.zoneId === matchedZone.zoneId);
    const zoneName = matchedZone.zoneId === 'zone_2' ? 'Zone 2 (Corridor)' : matchedZone.zoneId === 'zone_1' ? 'Zone 1 (General)' : matchedZone.zoneId;
    let resText = `${zoneName} is currently ${matchedZone.risk_level.toUpperCase()} with density ${(matchedZone.density || 0).toFixed(2)} p/m².`;
    if (rec?.rule?.text) {
      resText += ` Protocol: ${rec.rule.text}`;
    }
    return resText;
  }

  // 5. General status / recommendations / what should we do
  if (matched_recommendations.length > 0) {
    const recSummaries = matched_recommendations.map((m) => `[${m.zoneId}] ${m.rule.text}`).join(' ');
    return `Current recommendations: ${recSummaries}`;
  }

  // Default summary based on highest risk zone
  const highestZone = live_zones.reduce((prev, curr) => {
    const rank = { red: 4, orange: 3, yellow: 2, green: 1 };
    return (rank[curr.risk_level] || 0) > (rank[prev?.risk_level] || 0) ? curr : prev;
  }, live_zones[0]);

  if (highestZone && highestZone.risk_level !== 'green') {
    return `Monitoring status: ${highestZone.zoneId} is at ${highestZone.risk_level.toUpperCase()} (${(highestZone.density || 0).toFixed(2)} p/m²). Standard monitoring protocols apply.`;
  }

  return 'All zones are operating within safe baseline parameters (Green). No critical crowd anomalies detected.';
}

/**
 * POST /api/assistant/ask
 * Grounded Q&A endpoint.
 * Body: { question: string, zoneId?: string }
 */
router.post('/assistant/ask', async (req, res) => {
  const { question, zoneId } = req.body || {};

  if (!question || typeof question !== 'string' || question.trim() === '') {
    return res.status(200).json({
      answer: 'Please provide a question regarding current zone safety, gates, or active alerts.',
      source: 'validation_fallback',
    });
  }

  // 1. Gather live operational context
  const liveContext = getLiveOperationalContext(zoneId);
  const activeAlerts = getActiveAlerts();

  // 2. Gather any matched rules for current zones
  const matchedRules = liveContext.zones.map((z) => {
    const match = matchLiveRules({
      zoneId: z.zoneId,
      severity: z.risk_level,
      density: z.density,
      trend_slope: z.trend_slope,
      flow_convergence: z.flow_convergence,
      flow_turbulence: z.flow_turbulence,
      panic_signature: z.panic_signature,
      exodus_signature: z.exodus_signature,
    });
    return {
      zoneId: z.zoneId,
      rule: match,
    };
  }).filter((m) => m.rule !== null);

  const promptContext = {
    live_zones: liveContext.zones,
    active_alerts: activeAlerts.map((a) => ({
      alert_id: a.alert_id,
      zone_id: a.zone_id,
      severity: a.severity,
      alert_type: a.alert_type,
      assigned_to: a.assigned_to,
      triggered_at: a.triggered_at,
    })),
    gate_states: liveContext.gateStates,
    matched_recommendations: matchedRules,
    environmental_condition: liveContext.weather,
  };

  // Check if running in local testing mode to avoid external LLM calls
  const isLocalTesting = (process.env.ASSISTANT_LOCAL_MODE || 'false').toLowerCase() === 'true';
  if (isLocalTesting) {
    const localAnswer = synthesizeLocalAnswer(question.trim(), promptContext);
    return res.status(200).json({
      answer: localAnswer,
      source: 'local_deterministic',
      model: 'local-testing-mode',
    });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_actual_groq_api_key')) {
    const localAnswer = synthesizeLocalAnswer(question.trim(), promptContext);
    return res.status(200).json({
      answer: localAnswer || "I can't reach the assistant right now. Check the dashboard directly for current zone status.",
      source: 'local_fallback',
      model: 'local-deterministic',
    });
  }

  const userMessage = `Current live operational context:\n\`\`\`json\n${JSON.stringify(promptContext, null, 2)}\n\`\`\`\n\nOfficial's Question: "${question.trim()}"\n\nProvide a concise, grounded answer based ONLY on the data above:`;

  for (const model of CANDIDATE_MODELS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout for Q&A

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 300,
          temperature: 0.1,
          messages: [
            { role: 'system', content: CONTROL_ROOM_ASSISTANT_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const cleanAnswer = cleanAssistantText(rawContent);

      if (cleanAnswer) {
        return res.status(200).json({
          answer: cleanAnswer,
          source: 'groq_llm',
          model: model,
        });
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[AssistantRoute] Model ${model} Q&A error:`, err.message);
    }
  }

  // Graceful deterministic fallback with HTTP 200 — never crash the UI
  const localAnswer = synthesizeLocalAnswer(question.trim(), promptContext);
  return res.status(200).json({
    answer: localAnswer || "I can't reach the assistant right now. Check the dashboard directly for current zone status.",
    source: 'deterministic_fallback',
    model: 'local-fallback',
  });
});

/**
 * GET /api/assistant/instructions
 * Fetch recent generated instructions from audit log
 */
router.get('/assistant/instructions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const instructions = await getAssistantInstructions(limit);
    return res.status(200).json({ instructions });
  } catch (err) {
    console.error('[AssistantRoute] GET instructions error:', err);
    return res.status(500).json({ error: 'Failed to fetch assistant instructions' });
  }
});

module.exports = router;
