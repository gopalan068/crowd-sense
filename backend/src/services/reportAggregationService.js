/**
 * backend/src/services/reportAggregationService.js
 * Capstone Post-Event Data Aggregation Engine (Full Comprehensive Scope).
 *
 * Compiles all operational metrics, full density histories, complete audit trails,
 * responder timelines, and simulated weather transitions into a structured,
 * honest JSON payload for Gemini LLM synthesis.
 */
'use strict';

const { getAuditLogs } = require('../db/database');
const { getSessionDensitySummaries } = require('./densityHistoryService');
const { getWeatherHistory } = require('./weatherService');

/**
 * Aggregate all system data into a comprehensive structured payload.
 *
 * @param {Object} options
 * @param {string} [options.scope='all'] 'all' | 'zone_1' | 'zone_2'
 * @param {boolean} [options.includeSimulatedReference=false]
 * @param {string} [options.venueName='City Central Gathering Ground & Corridor Complex']
 * @returns {Promise<Object>}
 */
async function aggregateReportData(options = {}) {
  const scope = options.scope || 'all';
  const includeSimulatedReference = Boolean(options.includeSimulatedReference);
  const venueName = options.venueName || 'City Central Gathering Ground & Corridor Complex';
  const reportGeneratedAt = new Date().toISOString();

  // 1. Fetch Session Density Summaries
  const densitySummaries = await getSessionDensitySummaries(scope);

  // 2. Fetch Full Audit Logs
  const rawLogs = await getAuditLogs(500);
  const relevantLogs = rawLogs.filter((log) => {
    if (scope === 'all') return true;
    return log.zone_id === scope;
  });

  // 3. Compute Accountability Metrics Across ALL Logged Incidents
  let totalAckTimeSec = 0;
  let ackCount = 0;
  const ackTimesBySeverity = { red: [], orange: [], yellow: [] };
  let autoEscalationsCount = 0;
  let panicAlertsCount = 0;
  let citizenReportsCount = 0;
  let citizenResolvedCount = 0;
  let resolvedIncidentsCount = 0;
  let needBackupCount = 0;

  const fullIncidentsList = relevantLogs.map((log) => {
    const triggeredMs = new Date(log.triggered_at).getTime();
    let ackTimeSec = null;

    if (log.acknowledged_at) {
      const ackMs = new Date(log.acknowledged_at).getTime();
      ackTimeSec = Math.max(0, Math.round((ackMs - triggeredMs) / 1000));
      totalAckTimeSec += ackTimeSec;
      ackCount++;

      const sev = (log.severity || 'orange').toLowerCase();
      if (ackTimesBySeverity[sev]) {
        ackTimesBySeverity[sev].push(ackTimeSec);
      }
    }

    if (log.escalated_at) {
      autoEscalationsCount++;
    }

    if (log.alert_type === 'immediate_panic_alert') {
      panicAlertsCount++;
    }

    if (log.alert_type === 'citizen_report') {
      citizenReportsCount++;
      if (log.responder_status === 'resolved') {
        citizenResolvedCount++;
      }
    }

    if (log.responder_status === 'resolved') {
      resolvedIncidentsCount++;
    } else if (log.responder_status === 'need_backup') {
      needBackupCount++;
    }

    return {
      alert_id: log.alert_id,
      zone_id: log.zone_id,
      severity: log.severity,
      alert_type: log.alert_type,
      source: log.alert_type === 'citizen_report' ? 'citizen_sos' : 'cv_detection_engine',
      triggered_at: log.triggered_at,
      assigned_to: log.assigned_to,
      acknowledged_at: log.acknowledged_at,
      acknowledged_by: log.acknowledged_by,
      time_to_acknowledge_sec: ackTimeSec,
      escalated_at: log.escalated_at,
      escalated_to: log.escalated_to,
      was_auto_escalated: Boolean(log.escalated_at),
      responder_status: log.responder_status || 'unassigned',
      category: log.category || null,
      description: log.description || null,
    };
  });

  const avgTimeToAcknowledgeSec = ackCount > 0 ? Math.round(totalAckTimeSec / ackCount) : null;
  const avgAckBySeverity = {};
  for (const [sev, times] of Object.entries(ackTimesBySeverity)) {
    avgAckBySeverity[`${sev}_avg_sec`] =
      times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  }

  // 4. Weather & Environmental History (Full session history)
  const weatherTimeline = getWeatherHistory();

  // 5. Build Comprehensive Aggregated Payload
  const aggregatedPayload = {
    report_metadata: {
      generated_at: reportGeneratedAt,
      report_type: 'POST_INCIDENT_CROWD_SAFETY_AUDIT',
      scope: scope,
      venue_name: venueName,
      authority_tag: 'CrowdSense Automated Incident & Safety Audit System (Evaluation Draft)',
    },
    occupancy_and_density: {
      metric_definition_note:
        'All occupancy figures represent ESTIMATED PEAK CONCURRENT OCCUPANCY (density * calibrated area) at a specific moment. Density analysis cannot deduplicate people moving between zones or arriving/departing across time, and MUST NOT be described as total unique attendees or total footfall.',
      zone_summaries: densitySummaries,
      total_estimated_peak_concurrent_occupancy: densitySummaries.reduce(
        (sum, z) => sum + (z.estimated_peak_concurrent_occupancy || 0),
        0
      ),
    },
    accountability_and_response_metrics: {
      headline_standout_stats: {
        total_incidents_logged: relevantLogs.length,
        acknowledged_incidents: ackCount,
        unacknowledged_incidents: relevantLogs.length - ackCount,
        average_time_to_acknowledge_seconds: avgTimeToAcknowledgeSec,
        average_time_to_acknowledge_by_severity: avgAckBySeverity,
        auto_escalations_due_to_timeout: autoEscalationsCount,
        immediate_panic_fast_path_bypasses: panicAlertsCount,
        incidents_resolved_by_field_teams: resolvedIncidentsCount,
        field_backup_requests: needBackupCount,
      },
      citizen_emergency_reports: {
        total_submitted: citizenReportsCount,
        resolved: citizenResolvedCount,
        pending: citizenReportsCount - citizenResolvedCount,
        status_note:
          citizenReportsCount === 0
            ? 'No citizen SOS reports were submitted during this observation window.'
            : `${citizenReportsCount} citizen emergency SOS reports were processed through the unified alert bus.`,
      },
    },
    incident_audit_trail: fullIncidentsList,
    total_incidents_in_db: relevantLogs.length,
    environmental_condition_changes: {
      is_simulated: true,
      simulation_note: 'Weather condition changes were initiated via simulated demo control presets.',
      timeline: weatherTimeline,
    },
  };

  // 6. Optional Supplementary Reference Figures (Visually & Schema Flagged)
  if (includeSimulatedReference) {
    aggregatedPayload.supplementary_reference_data = {
      data_source: 'simulated_reference',
      disclaimer:
        'The following baseline reference figures are simulated for comparative operational context and are NOT measured by sensors.',
      expected_ticketed_attendance: 1800,
      nominal_venue_safe_capacity: 2200,
      planned_security_postings: 12,
    };
  }

  return aggregatedPayload;
}

module.exports = {
  aggregateReportData,
};
