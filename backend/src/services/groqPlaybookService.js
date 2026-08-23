/**
 * backend/src/services/groqPlaybookService.js
 * Groq LLM Contextual Narrative Wrapper for Response Playbooks.
 *
 * CORE PRINCIPLE:
 * Groq is strictly used ONLY to generate a concise 2-3 sentence contextual
 * prioritization wrapper on top of the static playbook data.
 * It is FORBIDDEN from inventing, omitting, or modifying action steps or resource counts.
 *
 * Provides a guaranteed deterministic fallback if Groq API is unavailable or unconfigured.
 */
'use strict';

const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/**
 * Generate local deterministic framing fallback when Groq is unavailable.
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
 * Request contextual narrative framing from Groq LLM or fallback.
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

  if (!apiKey || apiKey.trim() === '') {
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
6. Keep output to EXACTLY 2 to 3 sentences. No headings, no bullet points.`;

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout for snappy UI response

  try {
    const response = await fetch(GROQ_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is the static playbook and current live context:\n\n${userContent}\n\nGenerate the 2-3 sentence prioritization advisory now:` },
        ],
        temperature: 0.2,
        max_tokens: 250,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Groq API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('Empty completion from Groq API');
    }

    return {
      narrative: content,
      source: 'groq_llm',
      model: data.model || DEFAULT_MODEL,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[GroqPlaybook] LLM narrative generation unavailable (${err.message}). Using deterministic fallback.`);
    return {
      narrative: generateDeterministicFallbackNarrative(playbook, shortfall, weatherState),
      source: 'deterministic_fallback',
      model: 'local-rules-engine',
    };
  }
}

module.exports = {
  generateContextualNarrative,
  generateDeterministicFallbackNarrative,
};
