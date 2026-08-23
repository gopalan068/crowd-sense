/**
 * backend/src/db/database.js
 * SQLite timestamped audit log & post-event report database module.
 *
 * Contract: docs/api-contract.md §3 (Alert / Audit Log Entry).
 * Persists every alert trigger, acknowledgment, auto-escalation, density snapshot,
 * and generated post-incident report with full underlying input data.
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

  // Migrations for responder_status, category, description
  db.run(`ALTER TABLE audit_log ADD COLUMN responder_status TEXT`, () => {});
  db.run(`ALTER TABLE audit_log ADD COLUMN category TEXT`, () => {});
  db.run(`ALTER TABLE audit_log ADD COLUMN description TEXT`, () => {});

  // Density History Table for Capstone Post-Event Aggregation
  db.run(`
    CREATE TABLE IF NOT EXISTS density_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id TEXT NOT NULL,
      density REAL NOT NULL,
      people_count INTEGER NOT NULL,
      area_sqm REAL NOT NULL,
      flow_convergence REAL DEFAULT 0,
      flow_turbulence REAL DEFAULT 0,
      trend_slope REAL DEFAULT 0,
      timestamp TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_density_zone_ts ON density_history (zone_id, timestamp)`, () => {});

  // Reports Table for Caching, Demo Safety, and Audit Reproducibility
  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      report_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      scope TEXT NOT NULL,
      generation_source TEXT NOT NULL,
      model_name TEXT,
      markdown_content TEXT NOT NULL,
      input_data_json TEXT NOT NULL,
      summary_metrics_json TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC)`, () => {});

  // Playbook Step Checklist Audit Log Table
  db.run(`
    CREATE TABLE IF NOT EXISTS playbook_step_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      step_text TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      completed_by TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_playbook_step_alert ON playbook_step_log (alert_id, step_index)`, () => {});
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
        acknowledged_at, acknowledged_by, escalated_at, escalated_to,
        category, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      alert.category || null,
      alert.description || null,
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

/**
 * Update the responder status for an acknowledged alert.
 * Valid values: 'en_route' | 'on_scene' | 'resolved' | 'need_backup'
 *
 * @param {string} alertId
 * @param {string} status  One of the four valid enum values above.
 * @param {string} responderId  Responder identity string (name/team ID).
 * @returns {Promise<Object|null>} Updated alert record, or null if not found.
 */
function updateResponderStatus(alertId, status, responderId) {
  return new Promise((resolve, reject) => {
    const VALID_STATUSES = ['en_route', 'on_scene', 'resolved', 'need_backup'];
    if (!VALID_STATUSES.includes(status)) {
      return reject(new Error(`Invalid responder_status value: ${status}`));
    }
    const sql = `
      UPDATE audit_log
      SET responder_status = ?, acknowledged_by = COALESCE(?, acknowledged_by)
      WHERE alert_id = ?
    `;
    db.run(sql, [status, responderId || null, alertId], function (err) {
      if (err) {
        console.error('[DB] Error updating responder status:', err);
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
 * Insert a density history snapshot.
 * @param {Object} reading
 * @returns {Promise<void>}
 */
function insertDensitySnapshot(reading) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO density_history (
        zone_id, density, people_count, area_sqm, flow_convergence, flow_turbulence, trend_slope, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      reading.zone_id,
      reading.density,
      reading.people_count || 0,
      reading.area_sqm || 20.0,
      reading.flow_convergence || 0.0,
      reading.flow_turbulence || 0.0,
      reading.trend_slope || 0.0,
      reading.timestamp || new Date().toISOString(),
    ];
    db.run(sql, params, function (err) {
      if (err) {
        console.error('[DB] Error inserting density snapshot:', err);
        return reject(err);
      }
      resolve();
    });
  });
}

/**
 * Get aggregated density metrics per zone across history.
 * @param {string} [zoneId] Optional zoneId filter (or null for all zones)
 * @returns {Promise<Array<Object>>}
 */
function getAggregatedDensityStats(zoneId = null) {
  return new Promise((resolve, reject) => {
    const whereClause = zoneId && zoneId !== 'all' ? 'WHERE zone_id = ?' : '';
    const params = zoneId && zoneId !== 'all' ? [zoneId] : [];

    const sql = `
      SELECT
        zone_id,
        COUNT(*) as total_readings,
        MIN(density) as min_density,
        AVG(density) as avg_density,
        MAX(density) as peak_density,
        MAX(people_count) as max_people_count,
        MAX(area_sqm) as area_sqm,
        MAX(flow_convergence) as peak_convergence,
        MAX(flow_turbulence) as peak_turbulence,
        MIN(timestamp) as start_time,
        MAX(timestamp) as end_time
      FROM density_history
      ${whereClause}
      GROUP BY zone_id
    `;

    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * Retrieve the timestamp when the peak density occurred for a specific zone.
 * @param {string} zoneId
 * @returns {Promise<string|null>}
 */
function getPeakDensityTimestamp(zoneId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT timestamp, density
      FROM density_history
      WHERE zone_id = ?
      ORDER BY density DESC, timestamp ASC
      LIMIT 1
    `;
    db.get(sql, [zoneId], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.timestamp : null);
    });
  });
}

/**
 * Rotate density history to keep table bounded during rehearsals.
 * @param {number} maxRowsPerZone
 * @returns {Promise<void>}
 */
function rotateDensityHistory(maxRowsPerZone = 5000) {
  return new Promise((resolve, reject) => {
    const sql = `
      DELETE FROM density_history
      WHERE id NOT IN (
        SELECT id FROM density_history ORDER BY id DESC LIMIT ?
      )
    `;
    db.run(sql, [maxRowsPerZone * 3], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Insert or update a generated post-event report.
 * @param {Object} report
 * @returns {Promise<void>}
 */
function insertReport(report) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO reports (
        report_id, created_at, scope, generation_source, model_name,
        markdown_content, input_data_json, summary_metrics_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      report.report_id,
      report.created_at || new Date().toISOString(),
      report.scope || 'all',
      report.generation_source || 'groq_llm',
      report.model_name || 'llama-3.3-70b-versatile',
      report.markdown_content,
      typeof report.input_data === 'string' ? report.input_data : JSON.stringify(report.input_data),
      typeof report.summary_metrics === 'string' ? report.summary_metrics : JSON.stringify(report.summary_metrics || {}),
    ];
    db.run(sql, params, function (err) {
      if (err) {
        console.error('[DB] Error inserting report:', err);
        return reject(err);
      }
      resolve();
    });
  });
}

/**
 * Fetch the latest generated report.
 * @returns {Promise<Object|null>}
 */
function getLatestReport() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM reports ORDER BY created_at DESC LIMIT 1`;
    db.get(sql, [], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      resolve({
        ...row,
        input_data: JSON.parse(row.input_data_json || '{}'),
        summary_metrics: JSON.parse(row.summary_metrics_json || '{}'),
      });
    });
  });
}

/**
 * Fetch report history list (metadata and summary).
 * @param {number} limit
 * @returns {Promise<Array<Object>>}
 */
function getReportHistory(limit = 10) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT report_id, created_at, scope, generation_source, model_name, summary_metrics_json
      FROM reports
      ORDER BY created_at DESC
      LIMIT ?
    `;
    db.all(sql, [limit], (err, rows) => {
      if (err) return reject(err);
      resolve((rows || []).map(r => ({
        ...r,
        summary_metrics: JSON.parse(r.summary_metrics_json || '{}'),
      })));
    });
  });
}

/**
 * Fetch a specific report by ID.
 * @param {string} reportId
 * @returns {Promise<Object|null>}
 */
function getReportById(reportId) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM reports WHERE report_id = ?`;
    db.get(sql, [reportId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      resolve({
        ...row,
        input_data: JSON.parse(row.input_data_json || '{}'),
        summary_metrics: JSON.parse(row.summary_metrics_json || '{}'),
      });
    });
  });
}

/**
 * Record completion of a specific playbook action step in the audit log.
 * @param {string} alertId
 * @param {number} stepIndex
 * @param {string} stepText
 * @param {string} completedBy
 * @param {string} [timestamp]
 * @returns {Promise<Object>}
 */
function recordPlaybookStepInDb(alertId, stepIndex, stepText, completedBy, timestamp) {
  return new Promise((resolve, reject) => {
    const ts = timestamp || new Date().toISOString();
    const sql = `
      INSERT INTO playbook_step_log (alert_id, step_index, step_text, completed_at, completed_by)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(sql, [alertId, stepIndex, stepText, ts, completedBy || 'official_1'], function (err) {
      if (err) {
        console.error('[DB] Error recording playbook step:', err);
        return reject(err);
      }
      resolve({
        id: this.lastID,
        alert_id: alertId,
        step_index: stepIndex,
        step_text: stepText,
        completed_at: ts,
        completed_by: completedBy || 'official_1',
      });
    });
  });
}

/**
 * Fetch all completed playbook steps for a given alert ID.
 * @param {string} alertId
 * @returns {Promise<Array<Object>>}
 */
function getPlaybookStepsForAlertInDb(alertId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM playbook_step_log
      WHERE alert_id = ?
      ORDER BY step_index ASC, completed_at ASC
    `;
    db.all(sql, [alertId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * Fetch recent playbook step logs across all alerts for audit log view.
 * @param {number} limit
 * @returns {Promise<Array<Object>>}
 */
function getAllPlaybookStepLogsInDb(limit = 100) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM playbook_step_log
      ORDER BY completed_at DESC
      LIMIT ?
    `;
    db.all(sql, [limit], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

module.exports = {
  db,
  insertAlert,
  acknowledgeAlertInDb,
  escalateAlertInDb,
  getAlertById,
  getAuditLogs,
  updateResponderStatus,
  insertDensitySnapshot,
  getAggregatedDensityStats,
  getPeakDensityTimestamp,
  rotateDensityHistory,
  insertReport,
  getLatestReport,
  getReportHistory,
  getReportById,
  recordPlaybookStepInDb,
  getPlaybookStepsForAlertInDb,
  getAllPlaybookStepLogsInDb,
};
