/**
 * backend/src/services/escalationManager.js
 * Alert Lifecycle & Escalation Timer Manager.
 *
 * Implements Phase 4 Panic Signature Bypass Wiring:
 *   - Closes loop: when incoming payload has panic_signature: true,
 *     triggers immediate panic alert (assigned_to: "all_officials", alert_type: "immediate_panic_alert"),
 *     logs to SQLite audit DB, and emits mock dispatch simulation event tagged "STAMPEDE DETECTED".
 */
'use strict';

const {
  insertAlert,
  acknowledgeAlertInDb,
  escalateAlertInDb,
} = require('../db/database');

const activeTimers = new Map();
const activeZoneAlerts = new Map();
const ESCALATION_TIMEOUT_SEC = parseInt(process.env.ESCALATION_TIMEOUT_SEC || '30', 10);

function generateAlertId() {
  return `alt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/**
 * Check risk & panic_signature to trigger immediate panic alert or graduated escalation.
 *
 * @param {Object} riskResult
 * @param {Object} cvPayload
 * @param {import('socket.io').Server} io
 */
async function processZoneAlerts(riskResult, cvPayload, io) {
  const { zone_id } = cvPayload;
  const { risk_level, density } = riskResult;
  const trend_slope = cvPayload.trend_slope || 0;
  const flow_turbulence = Number(cvPayload.flow_turbulence) || 0;
  const panic_signature = cvPayload.panic_signature === true;
  const exodus_signature = cvPayload.exodus_signature === true;

  // False-Positive Proof Panic Condition (Blueprint §6 Rules)
  // Now includes exodus_signature: mass flee / fire evacuation coherent motion
  const isPanic =
    panic_signature ||
    exodus_signature ||
    (flow_turbulence >= 0.70 && density >= 1.5) ||
    density >= 4.5 ||
    (trend_slope >= 2.0 && density >= 2.0);

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
        escalated_at: timestamp,
        escalated_to: 'all_officials',
      };

      activeZoneAlerts.set(`${zone_id}_panic`, alertEntry);

      try {
        await insertAlert(alertEntry);
      } catch (err) {
        console.error('[Escalation] Panic alert DB insert error:', err);
      }

      console.warn(
        `\n🚨 [PANIC ALERT BYPASS] Immediate panic alert for zone=${zone_id}! ` +
        `panic_sig=${panic_signature} exodus_sig=${exodus_signature} turb=${flow_turbulence} density=${density} alert_id=${alertId}\n`
      );

      if (io) {
        io.emit('alert_triggered', alertEntry);
        io.emit('alert_panic', alertEntry);

        // Determine dispatch message based on trigger type
        const triggerLabel = exodus_signature
          ? 'FIRE EVACUATION / MASS EXODUS DETECTED'
          : 'STAMPEDE DETECTED';
        const triggerMsg = exodus_signature
          ? `Mass exodus/fire evacuation signature detected in ${zone_id}. Coherent high-speed crowd movement confirmed.`
          : `Panic signature triggered in ${zone_id}. Automated dispatch notification simulated.`;

        // Auto-trigger mock dispatch simulation toast tagged (§3 blueprint)
        io.emit('mock_dispatch_toast', {
          zone_id,
          title: triggerLabel,
          message: triggerMsg,
          timestamp,
          is_simulation: true,
        });
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

      const timer = setTimeout(async () => {
        await handleAutoEscalation(alertId, zone_id, io);
      }, ESCALATION_TIMEOUT_SEC * 1000);

      activeTimers.set(alertId, timer);
    }
  } else if (risk_level === 'green' || risk_level === 'yellow') {
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

async function handleAutoEscalation(alertId, zoneId, io) {
  activeTimers.delete(alertId);

  const timestamp = new Date().toISOString();
  console.warn(
    `[Escalation] ⚠️ Auto-escalating unacknowledged alert ${alertId} for zone=${zoneId} to official_2`
  );

  try {
    const updatedAlert = await escalateAlertInDb(alertId, 'official_2', timestamp);
    if (updatedAlert) {
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

async function acknowledgeAlert(alertId, acknowledgedBy = 'official_1', io) {
  if (activeTimers.has(alertId)) {
    clearTimeout(activeTimers.get(alertId));
    activeTimers.delete(alertId);
  }

  const timestamp = new Date().toISOString();

  try {
    const updatedAlert = await acknowledgeAlertInDb(alertId, acknowledgedBy, timestamp);
    if (updatedAlert) {
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

function getActiveAlerts() {
  return Array.from(activeZoneAlerts.values());
}

module.exports = {
  processZoneAlerts,
  acknowledgeAlert,
  getActiveAlerts,
};
