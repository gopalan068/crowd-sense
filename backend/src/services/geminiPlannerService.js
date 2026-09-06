/**
 * backend/src/services/geminiPlannerService.js
 * Pre-Event Bottleneck Analysis LLM Narrative Generator & Synthesis Engine.
 *
 * Integrates directly with the CrowdSense multi-tier LLM pipeline:
 * 1. Primary: Google Gemini REST API (gemini-3.5-flash, gemini-2.5-flash, gemini-3.6-flash, etc.)
 * 2. Secondary: Groq API fallback (openai/gpt-oss-120b, llama-3.3-70b-versatile, llama3-8b-8192)
 * 3. Tertiary: Local Deterministic Planner Synthesis Fallback (guaranteed zero-downtime, fully honest)
 *
 * HARD GROUNDING & SAFETY CONSTRAINTS:
 * - Only rephrases and organizes the provided deterministic simulation findings.
 * - Never hallucinates or invents additional numbers, scenarios, or recommendations.
 * - Strips all <think>...</think> reasoning tags and drafting artifacts.
 */
'use strict';

let Groq;
try {
  Groq = require('groq-sdk');
} catch {
  Groq = null;
}

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const CANDIDATE_GEMINI_MODELS = [
  DEFAULT_GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

/**
 * Strip reasoning tags and cleaning artifacts
 */
function cleanNarrationOutput(text) {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // If think tag is unclosed, strip from <think> onwards only if it started with <think>
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
 * Build standard system prompt for planner narrative
 */
function buildPlannerSystemPrompt() {
  return `You are a Crowd Safety Planning Assistant helping venue operators understand pre-event bottleneck simulation findings.

You will receive structured JSON containing:
1. bottleneckResults — computed analysis of which areas reached critical density in which scenarios, with timestamps and durations
2. recommendations — deterministic rule-based mitigation findings already computed by the system
3. venueName — the venue being analyzed
4. scenariosRun — list of scenario labels evaluated

CRITICAL GROUNDING RULES:
- Write a clear, professional, multi-paragraph narrative (3-5 paragraphs) summarizing these findings for a venue safety officer.
- Structure your response logically: 
  1. Executive Summary & Overall Risk Posture
  2. Persistent vs Conditional Bottlenecks (cite exact cell coordinates, first-red times, peak densities, or scenario triggers)
  3. Actionable Mitigations & Layout Interventions
- Reference ONLY the specific numbers and rules provided in the input payload.
- Do NOT invent additional numbers, scenarios, or safety recommendations not present in the input.
- Do NOT overstate certainty — these are simplified-physics simulations intended as planning aids, not certified risk assessments.
- End with one concluding sentence acknowledging that these are simulation-based planning insights requiring expert on-ground review.
- Avoid raw JSON code blocks or drafting tags in the output. Keep under 500 words.`;
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
  const userMessage = `Here are the structured pre-event simulation results for ${promptPayload.venueName || 'the venue'}:\n\n\`\`\`json\n${JSON.stringify(promptPayload, null, 2)}\n\`\`\`\n\nPlease generate the comprehensive planning narrative now:`;

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
            maxOutputTokens: 8192, // Ample token capacity so internal reasoning never truncates output
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

      // Extract all text parts across parts array
      const rawText = (candidate?.content?.parts || []).map(p => p.text || '').join('');
      const cleanText = cleanNarrationOutput(rawText);

      if (!cleanText || finishReason === 'MAX_TOKENS') {
        console.warn(`[GeminiPlanner] Model ${model} returned incomplete completion (finishReason: ${finishReason}). Retrying next model.`);
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
 * Call Groq API Fallback
 */
async function callGroqPlanner(promptPayload) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GROQ_API_KEY is not configured in environment.');
  }

  if (!Groq) {
    throw new Error('Groq SDK is not installed or available.');
  }

  const groqClient = new Groq({ apiKey: apiKey.trim() });
  const systemPrompt = buildPlannerSystemPrompt();
  const modelsToTry = [
    DEFAULT_GROQ_MODEL,
    'llama-3.3-70b-versatile',
    'llama3-8b-8192',
  ];

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      console.log(`[GroqPlanner] Requesting narrative from Groq model: ${model}...`);
      const completion = await groqClient.chat.completions.create({
        model: model,
        max_tokens: 2048,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Please narrate the following crowd simulation analysis findings:\n\n${JSON.stringify(promptPayload, null, 2)}`,
          },
        ],
      });

      const raw = completion.choices?.[0]?.message?.content || '';
      const clean = cleanNarrationOutput(raw);

      if (clean) {
        console.log(`[GroqPlanner] ✓ Successfully generated narrative via Groq (${model})`);
        return {
          narration: clean,
          model: model,
          source: 'groq_llm',
        };
      }
    } catch (err) {
      console.warn(`[GroqPlanner] Model ${model} failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All Groq model candidates failed.');
}

/**
 * Local Deterministic Planner Synthesis Fallback
 * Guaranteed zero-failure honest synthesis constructed purely from computed data.
 */
function generateLocalDeterministicPlannerSummary(promptPayload) {
  const { venueName, scenariosRun, bottleneckResults, recommendations } = promptPayload;
  const pCount = bottleneckResults?.persistentBottleneckCount || 0;
  const cCount = bottleneckResults?.conditionalBottleneckCount || 0;
  const topP = bottleneckResults?.topPersistentCells || [];
  const topC = bottleneckResults?.topConditionalCells || [];
  const recs = recommendations || [];

  const lines = [];

  // 1. Executive Summary
  lines.push(`**Executive Summary — Pre-Event Simulation Analysis for ${venueName || 'Venue'}**\n`);
  lines.push(`Across ${scenariosRun?.length || 1} evaluated simulation scenario(s) (${(scenariosRun || ['Standard Simulation']).join(', ')}), the analysis identified **${pCount} persistent bottleneck zone(s)** and **${cCount} conditional bottleneck zone(s)** reaching or exceeding critical density thresholds (≥ 3.5 p/m²).`);

  // 2. Bottleneck Zones
  if (pCount > 0 || cCount > 0) {
    lines.push(`\n**Identified Critical Zones:**`);
    if (topP.length > 0) {
      const pDesc = topP.map(c => `Cell [${c.x}, ${c.y}] (first reached critical density at T+${Math.round(c.firstRedTime || 0)}s, sustained for ${Math.round(c.redDuration || 0)}s, peak density ${c.peakDensity?.toFixed(2) || '3.50+'} p/m²)`).join('; ');
      lines.push(`- **Persistent Bottlenecks (occurred in all standard scenarios):** ${pDesc}.`);
    }
    if (topC.length > 0) {
      const cDesc = topC.map(c => `Cell [${c.x}, ${c.y}] (active under stress conditions in ${c.scenarioCount}/${c.totalScenarios || scenariosRun?.length || 1} scenarios, peak density ${c.peakDensity?.toFixed(2) || '3.50+'} p/m²)`).join('; ');
      lines.push(`- **Conditional Bottlenecks (scenario-specific spikes):** ${cDesc}.`);
    }
  } else {
    lines.push(`\nNo sustained critical density bottlenecks were detected under the tested flow conditions. Crowd movement remained within safe volumetric tolerances.`);
  }

  // 3. Mitigations
  if (recs.length > 0) {
    lines.push(`\n**Recommended Mitigation Actions:**`);
    recs.forEach((r, idx) => {
      lines.push(`${idx + 1}. **${r.ruleId.replace(/_/g, ' ')}**: ${r.text}`);
    });
  }

  lines.push(`\n*Note: These findings are derived from simplified-physics Social Force Model simulations and serve as decision-support planning insights requiring professional on-ground validation.*`);

  return {
    narration: lines.join('\n'),
    model: 'local-rules-engine',
    source: 'deterministic_fallback',
  };
}

/**
 * Unified Narration Pipeline
 * Executes: Gemini -> Groq -> Local Deterministic Fallback
 */
async function generatePlannerNarration(promptPayload) {
  // 1. Try Google Gemini API
  try {
    return await callGeminiPlanner(promptPayload);
  } catch (geminiErr) {
    console.warn(`[PlannerLLM] Gemini pipeline failed (${geminiErr.message}). Attempting Groq fallback...`);
  }

  // 2. Try Groq Fallback
  try {
    return await callGroqPlanner(promptPayload);
  } catch (groqErr) {
    console.warn(`[PlannerLLM] Groq pipeline failed (${groqErr.message}). Using local deterministic synthesis fallback...`);
  }

  // 3. Guaranteed Local Deterministic Synthesis Fallback
  return generateLocalDeterministicPlannerSummary(promptPayload);
}

module.exports = {
  generatePlannerNarration,
  callGeminiPlanner,
  callGroqPlanner,
  generateLocalDeterministicPlannerSummary,
  cleanNarrationOutput,
};
