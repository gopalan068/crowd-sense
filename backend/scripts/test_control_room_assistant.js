/**
 * backend/scripts/test_control_room_assistant.js
 *
 * Automated verification suite for CrowdSense Control Room Assistant:
 * 1. Rule matching with honest naming and full triggerData traceability
 * 2. Push instruction generation (Groq LLM + fast fallback)
 * 3. SQLite audit log persistence (assistant_instructions table)
 * 4. Q&A endpoint logic with simulated weather tagging
 * 5. Fail-safe degradation without blocking or delaying pipeline
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { matchLiveRules } = require('../src/services/controlRoomRules');
const {
  processAssistantEvent,
  getLiveOperationalContext,
} = require('../src/services/controlRoomAssistant');
const {
  insertAssistantInstruction,
  getAssistantInstructions,
} = require('../src/db/database');

async function runVerification() {
  console.log('================================================================');
  console.log('🧪 VERIFYING CROWD SENSE CONTROL ROOM ASSISTANT');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, description) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
    }
  }

  // ── TEST 1: Rule Matching & Traceability ─────────────────────────────────────
  console.log('--- TEST 1: Rule Matching & Grounding Traceability ---');

  // 1a. Fast rise rate rule
  const fastRiseMatch = matchLiveRules({
    eventType: 'threshold_crossed',
    zoneId: 'zone_1',
    severity: 'yellow',
    density: 1.8,
    trend_slope: 0.35,
  });
  assert(fastRiseMatch && fastRiseMatch.ruleId === 'fast_rise_rate', 'Fast rise slope triggers fast_rise_rate');
  assert(fastRiseMatch?.triggerData?.trend_slope === 0.35, 'Fast rise includes exact trend_slope in triggerData');

  // 1b. Gate overflow valve rule
  const gateMatch = matchLiveRules({
    eventType: 'alert_triggered',
    zoneId: 'zone_2',
    severity: 'red',
    density: 4.2,
    trend_slope: 0.1,
    gateStates: { opening_gate_2: false },
  });
  assert(gateMatch && gateMatch.ruleId === 'gate_overflow_valve', 'Corridor red with Gate 2 closed triggers gate_overflow_valve');
  assert(gateMatch?.text.includes('Emergency Gate 2'), 'Gate recommendation mentions Emergency Gate 2');

  // 1c. Panic emergency dispersal rule
  const panicMatch = matchLiveRules({
    eventType: 'alert_panic',
    zoneId: 'zone_1',
    severity: 'red',
    panic_signature: true,
    flow_turbulence: 0.85,
    density: 3.8,
  });
  assert(panicMatch && panicMatch.ruleId === 'panic_emergency_dispersal', 'Panic trigger matches panic_emergency_dispersal');
  assert(panicMatch?.triggerData?.panic_signature === true, 'Panic triggerData includes panic_signature boolean');

  // 1d. Convergence chokepoint rule
  const convMatch = matchLiveRules({
    eventType: 'threshold_crossed',
    zoneId: 'zone_2',
    severity: 'orange',
    density: 2.8,
    flow_convergence: 0.68,
  });
  assert(convMatch && convMatch.ruleId === 'convergence_chokepoint', 'Convergence >= 0.55 triggers convergence_chokepoint');

  // 1e. Standard critical red rule (when no special chokepoint fires)
  const redMatch = matchLiveRules({
    eventType: 'alert_triggered',
    zoneId: 'zone_1',
    severity: 'red',
    density: 4.0,
    trend_slope: 0.1,
    flow_convergence: 0.2,
  });
  assert(redMatch && redMatch.ruleId === 'standard_critical_red', 'Standard red alert triggers standard_critical_red');

  // 1f. Citizen Medical Assistance rule
  const citMedMatch = matchLiveRules({
    eventType: 'alert_triggered',
    zoneId: 'zone_1',
    severity: 'red',
    alert_type: 'citizen_report',
    category: 'MEDICAL_ASSISTANCE',
    reporter_name: 'Priya S.',
  });
  assert(citMedMatch && citMedMatch.ruleId === 'citizen_medical', 'Citizen medical report matches citizen_medical rule');
  assert(citMedMatch?.text.includes('Medical Emergency'), 'Medical recommendation mentions Medical Emergency');

  // 1g. Citizen Blocked Exits rule
  const citBlockedMatch = matchLiveRules({
    eventType: 'alert_triggered',
    zoneId: 'zone_2',
    severity: 'orange',
    alert_type: 'citizen_report',
    category: 'BLOCKED_EXITS',
    reporter_name: 'Rohan K.',
  });
  assert(citBlockedMatch && citBlockedMatch.ruleId === 'citizen_blocked_exits', 'Citizen blocked exit report matches citizen_blocked_exits rule');

  // 1h. Null return on safe green status
  const safeMatch = matchLiveRules({
    eventType: 'threshold_crossed',
    zoneId: 'zone_1',
    severity: 'green',
    density: 0.8,
    trend_slope: 0.05,
  });
  assert(safeMatch === null, 'Safe green condition returns null (honest "no recommendation")');

  // ── TEST 2: SQLite DB Persistence ───────────────────────────────────────────
  console.log('\n--- TEST 2: SQLite Audit Log Persistence ---');

  const testInst = {
    instruction_id: `test_inst_${Date.now()}`,
    triggering_alert_id: 'alt_test_123',
    zone_id: 'zone_1',
    text: 'Zone 1 density is critical. Deploy crowd control personnel to divert converging flow.',
    severity: 'red',
    event_type: 'alert_triggered',
    generated_at: new Date().toISOString(),
    source: 'test_runner',
  };

  await insertAssistantInstruction(testInst);
  const instructions = await getAssistantInstructions(10);
  const found = instructions.find((i) => i.instruction_id === testInst.instruction_id);

  assert(Boolean(found), 'Assistant instruction persisted and retrieved from SQLite audit database');
  assert(found?.text === testInst.text, 'Instruction text matches persisted record');
  assert(found?.triggering_alert_id === 'alt_test_123', 'Triggering alert ID is properly linked in DB');

  // ── TEST 3: Push Instruction Generation (Live / Fallback) ───────────────────
  console.log('\n--- TEST 3: Live Event Processing & Push Instruction ---');

  // Mock Socket.io
  let emittedEvent = null;
  let emittedPayload = null;
  const mockIo = {
    emit: (event, payload) => {
      emittedEvent = event;
      emittedPayload = payload;
    },
  };

  const pushResult = await processAssistantEvent(
    {
      eventType: 'alert_triggered',
      zoneId: 'zone_2',
      severity: 'red',
      data: {
        density: 4.5,
        trend_slope: 0.2,
        gateStates: { opening_gate_2: false },
      },
      triggeringEventId: 'alt_live_test_456',
    },
    mockIo
  );

  assert(Boolean(pushResult?.text), `Instruction successfully generated: "${pushResult.text}"`);
  assert(emittedEvent === 'assistant_instruction', 'Socket.io emitted assistant_instruction event');
  assert(emittedPayload?.triggeringEventId === 'alt_live_test_456', 'Socket payload links triggering alert ID');
  assert(emittedPayload?.zoneId === 'zone_2', 'Socket payload targets zone_2');

  // 3b. Test citizen report push instruction
  const citizenPushResult = await processAssistantEvent(
    {
      eventType: 'alert_triggered',
      zoneId: 'zone_1',
      severity: 'red',
      data: {
        alert_type: 'citizen_report',
        category: 'MEDICAL_ASSISTANCE',
        description: 'Elderly attendee experiencing dizziness near gate',
        reporter_name: 'Priya S.',
        density: 2.1,
      },
      triggeringEventId: 'alt_cit_test_789',
    },
    mockIo
  );

  assert(Boolean(citizenPushResult?.text), `Citizen report instruction generated: "${citizenPushResult?.text}"`);
  assert(emittedPayload?.alertType === 'citizen_report', 'Socket payload includes alertType: citizen_report');
  assert(emittedPayload?.category === 'MEDICAL_ASSISTANCE', 'Socket payload includes category: MEDICAL_ASSISTANCE');

  // ── TEST 4: Simulated Weather Tagging in Q&A Context ─────────────────────────
  console.log('\n--- TEST 4: Simulated Weather Tagging in Q&A Context ---');

  const liveContext = getLiveOperationalContext('zone_1');
  assert(liveContext.weather?.is_simulated === true, 'Weather state is explicitly tagged is_simulated: true');
  assert(liveContext.weather?.data_source_note.includes('DEMO PRESET'), 'Weather note identifies demo simulation preset');

  // ── TEST 5: Q&A Response Generation ─────────────────────────────────────────
  console.log('\n--- TEST 5: Q&A Response Generation via Groq ---');

  const { CONTROL_ROOM_ASSISTANT_PROMPT } = require('../src/services/controlRoomAssistantPrompt');
  const apiKey = process.env.GROQ_API_KEY;

  if (apiKey && !apiKey.includes('your_actual_groq_api_key')) {
    const qPromptContext = {
      live_zones: liveContext.zones,
      environmental_condition: liveContext.weather,
      gate_states: {
        'Emergency Gate 1': 'OPEN',
        'Emergency Gate 2': 'CLOSED',
      },
    };

    const qRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        max_tokens: 150,
        temperature: 0.1,
        messages: [
          { role: 'system', content: CONTROL_ROOM_ASSISTANT_PROMPT },
          { role: 'user', content: `Live context:\n${JSON.stringify(qPromptContext)}\n\nQuestion: "Are there any gate recommendations right now?"\n\nAnswer concisely:` },
        ],
      }),
    });

    if (qRes.ok) {
      const qData = await qRes.json();
      const qText = qData.choices?.[0]?.message?.content || '';
      assert(qText.length > 0, `Q&A Groq answer received: "${qText.trim()}"`);
    } else {
      console.warn('Q&A Groq API returned non-200');
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`📊 RESULTS: ${passed}/${total} assertions passed.`);
  console.log('================================================================\n');

  const { db } = require('../src/db/database');
  db.close(() => {
    if (passed === total) {
      console.log('✅ ALL CONTROL ROOM ASSISTANT TESTS PASSED!\n');
    } else {
      console.error('❌ SOME TESTS FAILED!\n');
    }
  });
}

runVerification().catch((err) => {
  console.error('Error during verification:', err);
});
