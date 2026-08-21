/**
 * backend/src/services/escalationManager.js
 * Alert Lifecycle & Escalation Timer Manager.
 *
 * Implements Phase 2 requirements:
 *   - Graduated escalation timer: unacknowledged red alert auto-escalates to next official after timeout.
 *   - Panic-signature alerts (4b): bypass normal ack-then-escalate delay entirely, fire at top priority,
 *     assigned to 'all_officials', logged as alert_type: 'immediate_panic_alert'.
 *   - Audit log integration: records triggers, acknowledgments, and escalations in SQLite DB.
 */
'use strict';

const { v4: uuidv4 } = require('uuid');
const {
  insertAlert,
  acknowledgeAlertInDb,
  escalateAlertInDb,
  getAlertById,
} = require('../db/database');

// Active escalation timers: Map<alert_id, NodeJS.Timeout>
const activeTimers = new Map();

// Active alerts cache: Map<zone_id, Object>
const activeZoneAlerts = new Map();

// Escalation timeout in seconds (default: 30 seconds for live demo responsiveness)
const ESCALATION_TIMEOUT_SEC = parseInt(process.env.ESCALATION_TIMEOUT_SEC || '30', 10);

/**
 * Helper to generate simple alert IDs if uuid package is missing
 */
function generateAlertId() {
  return `alt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/**
 * Check risk and handle alert trigger / panic detection / auto-escalation.
 *
 * @param {Object} riskResult - Output from riskEngine
 * @param {Object} cvPayload - Original CV payload
 * @param {import('socket.io').Server} io
 */
async function processZoneAlerts(riskResult, cvPayload, io) {
  const { zone_id } = cvPayload;
  const { risk_level, risk_score, density } = riskResult;
  const trend_slope = cvPayload.trend_slope || 0;

  // Check for Panic Signature (4b):
  // Extreme density (>= 4.5) OR explosive rate of rise (slope >= 2.0/min when density >= 2.0)
  const isPanic = density >= 4.5 || (trend_slope >= 2.0 && density >= 2.0);

  if (isPanic) {
    const existingPanic = activeZoneAlerts.get(`${zone_id}_panic`);
    if (!existingPanic) {
      const alertId = generateAlertId();
      const timestamp = new Date().toISOString();

      const alertEntry = {
        alert_id: alertId,
        zone_id,
        severity: 'red',
        alert_type: 'immediate_panic_alert',
        triggered_at: timestamp,
        assigned_to: 'all_officials',
        acknowledged_at: null,
        acknowledged_by: null,
        escalated_at: timestamp, // Panic alerts escalate immediately
        escalated_to: 'all_officials',
      };

      activeZoneAlerts.set(`${zone_id}_panic`, alertEntry);

      // Persist to audit log DB
      try {
        await insertAlert(alertEntry);
      } catch (err) {
        console.error('[Escalation] Panic alert DB insert error:', err);
      }

      console.warn(
        `\n🚨 [PANIC ALERT] Immediate broadcast for zone=${zone_id}! ` +
        `density=${density} slope=${trend_slope} alert_id=${alertId}\n`
      );

      // Fire top priority alert across Socket.io
      if (io) {
        io.emit('alert_triggered', alertEntry);
        io.emit('alert_panic', alertEntry);
      }
    }
    return;
  }

  // Handle standard Red Alert (Graduated Escalation)
  if (risk_level === 'red') {
    const existingAlert = activeZoneAlerts.get(zone_id);
    if (!existingAlert) {
      const alertId = generateAlertId();
      const timestamp = new Date().toISOString();

      const alertEntry = {
        alert_id: alertId,
        zone_id,
        severity: 'red',
        alert_type: 'graduated_escalation',
        triggered_at: timestamp,
        assigned_to: 'official_1',
        acknowledged_at: null,
        acknowledged_by: null,
        escalated_at: null,
        escalated_to: null,
      };

      activeZoneAlerts.set(zone_id, alertEntry);

      // Persist to audit log DB
      try {
        await insertAlert(alertEntry);
      } catch (err) {
        console.error('[Escalation] Alert DB insert error:', err);
      }

      console.log(
        `[Escalation] Red alert triggered: zone=${zone_id} ` +
        `assigned_to=official_1 alert_id=${alertId} (Escalates in ${ESCALATION_TIMEOUT_SEC}s)`
      );

      if (io) {
        io.emit('alert_triggered', alertEntry);
      }

      // Schedule escalation timer
      const timer = setTimeout(async () => {
        await handleAutoEscalation(alertId, zone_id, io);
      }, ESCALATION_TIMEOUT_SEC * 1000);

      activeTimers.set(alertId, timer);
    }
  } else if (risk_level === 'green' || risk_level === 'yellow') {
    // If zone drops back to safe levels and alert was resolved, clean active alert state
    const alert = activeZoneAlerts.get(zone_id);
    if (alert && alert.acknowledged_at) {
      activeZoneAlerts.delete(zone_id);
    }
    const panicAlert = activeZoneAlerts.get(`${zone_id}_panic`);
    if (panicAlert && panicAlert.acknowledged_at) {
      activeZoneAlerts.delete(`${zone_id}_panic`);
    }
  }
}

/**
 * Handle auto-escalation timer expiry.
 * @param {string} alertId
 * @param {string} zoneId
 * @param {import('socket.io').Server} io
 */
async function handleAutoEscalation(alertId, zoneId, io) {
  activeTimers.delete(alertId);

  const timestamp = new Date().toISOString();
  console.warn(
    `[Escalation] ⚠️ Auto-escalating unacknowledged alert ${alertId} for zone=${zoneId} to official_2`
  );

  try {
    const updatedAlert = await escalateAlertInDb(alertId, 'official_2', timestamp);
    if (updatedAlert) {
      // Update active cache
      if (activeZoneAlerts.get(zoneId)?.alert_id === alertId) {
        activeZoneAlerts.set(zoneId, updatedAlert);
      }

      if (io) {
        io.emit('alert_escalated', updatedAlert);
      }
    }
  } catch (err) {
    console.error('[Escalation] Auto-escalation error:', err);
  }
}

/**
 * Acknowledge an alert (by user/official).
 * @param {string} alertId
 * @param {string} acknowledgedBy
 * @param {import('socket.io').Server} io
 * @returns {Promise<Object|null>}
 */
async function acknowledgeAlert(alertId, acknowledgedBy = 'official_1', io) {
  // Cancel active timer if running
  if (activeTimers.has(alertId)) {
    clearTimeout(activeTimers.get(alertId));
    activeTimers.delete(alertId);
    console.log(`[Escalation] Timer cancelled for alert ${alertId}`);
  }

  const timestamp = new Date().toISOString();

  try {
    const updatedAlert = await acknowledgeAlertInDb(alertId, acknowledgedBy, timestamp);
    if (updatedAlert) {
      console.log(`[Escalation] Alert ${alertId} acknowledged by ${acknowledgedBy} at ${timestamp}`);

      // Update cache
      for (const [key, alert] of activeZoneAlerts.entries()) {
        if (alert.alert_id === alertId) {
          activeZoneAlerts.set(key, updatedAlert);
        }
      }

      if (io) {
        io.emit('alert_acknowledged', updatedAlert);
      }
      return updatedAlert;
    }
  } catch (err) {
    console.error('[Escalation] Error acknowledging alert:', err);
  }
  return null;
}

/**
 * Get active alerts list.
 */
function getActiveAlerts() {
  return Array.from(activeZoneAlerts.values());
}

module.exports = {
  processZoneAlerts,
  acknowledgeAlert,
  getActiveAlerts,
};
