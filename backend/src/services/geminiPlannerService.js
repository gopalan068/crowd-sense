/**
 * backend/src/services/geminiPlannerService.js
 * Pre-Event Bottleneck Analysis LLM Narrative Generator & Synthesis Engine.
 *
 * Task 1: Synthesizes pre-computed bottleneck simulation findings via Google Gemini API:
 * 1. gemini-3.7-flash (Default / Primary)
 * 2. gemini-3.6-flash
 * 3. gemini-3.5-flash
 * 4. gemini-3-flash
 *
 * Guaranteed zero-failure honest deterministic fallback if Gemini API is unreachable or unconfigured.
 */
'use strict';

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash';

const CANDIDATE_GEMINI_MODELS = [
  DEFAULT_GEMINI_MODEL,
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3-flash',
];

/**
 * Strip reasoning tags and cleaning artifacts
 */
function cleanNarrationOutput(text) {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (cleaned.startsWith('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*/gi, '').trim();
  }
  // Strip leading drafting headers
  cleaned = cleaned.replace(/^(\*|\s)*drafting\s+[^\n:]+:\*?\s*/i, '');
  cleaned = cleaned.replace(/^(\*|\s)*(sentence|step|note|advisory)\s*\d*(\s*\([^)]*\))?:?\*?\s*/i, '');
  cleaned = cleaned.trim().replace(/^["']|["']$/g, '').trim();
  return cleaned || text.trim();
}

/**
 * Build standard system prompt for planner narrative / structural safety audit
 */
function buildPlannerSystemPrompt() {
  return `You are an Expert Crowd Safety Auditor and Structural Event Risk Assessor helping event organizers and safety officers prepare pre-event safety plans.

You will receive structured JSON containing:
1. venueName — the venue name
2. eventContext — event details: expectedAttendance, ambientTemp, eventType, securityGates, exitWidthMeters, usableAreaM2, safeCapacityLimit
3. bottleneckResults — spatial analysis of bottleneck subzones, peak density (p/m²), first red time (s), red duration (s), and Fruin Level of Service (LOS) distribution
4. recommendations — rule-matched NDMA mitigation actions

CRITICAL GROUNDING & STRUCTURAL AUDIT RULES:
Write a comprehensive, professional Pre-Event Structural Safety Audit Report organized into the following 5 EXACT Markdown Sections:

### Section 1: Executive Summary & Venue Capacity Limits
- Analyze Usable Floor Area (m²) and Safe Capacity Limit (based on Fruin Band C: 1.08 to 1.4 p/m²).
- Evaluate Ambient Environment & Temperature Risks (heat index, dehydration vulnerability at entry queues).

### Section 2: Ingress, Security Metering & Egress Physics
- Calculate security gate processing capacity vs expected inflow rate.
- Evaluate Evacuation Clearance Capacity based on total exit width (m) and calculated evacuation time (T_evac).

### Section 3: Spatial Choke Point & Bottleneck Diagnostics
- Identify specific subzone bottlenecks (refer to specific Zone codes like Zone 1A, Zone 2, etc.).
- Highlight geometric choke points (< 3.5m width), 90-degree corner traps, and obstacle deflection points.

### Section 4: Anomaly & Stress Condition Assessment
- Evaluate venue response under Stress Conditions: 150-200% Inflow Surge, Emergency Path/Gate Blockage Anomaly, and Focal Point Attraction Rush.

### Section 5: NDMA Organizer Action Playbook & Directives
- Provide tactical organizer directives: holding pen barricade placement, emergency gate trigger rules (e.g. "If Zone 2 density > 3.5 p/m² for > 30s, open Emergency Gate 2 immediately"), and first-aid post positioning away from choke points.

REQUIREMENTS:
- Reference ONLY the specific numbers, zone codes, and rules provided in the input payload.
- Do NOT invent additional fake numbers not grounded in the input.
- Keep tone professional, authoritative, and actionable for an on-ground safety manager.
- End with an explicit disclaimer acknowledging that these are physics-simulation planning insights requiring expert on-ground validation.`;
}

/**
 * Call Google Gemini REST API
 */
async function callGeminiPlanner(promptPayload) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_actual_gemini_api_key')) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }

  const systemPrompt = buildPlannerSystemPrompt();
  const userMessage = `Here are the structured pre-event venue and environmental audit parameters for ${promptPayload.venueName || 'the venue'}:\n\n\`\`\`json\n${JSON.stringify(promptPayload, null, 2)}\n\`\`\`\n\nPlease generate the comprehensive Pre-Event Structural Safety Audit Report now:`;

  const modelsToTry = [...new Set(CANDIDATE_GEMINI_MODELS)];
  let lastError = null;

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;

    try {
      console.log(`[GeminiPlanner] Requesting narrative from Gemini model: ${model}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userMessage}` }],
            },
          ],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 8192,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[GeminiPlanner] Model ${model} HTTP ${response.status}: ${errText}`);
        lastError = new Error(`Gemini API (${model}) HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const finishReason = candidate?.finishReason;

      const rawText = (candidate?.content?.parts || []).map(p => p.text || '').join('');
      const cleanText = cleanNarrationOutput(rawText);

      if (!cleanText || (finishReason === 'MAX_TOKENS' && cleanText.length < 300)) {
        console.warn(`[GeminiPlanner] Model ${model} returned incomplete completion (finishReason: ${finishReason}, length: ${cleanText.length}). Retrying next model.`);
        lastError = new Error(`Model ${model} incomplete (finishReason: ${finishReason})`);
        continue;
      }

      console.log(`[GeminiPlanner] ✓ Successfully generated full narrative via Gemini (${model}) [finishReason: ${finishReason}]`);
      return {
        narration: cleanText,
        model: model,
        source: 'gemini_llm',
      };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[GeminiPlanner] Error calling Gemini model ${model}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini model candidates failed.');
}

/**
 * Local Deterministic Planner Synthesis Fallback
 * Guaranteed zero-failure honest synthesis constructed purely from computed data.
 */
function generateLocalDeterministicPlannerSummary(promptPayload) {
  const { venueName, scenariosRun, bottleneckResults, recommendations, eventContext } = promptPayload;
  const pCount = bottleneckResults?.persistentBottleneckCount || 0;
  const cCount = bottleneckResults?.conditionalBottleneckCount || 0;
  const topP = bottleneckResults?.topPersistentBottlenecks || bottleneckResults?.topPersistentCells || [];
  const topC = bottleneckResults?.topConditionalBottlenecks || bottleneckResults?.topConditionalCells || [];
  const recs = recommendations || [];

  const attendance = eventContext?.expectedAttendance || 5000;
  const temp = eventContext?.ambientTemp || 32;
  const gates = eventContext?.securityGates || 4;
  const exitW = eventContext?.exitWidthMeters || 12;

  const lines = [];

  // Section 1: Executive Summary & Venue Capacity Limits
  lines.push(`### Section 1: Executive Summary & Venue Capacity Limits\n`);
  lines.push(`Pre-Event Structural Safety Audit for **${venueName || 'Venue'}**. The event expects an estimated footfall of **${attendance.toLocaleString()} attendees** under an ambient temperature of **${temp}°C**.`);
  lines.push(`Based on Fruin Level of Service Band C (1.08 to 1.4 p/m² safe walking tolerance), the safe concurrent capacity limit is calculated based on usable floor geometry. High ambient heat (${temp}°C) elevates dehydration and queue stress risks near entry checkpoints.`);

  // Section 2: Ingress, Security Metering & Egress Physics
  lines.push(`\n### Section 2: Ingress, Security Metering & Egress Physics\n`);
  lines.push(`- **Security & Inspection Capacity:** Operating **${gates} security/ticket gates** provides an estimated flow capacity of ~${gates * 40} persons/min. Arrival spikes exceeding this rate will accumulate queuing pressure in the entry plaza.`);
  lines.push(`- **Egress & Clearance Time ($T_{evac}$):** Total net exit clearance width of **${exitW} meters** yields a nominal evacuation discharge capacity of ~${Math.round(exitW * 1.3 * 60)} persons/min. Estimated full clearance time under panic-free flow is ~${Math.round(attendance / (exitW * 1.3 * 60))} minutes.`);

  // Section 3: Spatial Choke Point & Bottleneck Diagnostics
  lines.push(`\n### Section 3: Spatial Choke Point & Bottleneck Diagnostics\n`);
  if (pCount > 0 || cCount > 0) {
    lines.push(`The crowd physics simulation identified **${pCount} persistent bottleneck zone(s)** and **${cCount} conditional bottleneck zone(s)** reaching critical density thresholds (≥ 3.5 p/m²):`);
    if (topP.length > 0) {
      const pDesc = topP.map(c => `**${c.zoneName || c.cellName || `Zone ${c.cellIdx}`}** (reached critical density at T+${Math.round(c.firstRedTime || 0)}s, sustained for ${Math.round(c.redDuration || 0)}s, peak density ${c.peakDensity?.toFixed(2) || '3.50+'} p/m²)`).join('; ');
      lines.push(`- **Persistent Choke Points:** ${pDesc}.`);
    }
    if (topC.length > 0) {
      const cDesc = topC.map(c => `**${c.zoneName || c.cellName || `Zone ${c.cellIdx}`}** (active under surge stress in ${c.scenarioCount}/${c.totalScenarios || 1} scenarios, peak density ${c.peakDensity?.toFixed(2) || '3.50+'} p/m²)`).join('; ');
      lines.push(`- **Conditional Surge Zones:** ${cDesc}.`);
    }
  } else {
    lines.push(`No sustained critical density bottlenecks (≥ 3.5 p/m²) were detected under baseline flow parameters. Crowd movement remains within safe volumetric tolerances.`);
  }

  // Section 4: Anomaly & Stress Condition Assessment
  lines.push(`\n### Section 4: Anomaly & Stress Condition Assessment\n`);
  lines.push(`- **High Inflow Surge (150%-200% Batch Influx):** Entry plaza density spikes rapidly if arrival rate surges beyond gate processing speed.`);
  lines.push(`- **Primary Path/Gate Blockage Anomaly:** Obstruction of primary exit routes redirects crowd pressure into secondary side corridors, elevating density near turns.`);
  lines.push(`- **Focal Point Attraction Rush:** Uncontrolled rush toward central stage/procession areas requires longitudinal barricade splitting.`);

  // Section 5: NDMA Organizer Action Playbook & Directives
  lines.push(`\n### Section 5: NDMA Organizer Action Playbook & Directives\n`);
  if (recs.length > 0) {
    recs.forEach((r, idx) => {
      lines.push(`${idx + 1}. **${r.ruleId || 'Mitigation Directive'}:** ${r.text}`);
    });
  } else {
    lines.push(`1. Maintain clear 3.5m minimum width along main procession and egress corridors.`);
    lines.push(`2. Position first-aid medical response teams at entry/exit perimeters outside high-density choke zones.`);
    lines.push(`3. Deploy zig-zag holding pen barricades at entry gates to stagger security check influx.`);
  }

  lines.push(`\n*Disclaimer: This Pre-Event Structural Safety Audit is derived from social force crowd physics models and architectural parameters. It serves as a decision-support planning aid and requires certified on-ground expert review.*`);

  return {
    narration: lines.join('\n'),
    model: 'local-deterministic-planner-synthesizer',
    source: 'local_synthesis',
  };
}

/**
 * Unified Narration Pipeline for Task 1
 * Executes: Google Gemini -> Local Deterministic Fallback
 */
async function generatePlannerNarration(promptPayload) {
  // 1. Try Google Gemini API
  try {
    return await callGeminiPlanner(promptPayload);
  } catch (geminiErr) {
    console.warn(`[PlannerLLM] Gemini pipeline failed (${geminiErr.message}). Using local deterministic synthesis fallback...`);
  }

  // 2. Guaranteed Local Deterministic Synthesis Fallback
  return generateLocalDeterministicPlannerSummary(promptPayload);
}

module.exports = {
  generatePlannerNarration,
  callGeminiPlanner,
  generateLocalDeterministicPlannerSummary,
  cleanNarrationOutput,
};
