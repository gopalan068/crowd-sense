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
  updateResponderStatus,
} = require('../db/database');


const activeTimers = new Map();
const activeZoneAlerts = new Map();
const ESCALATION_TIMEOUT_SEC = parseInt(process.env.ESCALATION_TIMEOUT_SEC || '30', 10);

// Auto-expiry for panic alerts.
// If no panic/exodus signal arrives for this duration, the panic alert is
// cleared automatically so a video loop (or genuine crowd calm-down) resets
// the UI back to green instead of staying frozen on 'red'.
const PANIC_ALERT_TTL_MS = parseInt(process.env.PANIC_ALERT_TTL_MS || '20000', 10); // 20 s default
const lastPanicSeenMs = new Map(); // zone_id -> timestamp of last panic/exodus reading

// Consecutive-frame confirmation buffer.
// A panic alert only fires once isPanic has been true for this many consecutive
// backend-received analysis frames.  Default: 2 frames (matching the CV-side
// flow_analyzer consecutive_spike_count >= 2 gate).
// Configurable via PANIC_CONFIRM_FRAMES env var for tuning per deployment.
const PANIC_CONFIRM_FRAMES = parseInt(process.env.PANIC_CONFIRM_FRAMES || '2', 10);
const panicConsecutiveCount = new Map(); // zone_id -> current consecutive isPanic count

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
  const nowMs = Date.now();

  // Track last time a panic/exodus signal arrived for this zone
  if (panic_signature || exodus_signature) {
    lastPanicSeenMs.set(zone_id, nowMs);
  }

  // Auto-expire stale panic alerts: if no panic signal received for > TTL,
  // clear the panic alert so the zone can return to green on the next cycle.
  // This handles video loops and genuine crowd calm-down events.
  const lastPanic = lastPanicSeenMs.get(zone_id) || 0;
  const panicStale = (nowMs - lastPanic) > PANIC_ALERT_TTL_MS;
  if (panicStale && activeZoneAlerts.has(`${zone_id}_panic`)) {
    const staleAlert = activeZoneAlerts.get(`${zone_id}_panic`);
    if (!staleAlert.acknowledged_at) {
      console.log(`[Escalation] Auto-expiring stale panic alert for zone=${zone_id} (no panic signal for ${Math.round((nowMs - lastPanic) / 1000)}s)`);
      activeZoneAlerts.delete(`${zone_id}_panic`);
    }
  }

  // False-Positive Proof Panic Condition (Blueprint §6 Rules)
  // Now includes exodus_signature: mass flee / fire evacuation coherent motion
  const isPanic =
    panic_signature ||
    exodus_signature ||
    (flow_turbulence >= 0.70 && density >= 1.5) ||
    density >= 4.5 ||
    (trend_slope >= 2.0 && density >= 2.0);

  // ── Consecutive-Frame Confirmation Buffer ────────────────────────────────
  // Increment or reset the per-zone consecutive panic counter.
  // The alert only fires once the count reaches PANIC_CONFIRM_FRAMES.
  // This prevents single transient spikes (e.g. lighting flash, CCTV noise)
  // from creating false-positive alerts.
  if (isPanic) {
    panicConsecutiveCount.set(zone_id, (panicConsecutiveCount.get(zone_id) || 0) + 1);
  } else {
    panicConsecutiveCount.set(zone_id, 0);
  }

  const confirmedFrames = panicConsecutiveCount.get(zone_id) || 0;
  const panicConfirmed = confirmedFrames >= PANIC_CONFIRM_FRAMES;

  // While building up toward confirmation, emit a softer warning event
  // so the frontend can show an intermediate "Confirming panic..." state.
  if (isPanic && !panicConfirmed && io) {
    io.emit('panic_confirming', {
      zone_id,
      confirmedFrames,
      requiredFrames: PANIC_CONFIRM_FRAMES,
      trigger: panic_signature ? 'panic' : exodus_signature ? 'exodus' : 'threshold',
      timestamp: new Date().toISOString(),
    });
    console.log(
      `[Escalation] Panic building for zone=${zone_id}: ` +
      `frame ${confirmedFrames}/${PANIC_CONFIRM_FRAMES} ` +
      `(trigger: ${panic_signature ? 'panic_sig' : exodus_signature ? 'exodus_sig' : 'threshold'}) — awaiting confirmation.`
    );
  }

  if (panicConfirmed) {
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

/**
 * Register a custom alert (e.g. citizen emergency report or panic override)
 * into activeZoneAlerts, persist to SQLite DB, and emit socket event.
 *
 * @param {Object} alertEntry
 * @param {import('socket.io').Server} io
 * @returns {Promise<Object>}
 */
async function registerCustomAlert(alertEntry, io) {
  const key = `custom_${alertEntry.alert_id}`;
  activeZoneAlerts.set(key, alertEntry);
  try {
    await insertAlert(alertEntry);
  } catch (err) {
    console.error('[Escalation] Custom alert DB insert error:', err);
  }
  if (io) {
    io.emit('alert_triggered', alertEntry);
  }
  return alertEntry;
}

/**
 * Update responder operational status for an acknowledged alert.

 * Writes to the same audit log used by the main dashboard.
 *
 * @param {string} alertId
 * @param {string} status  'en_route' | 'on_scene' | 'resolved' | 'need_backup'
 * @param {string} responderId  Responder name/team ID as entered at check-in.
 * @param {import('socket.io').Server} io
 * @returns {Promise<Object|null>}
 */
async function updateAlertStatus(alertId, status, responderId, io) {
  try {
    const updatedAlert = await updateResponderStatus(alertId, status, responderId);
    if (updatedAlert) {
      // Keep in-memory activeZoneAlerts in sync so getActiveAlerts() reflects status.
      for (const [key, alert] of activeZoneAlerts.entries()) {
        if (alert.alert_id === alertId) {
          activeZoneAlerts.set(key, updatedAlert);
        }
      }
      if (io) {
        io.emit('alert_status_updated', updatedAlert);
      }
      console.log(
        `[Escalation] Responder status update: alert=${alertId} ` +
        `status=${status} responder=${responderId}`
      );
    }
    return updatedAlert;
  } catch (err) {
    console.error('[Escalation] Error updating responder status:', err);
    return null;
  }
}

function getActiveAlerts() {
  return Array.from(activeZoneAlerts.values());
}

module.exports = {
  processZoneAlerts,
  acknowledgeAlert,
  updateAlertStatus,
  registerCustomAlert,
  getActiveAlerts,
};
