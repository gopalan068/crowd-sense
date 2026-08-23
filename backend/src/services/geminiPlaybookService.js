/**
 * backend/src/services/geminiPlaybookService.js
 * Gemini LLM Contextual Narrative Wrapper for Response Playbooks.
 *
 * CORE PRINCIPLE:
 * Gemini is strictly used ONLY to generate a concise 2-3 sentence contextual
 * prioritization wrapper on top of the static playbook data.
 * It is FORBIDDEN from inventing, omitting, or modifying action steps or resource counts.
 *
 * Provides a guaranteed deterministic fallback if Gemini API is unavailable or unconfigured.
 */
'use strict';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const CANDIDATE_MODELS = [
  DEFAULT_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash',
];

/**
 * Strip any <think>...</think> reasoning tags emitted by reasoning models.
 * @param {string} text
 * @returns {string}
 */
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

  // 2. Only strip leading meta-prefixes at the VERY START of the string (NO global /g flag)
  // Prevents stripping valid words ("context", "step", "note") or zone names in the body text.
  cleaned = cleaned.replace(/^(\*|\s)*drafting\s+[^\n:]+:\*?\s*/i, '');
  cleaned = cleaned.replace(/^(\*|\s)*(sentence|step|note|advisory)\s*\d*(\s*\([^)]*\))?:?\*?\s*/i, '');
  cleaned = cleaned.replace(/^(\*|\#|\>|\-\s)+/, '');

  // 3. Strip surrounding quotation marks if double wrapped
  cleaned = cleaned.trim().replace(/^["']|["']$/g, '').trim();

  return cleaned || text.trim();
}

/**
 * Generate local deterministic framing fallback when Gemini is unavailable.
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
 * Request contextual narrative framing from Gemini LLM or fallback.
 *
 * @param {Object} params
 * @param {Object} params.playbook Static playbook entry
 * @param {Object} params.shortfall Resource evaluation object
 * @param {Object} [params.weatherState] Live environmental conditions
 * @param {Object} [params.alert] Original alert payload
 * @returns {Promise<{ narrative: string, source: string, model: string }>}
 */
async function generateContextualNarrative({ playbook, shortfall, weatherState, alert }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_actual_gemini_api_key')) {
    return {
      narrative: generateDeterministicFallbackNarrative(playbook, shortfall, weatherState),
      source: 'deterministic_fallback',
      model: 'local-rules-engine',
    };
  }

  const systemPrompt = `You are a Crowd Safety Decision Support Advisor.
Your role is to write a CONCISE 2-3 SENTENCE contextual prioritization note for incident commanders and field responders.

HARD BOUNDARIES & GROUNDING RULES:
1. Use ONLY the provided static action steps and resource numbers.
2. NEVER invent new steps, numbers, or protocols.
3. NEVER alter or contradict the static protocol.
4. Focus on WHICH existing step to prioritize given the live density, weather condition, and responder shortfall.
5. Emphasize that final operational calls rest with on-scene personnel.
6. Keep output to EXACTLY 2 to 3 sentences. Direct response ONLY. NO sentence labels, NO drafting notes, NO headings, NO bullet points, and NO <think> tags.`;

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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${systemPrompt}\n\nHere is the static playbook and current live context:\n\n${userContent}\n\nProvide ONLY the direct 2-3 sentence prioritization text now (no labels, no drafting notes):` },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1000,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[GeminiPlaybook] Model ${model} HTTP ${response.status}: ${errText}`);
        lastError = new Error(`Gemini API (${model}) HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleanContent = cleanNarrativeOutput(rawContent);

      if (!cleanContent) {
        console.warn(`[GeminiPlaybook] Model ${model} returned empty completion.`);
        lastError = new Error('Empty completion from Gemini API');
        continue;
      }

      return {
        narrative: cleanContent,
        source: 'gemini_llm',
        model: model,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
    }
  }

  console.warn(`[GeminiPlaybook] LLM narrative generation unavailable (${lastError?.message}). Using deterministic fallback.`);
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
