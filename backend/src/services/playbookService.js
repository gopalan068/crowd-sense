/**
 * backend/src/services/playbookService.js
 * Incident Response Playbook matching, resource shortfall evaluation,
 * and step completion lifecycle engine.
 *
 * Enforces strict separation:
 *  - Static protocols & action numbers from PLAYBOOK_TABLE
 *  - Shortfall computation reusing active responder check-ins
 *  - Step logging to SQLite audit DB
 */
'use strict';

const { PLAYBOOK_TABLE } = require('../data/playbookData');
const { getCheckedInCountByZone } = require('../routes/responders');
const {
  recordPlaybookStepInDb,
  getPlaybookStepsForAlertInDb,
} = require('../db/database');

/**
 * Deterministically match an alert to its corresponding static playbook protocol.
 *
 * Matching Rules:
 *  1. Priority 1 (Panic Bypass): alert_type === 'immediate_panic_alert' -> cv_panic_red
 *  2. Priority 2 (Citizen SOS): alert_type === 'citizen_report' -> matched by normalized category
 *  3. Priority 3 (CV Graduated): alert_type === 'graduated_escalation' or CV default -> matched by severity (red/orange/yellow)
 *  4. Default Fallback: cv_graduated_yellow
 *
 * @param {Object} alert
 * @returns {Object} Static playbook protocol object
 */
function getPlaybookForAlert(alert) {
  if (!alert) {
    return PLAYBOOK_TABLE.cv_graduated_yellow;
  }

  const alertType = alert.alert_type || 'graduated_escalation';
  const severity = (alert.severity || 'yellow').toLowerCase();
  const rawCategory = (alert.category || '').toUpperCase().trim().replace(/\s+/g, '_');

  // Priority 1: Panic Signature Fast-Path Bypass
  if (alertType === 'immediate_panic_alert') {
    return PLAYBOOK_TABLE.cv_panic_red;
  }

  // Priority 2: Citizen Emergency SOS Reports (Category-driven)
  if (alertType === 'citizen_report') {
    if (rawCategory.includes('MEDICAL')) {
      return PLAYBOOK_TABLE.citizen_medical;
    }
    if (rawCategory.includes('FIRE') || rawCategory.includes('SMOKE') || rawCategory.includes('BLOCKED')) {
      return PLAYBOOK_TABLE.citizen_fire_egress;
    }
    if (rawCategory.includes('STAMPEDE') || rawCategory.includes('PRESSURE') || rawCategory.includes('CROWD')) {
      return PLAYBOOK_TABLE.citizen_crowd_pressure;
    }
    if (rawCategory.includes('SUSPICIOUS')) {
      return PLAYBOOK_TABLE.citizen_suspicious_activity;
    }
    if (
      rawCategory.includes('VIOLENCE') ||
      rawCategory.includes('THEFT') ||
      rawCategory.includes('DISTURBANCE') ||
      rawCategory === 'GENERAL_PANIC'
    ) {
      return PLAYBOOK_TABLE.citizen_violence_disturbance;
    }
    if (rawCategory.includes('MISSING')) {
      return PLAYBOOK_TABLE.citizen_missing_person;
    }
    return PLAYBOOK_TABLE.citizen_general_help;
  }

  // Priority 3: CV-Triggered Graduated Alerts
  if (severity === 'red') {
    return PLAYBOOK_TABLE.cv_graduated_red;
  }
  if (severity === 'orange') {
    return PLAYBOOK_TABLE.cv_graduated_orange;
  }
  if (severity === 'yellow') {
    return PLAYBOOK_TABLE.cv_graduated_yellow;
  }

  return PLAYBOOK_TABLE.cv_graduated_yellow;
}

/**
 * Cross-reference playbook required personnel with live checked-in responders for the zone.
 *
 * @param {Object} playbook Static playbook entry
 * @param {string} zoneId Zone identifier (e.g. 'zone_1' | 'zone_2')
 * @returns {Object} Resource shortfall evaluation
 */
function evaluateResourceShortfall(playbook, zoneId) {
  const targetZone = zoneId === 'zone_2' ? 'zone_2' : 'zone_1';
  const zoneLabel = targetZone === 'zone_2' ? 'Zone 2 (Main Field)' : 'Zone 1 (Arrival Staging)';

  const requiredPersonnel = playbook?.required_resources?.personnel || 1;
  const checkedInCount = getCheckedInCountByZone(targetZone);

  const isShortfall = checkedInCount < requiredPersonnel;
  const shortfallCount = isShortfall ? (requiredPersonnel - checkedInCount) : 0;

  const statusText = isShortfall
    ? `Recommended: ${requiredPersonnel} responders — Currently checked in near ${zoneLabel}: ${checkedInCount} — SHORTFALL (${shortfallCount} needed), request backup`
    : `Recommended: ${requiredPersonnel} responders — Currently checked in near ${zoneLabel}: ${checkedInCount} — Sufficient`;

  return {
    zone_id: targetZone,
    zone_label: zoneLabel,
    required_personnel: requiredPersonnel,
    checked_in_personnel: checkedInCount,
    is_shortfall: isShortfall,
    shortfall_count: shortfallCount,
    status_text: statusText,
    ambulances: playbook?.required_resources?.ambulances || 0,
    evacuation_team: Boolean(playbook?.required_resources?.evacuation_team),
  };
}

/**
 * Record a completed playbook action step to the audit log and broadcast via WebSocket.
 *
 * @param {string} alertId
 * @param {number} stepIndex
 * @param {string} stepText
 * @param {string} completedBy
 * @param {import('socket.io').Server} [io]
 * @returns {Promise<Object>}
 */
async function recordPlaybookStep(alertId, stepIndex, stepText, completedBy, io) {
  const timestamp = new Date().toISOString();
  const record = await recordPlaybookStepInDb(alertId, stepIndex, stepText, completedBy, timestamp);

  if (io) {
    io.emit('playbook_step_completed', record);
  }

  console.log(
    `[Playbook] Step completed: alert=${alertId} step=${stepIndex} by=${completedBy} (${stepText.substring(0, 30)}...)`
  );

  return record;
}

/**
 * Get all completed steps for a specific alert.
 * @param {string} alertId
 * @returns {Promise<Array<Object>>}
 */
async function getCompletedSteps(alertId) {
  return await getPlaybookStepsForAlertInDb(alertId);
}

module.exports = {
  getPlaybookForAlert,
  evaluateResourceShortfall,
  recordPlaybookStep,
  getCompletedSteps,
};
