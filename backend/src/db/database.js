/**
 * backend/src/db/database.js
 * SQLite timestamped audit log database module.
 *
 * Contract: docs/api-contract.md §3 (Alert / Audit Log Entry).
 * Persists every alert trigger, acknowledgment, and auto-escalation.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'audit_log.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[DB] Failed to open SQLite database:', err);
  } else {
    console.log(`[DB] Connected to SQLite database at ${DB_PATH}`);
  }
});

// Initialize database schema
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      alert_id TEXT PRIMARY KEY,
      zone_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      triggered_at TEXT NOT NULL,
      assigned_to TEXT,
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      escalated_at TEXT,
      escalated_to TEXT
    )
  `);
});

/**
 * Insert a new alert record into the audit log.
 * @param {Object} alert
 * @returns {Promise<void>}
 */
function insertAlert(alert) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO audit_log (
        alert_id, zone_id, severity, alert_type, triggered_at, assigned_to,
        acknowledged_at, acknowledged_by, escalated_at, escalated_to
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      alert.alert_id,
      alert.zone_id,
      alert.severity,
      alert.alert_type || 'graduated_escalation',
      alert.triggered_at,
      alert.assigned_to || null,
      alert.acknowledged_at || null,
      alert.acknowledged_by || null,
      alert.escalated_at || null,
      alert.escalated_to || null,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('[DB] Error inserting alert:', err);
        return reject(err);
      }
      resolve();
    });
  });
}

/**
 * Record acknowledgment for an alert.
 * @param {string} alertId
 * @param {string} acknowledgedBy
 * @param {string} timestamp
 * @returns {Promise<Object|null>} Updated alert record
 */
function acknowledgeAlertInDb(alertId, acknowledgedBy, timestamp) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE audit_log
      SET acknowledged_at = ?, acknowledged_by = ?
      WHERE alert_id = ? AND acknowledged_at IS NULL
    `;
    db.run(sql, [timestamp, acknowledgedBy, alertId], function (err) {
      if (err) {
        console.error('[DB] Error acknowledging alert:', err);
        return reject(err);
      }
      if (this.changes === 0) {
        return resolve(null);
      }
      getAlertById(alertId).then(resolve).catch(reject);
    });
  });
}

/**
 * Record escalation for an alert.
 * @param {string} alertId
 * @param {string} escalatedTo
 * @param {string} timestamp
 * @returns {Promise<Object|null>}
 */
function escalateAlertInDb(alertId, escalatedTo, timestamp) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE audit_log
      SET escalated_at = ?, escalated_to = ?
      WHERE alert_id = ? AND escalated_at IS NULL
    `;
    db.run(sql, [timestamp, escalatedTo, alertId], function (err) {
      if (err) {
        console.error('[DB] Error escalating alert:', err);
        return reject(err);
      }
      getAlertById(alertId).then(resolve).catch(reject);
    });
  });
}

/**
 * Retrieve alert by ID.
 * @param {string} alertId
 * @returns {Promise<Object|null>}
 */
function getAlertById(alertId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM audit_log WHERE alert_id = ?', [alertId], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

/**
 * Retrieve recent audit logs.
 * @param {number} limit
 * @returns {Promise<Array>}
 */
function getAuditLogs(limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM audit_log ORDER BY triggered_at DESC LIMIT ?',
      [limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

module.exports = {
  db,
  insertAlert,
  acknowledgeAlertInDb,
  escalateAlertInDb,
  getAlertById,
  getAuditLogs,
};
