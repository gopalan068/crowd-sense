/**
 * backend/src/services/controlRoomAssistant.js
 *
 * Push-First Control Room Assistant:
 * - Subscribes to system alerts, auto-escalations, and zone band transitions.
 * - Deterministically matches live rules (with complete triggerData).
 * - Invokes Groq LLM with a 2.5s strict timeout to generate short, plain-language action guidance.
 * - Falls back instantaneously to deterministic template on any LLM delay/failure.
 * - Broadcasts `assistant_instruction` over Socket.io and logs to SQLite audit log.
 * - Strictly additive & non-blocking: zero delay or interference to core alert pipelines.
 */
'use strict';

const { CONTROL_ROOM_ASSISTANT_PROMPT } = require('./controlRoomAssistantPrompt');
const { matchLiveRules } = require('./controlRoomRules');
const { insertAssistantInstruction } = require('../db/database');
const { getWeatherState } = require('./weatherService');

const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const CANDIDATE_MODELS = [
  DEFAULT_GROQ_MODEL,
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
  'openai/gpt-oss-20b',
];

// Rolling cache of active live status per zone for Q&A and transition tracking
const liveZoneCache = new Map();
const lastZoneRiskBands = new Map();

function generateInstructionId() {
  return `inst_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/**
 * Clean LLM response by stripping reasoning tags, headers, and quote artifacts
 */
function cleanAssistantText(text) {
  if (!text) return '';
  // 1. Strip complete <think>...</think> blocks
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // 2. If opening <think> remains without a closing tag, strip everything from <think>
  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*/gi, '').trim();
  }
  // 3. Strip any stray closing tags or drafting prefixes
  cleaned = cleaned.replace(/<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^(\*|\s)*drafting\s+[^\n:]+:\*?\s*/i, '');
  cleaned = cleaned.replace(/^(\*|\s)*(instruction|action|response|step|advisory)\s*\d*(\s*\([^)]*\))?:?\*?\s*/i, '');
  cleaned = cleaned.replace(/^Here'?s\s+a\s+thinking\s+process:?[\s\S]*?(?=\n\n|\n[A-Z0-9]|$)/i, '').trim();
  cleaned = cleaned.replace(/^["']|["']$/g, '').trim();

  // If text is still infected with think markers or empty, return empty string so caller uses deterministic fallback
  if (!cleaned || cleaned.includes('<think>') || cleaned.startsWith("Here's a thinking process")) {
    return '';
  }
  return cleaned;
}

/**
 * Build deterministic plain fallback instruction text
 */
function buildFallbackInstruction(zoneId, severity, matchedRecommendation, ruleContext = {}) {
  const zoneLabel = zoneId === 'zone_2' ? 'Zone 2 (Corridor)' : zoneId === 'zone_1' ? 'Zone 1 (General)' : zoneId;
  const recText = matchedRecommendation?.text || 'No specific system recommendation for this yet — use your judgment and standard procedure.';
  if (ruleContext.alert_type === 'citizen_report') {
    const categoryLabel = (ruleContext.category || 'Emergency SOS').replace(/_/g, ' ');
    return `Citizen Emergency Report (${categoryLabel}) in ${zoneLabel}. ${recText}`;
  }
  return `${zoneLabel} is now ${severity}. ${recText}`;
}

/**
 * Call Groq REST API with strict 2.5s timeout
 *
 * @param {Object} payload Structured event payload
 * @returns {Promise<{ text: string, model: string, source: string }>}
 */
async function callGroqAssistant(payload) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_actual_groq_api_key')) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const userContent = JSON.stringify(payload, null, 2);
  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s strict timeout

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 350,
          temperature: 0.1,
          messages: [
            { role: 'system', content: CONTROL_ROOM_ASSISTANT_PROMPT },
            {
              role: 'user',
              content: `Here is the live event payload:\n\`\`\`json\n${userContent}\n\`\`\`\n\nIMPORTANT: Output ONLY the direct 1-2 sentence instruction. DO NOT include any <think> tags, reasoning, drafting notes, or meta-commentary. Generate instruction now:`,
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[AssistantLLM] Model ${model} HTTP ${response.status}: ${errText}`);
        lastError = new Error(`Groq API (${model}) HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content || '';
      const clean = cleanAssistantText(rawText);

      if (!clean) {
        lastError = new Error('Empty completion from Groq model');
        continue;
      }

      return {
        text: clean,
        model: model,
        source: 'groq_llm',
      };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[AssistantLLM] Model ${model} failed (${err.message})`);
      lastError = err;
    }
  }

  throw lastError || new Error('All Groq model candidates failed');
}

/**
 * Process an event, generate short guidance instruction, log to DB, and emit via Socket.io.
 * Completely non-blocking and fail-safe.
 *
 * @param {Object} eventParams
 * @param {string} eventParams.eventType 'alert_triggered' | 'alert_escalated' | 'alert_panic' | 'threshold_crossed'
 * @param {string} eventParams.zoneId
 * @param {string} eventParams.severity 'green' | 'yellow' | 'orange' | 'red'
 * @param {Object} [eventParams.data]
 * @param {string} [eventParams.triggeringEventId]
 * @param {import('socket.io').Server} [io]
 */
async function processAssistantEvent({
  eventType,
  zoneId,
  severity,
  data = {},
  triggeringEventId = null,
}, io) {
  const instructionId = generateInstructionId();
  const timestamp = new Date().toISOString();

  // 1. Evaluate deterministic rule matching
  const ruleContext = {
    eventType,
    zoneId: zoneId || 'zone_1',
    severity: (severity || 'yellow').toLowerCase(),
    alert_type: data.alert_type || (eventType === 'alert_panic' ? 'immediate_panic_alert' : 'graduated_escalation'),
    category: data.category || null,
    description: data.description || null,
    reporter_name: data.reporter_name || null,
    density: data.density ?? null,
    trend_slope: data.trend_slope ?? null,
    flow_convergence: data.flow_convergence ?? null,
    flow_turbulence: data.flow_turbulence ?? null,
    panic_signature: Boolean(data.panic_signature),
    exodus_signature: Boolean(data.exodus_signature),
    gateStates: data.gateStates || { opening_gate_1: true, opening_gate_2: false },
    escalated_to: data.escalated_to || null,
    timeSinceTriggered: data.timeSinceTriggered || null,
  };

  const matchedRecommendation = matchLiveRules(ruleContext);

  // 2. Build structured payload for LLM and audit
  const structuredPayload = {
    eventType,
    zoneId: ruleContext.zoneId,
    severity: ruleContext.severity,
    alertType: ruleContext.alert_type,
    category: ruleContext.category,
    description: ruleContext.description,
    reporterName: ruleContext.reporter_name,
    data: {
      density: ruleContext.density,
      trend_slope: ruleContext.trend_slope,
      flow_convergence: ruleContext.flow_convergence,
      flow_turbulence: ruleContext.flow_turbulence,
      panic_signature: ruleContext.panic_signature,
      exodus_signature: ruleContext.exodus_signature,
      gateStates: ruleContext.gateStates,
      escalated_to: ruleContext.escalated_to,
      category: ruleContext.category,
      description: ruleContext.description,
    },
    matchedRecommendation: matchedRecommendation || null,
  };

  let instructionText = '';
  let source = 'deterministic_fallback';
  let modelName = 'local-rules-engine';

  const isLocalTesting = (process.env.ASSISTANT_LOCAL_MODE || 'false').toLowerCase() === 'true';

  if (isLocalTesting) {
    instructionText = buildFallbackInstruction(ruleContext.zoneId, ruleContext.severity, matchedRecommendation, ruleContext);
    source = 'local_deterministic';
    modelName = 'local-testing-mode';
  } else {
    // 3. Try LLM generation with strict timeout; fall back on error
    try {
      const llmResult = await callGroqAssistant(structuredPayload);
      instructionText = llmResult.text;
      source = llmResult.source;
      modelName = llmResult.model;
    } catch (llmErr) {
      console.warn(`[Assistant] LLM call unavailable (${llmErr.message}). Using deterministic fallback.`);
      instructionText = buildFallbackInstruction(ruleContext.zoneId, ruleContext.severity, matchedRecommendation, ruleContext);
    }
  }

  const instructionRecord = {
    instruction_id: instructionId,
    triggering_alert_id: triggeringEventId || null,
    zone_id: ruleContext.zoneId,
    text: instructionText,
    severity: ruleContext.severity,
    event_type: eventType,
    generated_at: timestamp,
    source,
    rule_id: matchedRecommendation?.ruleId || null,
    trigger_data: matchedRecommendation?.triggerData || null,
  };

  // 4. Persist to SQLite audit database
  try {
    await insertAssistantInstruction(instructionRecord);
  } catch (dbErr) {
    console.error('[Assistant] DB insert error:', dbErr.message);
  }

  // 5. Broadcast to dashboard via Socket.io
  if (io) {
    io.emit('assistant_instruction', {
      instructionId,
      zoneId: ruleContext.zoneId,
      eventType,
      text: instructionText,
      triggeringEventId,
      timestamp,
      severity: ruleContext.severity,
      ruleId: matchedRecommendation?.ruleId || null,
      source,
      alertType: ruleContext.alert_type,
      category: ruleContext.category,
    });
  }

  console.log(
    `[Assistant] 📢 Instruction pushed (${eventType} -> ${ruleContext.zoneId} [${ruleContext.severity}]): "${instructionText}" [${source}]`
  );

  return instructionRecord;
}

/**
 * Notify assistant of an incoming density reading and evaluate threshold crossings.
 *
 * @param {Object} socketPayload
 * @param {import('socket.io').Server} io
 */
function handleDensityReading(socketPayload, io) {
  const { zone_id, risk_level, density, trend_slope, flow_convergence, flow_turbulence, panic_signature, exodus_signature } = socketPayload;

  // Cache live status for Q&A
  liveZoneCache.set(zone_id, {
    ...socketPayload,
    cachedAt: new Date().toISOString(),
  });

  const prevBand = lastZoneRiskBands.get(zone_id) || 'green';
  lastZoneRiskBands.set(zone_id, risk_level);

  // If zone crossed into yellow, orange, or red from a different band, trigger threshold_crossed event
  if (prevBand !== risk_level && (risk_level === 'orange' || risk_level === 'red' || (risk_level === 'yellow' && prevBand === 'green'))) {
    // Non-blocking invocation
    setImmediate(() => {
      processAssistantEvent(
        {
          eventType: 'threshold_crossed',
          zoneId: zone_id,
          severity: risk_level,
          data: {
            density,
            trend_slope,
            flow_convergence,
            flow_turbulence,
            panic_signature,
            exodus_signature,
            gateStates: { opening_gate_1: true, opening_gate_2: false },
            previousBand: prevBand,
          },
          triggeringEventId: `threshold_${zone_id}_${risk_level}_${Date.now()}`,
        },
        io
      ).catch((err) => console.error('[Assistant] Threshold crossing error:', err));
    });
  }
}

/**
 * Notify assistant of an alert event (triggered, escalated, panic).
 *
 * @param {string} eventType 'alert_triggered' | 'alert_escalated' | 'alert_panic'
 * @param {Object} alert
 * @param {import('socket.io').Server} io
 */
function handleAlertEvent(eventType, alert, io) {
  if (!alert) return;

  const zoneData = liveZoneCache.get(alert.zone_id) || {};

  setImmediate(() => {
    processAssistantEvent(
      {
        eventType,
        zoneId: alert.zone_id,
        severity: alert.severity || 'red',
        data: {
          alert_type: alert.alert_type || (eventType === 'alert_panic' ? 'immediate_panic_alert' : 'graduated_escalation'),
          category: alert.category || null,
          description: alert.description || null,
          reporter_name: alert.reporter_name || null,
          density: zoneData.density ?? 2.5,
          trend_slope: zoneData.trend_slope ?? 0,
          flow_convergence: zoneData.flow_convergence ?? 0,
          flow_turbulence: zoneData.flow_turbulence ?? 0,
          panic_signature: alert.alert_type === 'immediate_panic_alert' || zoneData.panic_signature,
          exodus_signature: Boolean(zoneData.exodus_signature),
          gateStates: { opening_gate_1: true, opening_gate_2: false },
          escalated_to: alert.escalated_to || null,
          timeSinceTriggered: alert.triggered_at ? `${Math.round((Date.now() - new Date(alert.triggered_at).getTime()) / 1000)}s` : null,
        },
        triggeringEventId: alert.alert_id,
      },
      io
    ).catch((err) => console.error('[Assistant] Alert event error:', err));
  });
}

/**
 * Gather live operational context for the Q&A endpoint.
 * Explicitly tags simulated/demo-preset data as simulated.
 */
function getLiveOperationalContext(zoneId = null) {
  const zones = Array.from(liveZoneCache.entries()).map(([id, data]) => ({
    zoneId: id,
    risk_level: data.risk_level || 'green',
    risk_score: data.risk_score || 0.0,
    density: data.density || 0.0,
    trend_slope: data.trend_slope || 0.0,
    flow_convergence: data.flow_convergence || 0.0,
    flow_turbulence: data.flow_turbulence || 0.0,
    panic_signature: Boolean(data.panic_signature),
    exodus_signature: Boolean(data.exodus_signature),
  }));

  const weather = getWeatherState();

  return {
    timestamp: new Date().toISOString(),
    zones,
    gateStates: {
      'Emergency Gate 1': 'OPEN (North concourse flow active)',
      'Emergency Gate 2': 'CLOSED (Overflow gate on standby)',
    },
    weather: {
      condition: weather.condition,
      label: weather.label,
      temperature_c: weather.temperature_c,
      is_simulated: true,
      data_source_note: 'PRESENTER DEMO PRESET (Simulated environmental control — not a live sensor reading)',
    },
    requestedZoneFilter: zoneId || 'all',
  };
}

module.exports = {
  processAssistantEvent,
  handleDensityReading,
  handleAlertEvent,
  getLiveOperationalContext,
  callGroqAssistant,
  cleanAssistantText,
};
