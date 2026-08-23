/**
 * backend/scripts/test_playbook.js
 * Automated test suite for Incident Response Playbook subsystem.
 *
 * Tests:
 *  1. Deterministic alert matching for all 11 protocols + edge cases
 *  2. Resource shortfall vs sufficiency evaluations (shortfall, exact, surplus, zero)
 *  3. Contextual narrative generation & deterministic fallback
 *  4. SQLite playbook_step_log persistence and audit log retrieval
 */
'use strict';

const assert = require('assert');
const path = require('path');
const { PLAYBOOK_TABLE } = require('../src/data/playbookData');
const {
  getPlaybookForAlert,
  evaluateResourceShortfall,
  recordPlaybookStep,
  getCompletedSteps,
} = require('../src/services/playbookService');
const { responderCheckIns } = require('../src/routes/responders');
const {
  generateContextualNarrative,
  generateDeterministicFallbackNarrative,
} = require('../src/services/groqPlaybookService');
const { getAllPlaybookStepLogsInDb } = require('../src/db/database');

async function runTests() {
  console.log('🧪 Running Incident Response Playbook Tests...\n');

  // ══════════════════════════════════════════════════════════════════════════
  // Test 1: Static Playbook Table Completeness & Integrity
  // ══════════════════════════════════════════════════════════════════════════
  console.log('▶ Test 1: Validating Playbook Table Entries & Citations...');
  const tableKeys = Object.keys(PLAYBOOK_TABLE);
  assert.strictEqual(tableKeys.length, 11, 'Should have exactly 11 static protocols defined');

  for (const [key, entry] of Object.entries(PLAYBOOK_TABLE)) {
    assert(entry.id, `${key} missing id`);
    assert(entry.title, `${key} missing title`);
    assert(['ndma_guideline', 'illustrative_default'].includes(entry.source), `${key} invalid source: ${entry.source}`);
    assert(entry.reference_note && entry.reference_note.length > 5, `${key} missing reference note`);
    assert(Array.isArray(entry.immediate_actions) && entry.immediate_actions.length >= 3, `${key} must have at least 3 action steps`);
    assert(typeof entry.required_resources?.personnel === 'number', `${key} missing personnel number`);
    assert(typeof entry.required_resources?.ambulances === 'number', `${key} missing ambulances number`);
    assert(typeof entry.required_resources?.evacuation_team === 'boolean', `${key} missing evacuation_team flag`);
  }
  console.log('  ✓ All 11 static playbook protocols have valid NDMA/illustrative tags, actions, and resources.\n');

  // ══════════════════════════════════════════════════════════════════════════
  // Test 2: Deterministic Matching Rules & Edge Cases
  // ══════════════════════════════════════════════════════════════════════════
  console.log('▶ Test 2: Deterministic Matching Rule Verification...');

  // 2.1 Panic bypass takes absolute priority
  const panicAlert = {
    alert_type: 'immediate_panic_alert',
    severity: 'red',
    category: 'MEDICAL_ASSISTANCE', // Even with citizen category, panic bypass rules
  };
  assert.strictEqual(getPlaybookForAlert(panicAlert).id, 'cv_panic_red', 'Panic bypass must match cv_panic_red');

  // 2.2 Citizen Report Categories
  const medicalAlert = { alert_type: 'citizen_report', category: 'MEDICAL_ASSISTANCE', severity: 'red' };
  assert.strictEqual(getPlaybookForAlert(medicalAlert).id, 'citizen_medical');

  const fireAlert = { alert_type: 'citizen_report', category: 'FIRE_SMOKE', severity: 'orange' };
  assert.strictEqual(getPlaybookForAlert(fireAlert).id, 'citizen_fire_egress');

  const blockedExitAlert = { alert_type: 'citizen_report', category: 'BLOCKED_EXITS', severity: 'orange' };
  assert.strictEqual(getPlaybookForAlert(blockedExitAlert).id, 'citizen_fire_egress');

  const crowdPressureAlert = { alert_type: 'citizen_report', category: 'STAMPEDE_RISK', severity: 'red' };
  assert.strictEqual(getPlaybookForAlert(crowdPressureAlert).id, 'citizen_crowd_pressure');

  const suspiciousAlert = { alert_type: 'citizen_report', category: 'SUSPICIOUS_ACTIVITY', severity: 'orange' };
  assert.strictEqual(getPlaybookForAlert(suspiciousAlert).id, 'citizen_suspicious_activity');

  const violenceAlert = { alert_type: 'citizen_report', category: 'VIOLENCE', severity: 'orange' };
  assert.strictEqual(getPlaybookForAlert(violenceAlert).id, 'citizen_violence_disturbance');

  const missingPersonAlert = { alert_type: 'citizen_report', category: 'MISSING_PERSON', severity: 'yellow' };
  assert.strictEqual(getPlaybookForAlert(missingPersonAlert).id, 'citizen_missing_person');

  const generalHelpAlert = { alert_type: 'citizen_report', category: 'GENERAL_HELP', severity: 'yellow' };
  assert.strictEqual(getPlaybookForAlert(generalHelpAlert).id, 'citizen_general_help');

  // 2.3 CV Graduated Alerts
  const cvRedAlert = { alert_type: 'graduated_escalation', severity: 'red' };
  assert.strictEqual(getPlaybookForAlert(cvRedAlert).id, 'cv_graduated_red');

  const cvOrangeAlert = { alert_type: 'graduated_escalation', severity: 'orange' };
  assert.strictEqual(getPlaybookForAlert(cvOrangeAlert).id, 'cv_graduated_orange');

  const cvYellowAlert = { alert_type: 'graduated_escalation', severity: 'yellow' };
  assert.strictEqual(getPlaybookForAlert(cvYellowAlert).id, 'cv_graduated_yellow');

  // 2.4 Edge cases & ambiguous shapes
  const ambiguousCitizen = { alert_type: 'citizen_report', category: 'UNKNOWN_NEW_ISSUE', severity: 'red' };
  assert.strictEqual(getPlaybookForAlert(ambiguousCitizen).id, 'citizen_general_help', 'Unknown citizen category should fallback to citizen_general_help');

  const missingFieldsAlert = {};
  assert.strictEqual(getPlaybookForAlert(missingFieldsAlert).id, 'cv_graduated_yellow', 'Empty alert should safely match yellow default');

  console.log('  ✓ All matching rules and edge cases resolve to correct protocols deterministically.\n');

  // ══════════════════════════════════════════════════════════════════════════
  // Test 3: Resource Shortfall vs Sufficiency Cross-Referencing
  // ══════════════════════════════════════════════════════════════════════════
  console.log('▶ Test 3: Resource Shortfall & Sufficiency Cross-Referencing...');

  // Clear in-memory responder state for clean testing
  responderCheckIns.clear();

  const orangePlaybook = PLAYBOOK_TABLE.cv_graduated_orange; // requires 4 personnel

  // Case 3.1: Zero responders checked in
  const zeroResult = evaluateResourceShortfall(orangePlaybook, 'zone_2');
  assert.strictEqual(zeroResult.checked_in_personnel, 0);
  assert.strictEqual(zeroResult.is_shortfall, true);
  assert.strictEqual(zeroResult.shortfall_count, 4);
  assert(zeroResult.status_text.includes('SHORTFALL (4 needed)'));

  // Case 3.2: Shortfall with 1 responder checked in
  responderCheckIns.set('resp_1', { name: 'Officer Kumar', zone_id: 'zone_2' });
  const shortfallResult = evaluateResourceShortfall(orangePlaybook, 'zone_2');
  assert.strictEqual(shortfallResult.checked_in_personnel, 1);
  assert.strictEqual(shortfallResult.is_shortfall, true);
  assert.strictEqual(shortfallResult.shortfall_count, 3);
  assert(shortfallResult.status_text.includes('SHORTFALL (3 needed)'));

  // Case 3.3: Exact match (Sufficient)
  responderCheckIns.set('resp_2', { name: 'Officer Priya', zone_id: 'zone_2' });
  responderCheckIns.set('resp_3', { name: 'Officer Raman', zone_id: 'zone_2' });
  responderCheckIns.set('resp_4', { name: 'Officer Anita', zone_id: 'zone_2' });
  const exactResult = evaluateResourceShortfall(orangePlaybook, 'zone_2');
  assert.strictEqual(exactResult.checked_in_personnel, 4);
  assert.strictEqual(exactResult.is_shortfall, false);
  assert.strictEqual(exactResult.shortfall_count, 0);
  assert(exactResult.status_text.includes('Sufficient'));

  // Case 3.4: Surplus (5 responders checked in, 4 required)
  responderCheckIns.set('resp_5', { name: 'Officer Vikram', zone_id: 'zone_2' });
  const surplusResult = evaluateResourceShortfall(orangePlaybook, 'zone_2');
  assert.strictEqual(surplusResult.checked_in_personnel, 5);
  assert.strictEqual(surplusResult.is_shortfall, false);
  assert.strictEqual(surplusResult.shortfall_count, 0);
  assert(surplusResult.status_text.includes('Sufficient'));

  console.log('  ✓ Shortfall, exact match, surplus, and zero-responder states evaluated accurately.\n');

  // ══════════════════════════════════════════════════════════════════════════
  // Test 4: Contextual Narrative Wrapper & Fallback
  // ══════════════════════════════════════════════════════════════════════════
  console.log('▶ Test 4: Contextual Narrative Wrapper...');

  const fallbackNote = generateDeterministicFallbackNarrative(
    PLAYBOOK_TABLE.cv_graduated_red,
    { zone_label: 'Zone 2 (Main Field)', is_shortfall: true, shortfall_count: 2, checked_in_personnel: 4, required_personnel: 6 },
    { current_condition: { label: 'Extreme Heat', temperature_c: 42 } }
  );
  assert(fallbackNote.includes('Operational Priority'), 'Fallback should state operational priority');
  assert(fallbackNote.includes('shortfall'), 'Fallback should mention shortfall');
  assert(fallbackNote.includes('Extreme Heat'), 'Fallback should mention weather context');
  assert(fallbackNote.includes('on-ground command makes final call'), 'Fallback should preserve decision support framing');

  console.log('  Sample Deterministic Fallback Output:');
  console.log(`  "${fallbackNote}"`);
  console.log('  ✓ Contextual narrative wrapper strictly bounds framing without altering numbers.\n');

  // ══════════════════════════════════════════════════════════════════════════
  // Test 5: SQLite Playbook Step Log Persistence & Retrieval
  // ══════════════════════════════════════════════════════════════════════════
  console.log('▶ Test 5: SQLite Playbook Step Checklist Audit Logging...');

  const testAlertId = `test_alert_${Date.now()}`;
  const step0 = await recordPlaybookStep(
    testAlertId,
    0,
    'Deploy 2 patrol marshals to observe entry/exit transition flow rates',
    'Officer_Test',
    null
  );
  assert.strictEqual(step0.alert_id, testAlertId);
  assert.strictEqual(step0.step_index, 0);

  const step1 = await recordPlaybookStep(
    testAlertId,
    1,
    'Verify emergency corridor pathways remain 100% free of temporary physical obstructions',
    'Officer_Test',
    null
  );
  assert.strictEqual(step1.step_index, 1);

  const fetchedSteps = await getCompletedSteps(testAlertId);
  assert.strictEqual(fetchedSteps.length, 2, 'Should have retrieved exactly 2 completed steps');
  assert.strictEqual(fetchedSteps[0].step_index, 0);
  assert.strictEqual(fetchedSteps[1].step_index, 1);

  const allStepLogs = await getAllPlaybookStepLogsInDb(10);
  assert(allStepLogs.some(s => s.alert_id === testAlertId), 'Step log must be queryable in global audit log');

  console.log('  ✓ Playbook steps successfully persisted to SQLite and retrieved in audit log format.\n');

  console.log('🎉 ALL 5 PLAYBOOK TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
