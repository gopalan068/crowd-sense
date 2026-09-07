/**
 * backend/src/services/groqPlaybookService.js
 * Incident Response Playbook Prioritization Narrative Engine.
 *
 * Task 3: Generates a concise 2-3 sentence contextual prioritization note
 * for incident commanders and field responders using the Groq REST API:
 * 1. qwen/qwen3.8-27b (Default / Primary)
 * 2. qwen/qwen3.6-27b
 * 3. openai/gpt-oss-20b
 *
 * CORE PRINCIPLES:
 * - Strictly generates contextual prioritization framing for existing static NDMA protocols.
 * - Never hallucinates, alters, or omits action steps or resource numbers.
 * - Guaranteed zero-downtime deterministic fallback if Groq API is offline or unconfigured.
 */
'use strict';

const DEFAULT_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

const CANDIDATE_MODELS = [
  DEFAULT_MODEL,
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
  'openai/gpt-oss-20b',
];

/**
 * Clean LLM response by stripping reasoning tags, drafting metadata headers, and markdown artifacts.
 * @param {string} text
 * @returns {string}
 */
function cleanNarrativeOutput(text) {
  if (!text) return '';
  // 1. Strip <think> reasoning tags
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*/gi, '').trim();
  }

  // 2. Only strip leading meta-prefixes at the start of string
  cleaned = cleaned.replace(/^(\*|\s)*drafting\s+[^\n:]+:\*?\s*/i, '');
  cleaned = cleaned.replace(/^(\*|\s)*(sentence|step|note|advisory)\s*\d*(\s*\([^)]*\))?:?\*?\s*/i, '');
  cleaned = cleaned.replace(/^(\*|\#|\>|\-\s)+/, '');

  // 3. Strip surrounding quotation marks if double wrapped
  cleaned = cleaned.trim().replace(/^["']|["']$/g, '').trim();

  return cleaned || text.trim();
}

/**
 * Generate local deterministic framing fallback when Groq API is unavailable.
 *
 * @param {Object} playbook
 * @param {Object} shortfall
 * @param {Object} weatherState
 * @returns {string}
 */
function generateDeterministicFallbackNarrative(playbook, shortfall, weatherState) {
  const zoneLabel = shortfall?.zone_label || 'incident sector';
  const weatherLabel = weatherState?.current_condition?.label || 'standard conditions';
  const hasShortfall = shortfall?.is_shortfall === true;
  const topStep = playbook?.immediate_actions?.[0] || 'Execute primary response action';

  if (hasShortfall) {
    return `Operational Priority: Initiate ${topStep.toLowerCase()} immediately while requesting backup for the ${shortfall.shortfall_count}-responder shortfall in ${zoneLabel}. Environmental state (${weatherLabel}) elevates urgency—verify egress conduits without delay. (Decision support: on-ground command makes final call).`;
  }

  return `Operational Priority: Current checked-in personnel in ${zoneLabel} meet recommended staffing (${shortfall.checked_in_personnel}/${shortfall.required_personnel}). Focus immediately on ${topStep.toLowerCase()} under current ${weatherLabel}. (Decision support: on-ground command makes final call).`;
}

/**
 * Build system prompt for Task 3 playbook prioritization narrative
 */
function buildPlaybookSystemPrompt() {
  return `You are a Crowd Safety Decision Support Advisor.
Your role is to write a CONCISE 2-3 SENTENCE contextual prioritization note for incident commanders and field responders.

HARD BOUNDARIES & GROUNDING RULES:
1. Use ONLY the provided static action steps and resource numbers.
2. NEVER invent new steps, numbers, or protocols.
3. NEVER alter or contradict the static protocol.
4. Focus on WHICH existing step to prioritize given the live density, weather condition, and responder shortfall.
5. Emphasize that final operational calls rest with on-scene personnel.
6. Keep output to EXACTLY 2 to 3 sentences. Direct response ONLY. NO sentence labels, NO drafting notes, NO headings, NO bullet points, and NO <think> tags.`;
}

/**
 * Request contextual narrative framing from Groq REST API or fallback.
 *
 * @param {Object} params
 * @param {Object} params.playbook Static playbook entry
 * @param {Object} params.shortfall Resource evaluation object
 * @param {Object} [params.weatherState] Live environmental conditions
 * @param {Object} [params.alert] Original alert payload
 * @returns {Promise<{ narrative: string, source: string, model: string }>}
 */
async function generateContextualNarrative({ playbook, shortfall, weatherState, alert }) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_actual_groq_api_key')) {
    return {
      narrative: generateDeterministicFallbackNarrative(playbook, shortfall, weatherState),
      source: 'deterministic_fallback',
      model: 'local-rules-engine',
    };
  }

  const systemPrompt = buildPlaybookSystemPrompt();
  const userContent = JSON.stringify({
    protocol_title: playbook?.title,
    authority_source: playbook?.source,
    static_action_steps: playbook?.immediate_actions,
    required_personnel: shortfall?.required_personnel,
    checked_in_personnel: shortfall?.checked_in_personnel,
    shortfall_count: shortfall?.shortfall_count,
    is_shortfall: shortfall?.is_shortfall,
    zone: shortfall?.zone_label,
    environmental_condition: weatherState?.current_condition?.label || 'Clear / Normal',
    temperature_c: weatherState?.current_condition?.temperature_c || 28,
  }, null, 2);

  const modelsToTry = [...new Set(CANDIDATE_MODELS)];
  let lastError = null;

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      console.log(`[GroqPlaybook] Requesting narrative from Groq model: ${model}...`);
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 400,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Here is the static playbook and current live context:\n\n${userContent}\n\nProvide ONLY the direct 2-3 sentence prioritization text now (no labels, no drafting notes):`,
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.text();
        console.warn(`[GroqPlaybook] Model ${model} HTTP ${response.status}: ${errData}`);
        lastError = new Error(`Groq API (${model}) HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const cleanContent = cleanNarrativeOutput(rawContent);

      if (!cleanContent) {
        console.warn(`[GroqPlaybook] Model ${model} returned empty completion.`);
        lastError = new Error(`Empty completion from Groq model ${model}`);
        continue;
      }

      console.log(`[GroqPlaybook] ✓ Successfully generated narrative via Groq (${model})`);
      return {
        narrative: cleanContent,
        source: 'groq_llm',
        model: model,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[GroqPlaybook] Model ${model} error:`, err.message);
      lastError = err;
    }
  }

  console.warn(`[GroqPlaybook] LLM narrative generation unavailable (${lastError?.message}). Using deterministic fallback.`);
  return {
    narrative: generateDeterministicFallbackNarrative(playbook, shortfall, weatherState),
    source: 'deterministic_fallback',
    model: 'local-rules-engine',
  };
}

module.exports = {
  generateContextualNarrative,
  generateDeterministicFallbackNarrative,
  cleanNarrativeOutput,
  stripThinkingTags: cleanNarrativeOutput,
};
