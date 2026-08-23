/**
 * backend/scripts/test_report_generation.js
 * Verification script for Capstone Post-Event Data Aggregation and Report Generation.
 */
'use strict';

const { aggregateReportData } = require('../src/services/reportAggregationService');
const { generateAndPersistReport } = require('../src/services/groqReportService');
const { getLatestReport, insertDensitySnapshot, insertAlert } = require('../src/db/database');

async function runTest() {
  console.log('--- Starting Capstone Report Pipeline Verification ---');

  // 1. Insert sample density snapshot
  const now = new Date().toISOString();
  await insertDensitySnapshot({
    zone_id: 'zone_1',
    density: 2.8,
    people_count: 56,
    area_sqm: 20.0,
    flow_convergence: 0.45,
    flow_turbulence: 0.35,
    trend_slope: 0.25,
    timestamp: now,
  });

  await insertDensitySnapshot({
    zone_id: 'zone_2',
    density: 3.9,
    people_count: 1950,
    area_sqm: 500.0,
    flow_convergence: 0.85,
    flow_turbulence: 0.72,
    trend_slope: 1.10,
    timestamp: now,
  });

  // 2. Insert sample test alerts to verify accountability calculation
  const alert1 = {
    alert_id: `test_alt_${Date.now()}_1`,
    zone_id: 'zone_2',
    severity: 'red',
    alert_type: 'graduated_escalation',
    triggered_at: new Date(Date.now() - 45000).toISOString(),
    assigned_to: 'official_1',
    acknowledged_at: new Date(Date.now() - 15000).toISOString(),
    acknowledged_by: 'official_1',
    escalated_at: null,
    escalated_to: null,
    category: null,
    description: 'High corridor density threshold breach',
    responder_status: 'resolved',
  };

  const alert2 = {
    alert_id: `test_alt_${Date.now()}_2`,
    zone_id: 'zone_2',
    severity: 'red',
    alert_type: 'immediate_panic_alert',
    triggered_at: new Date(Date.now() - 20000).toISOString(),
    assigned_to: 'all_officials',
    acknowledged_at: null,
    acknowledged_by: null,
    escalated_at: new Date(Date.now() - 20000).toISOString(),
    escalated_to: 'all_officials',
    category: null,
    description: 'Crowd panic signature surge',
    responder_status: 'on_scene',
  };

  await insertAlert(alert1);
  await insertAlert(alert2);

  console.log('✓ Inserted test density snapshots and test alerts.');

  // 3. Test Data Aggregation
  console.log('\n--- Testing Data Aggregation ---');
  const aggregated = await aggregateReportData({
    scope: 'all',
    includeSimulatedReference: true,
  });

  console.log('Aggregated Scope:', aggregated.report_metadata.scope);
  console.log('Zone Summaries:', JSON.stringify(aggregated.occupancy_and_density.zone_summaries, null, 2));
  console.log('Accountability Headline Stats:', JSON.stringify(aggregated.accountability_and_response_metrics.headline_standout_stats, null, 2));
  console.log('Supplementary Reference Data:', JSON.stringify(aggregated.supplementary_reference_data, null, 2));

  // 4. Test Report Generation (calls Groq or deterministic fallback)
  console.log('\n--- Testing Report Generation & Persistence ---');
  const report = await generateAndPersistReport(aggregated, 'all');

  console.log('Report ID:', report.report_id);
  console.log('Generation Source:', report.generation_source);
  console.log('Model Name:', report.model_name);
  console.log('Is Fallback:', report.is_fallback);
  console.log('Markdown Content Preview (First 400 chars):');
  console.log(report.markdown_content.substring(0, 400) + '...\n');

  // 5. Test Cache Retrieval
  console.log('\n--- Testing Cache Retrieval (/api/reports/latest) ---');
  const latest = await getLatestReport();
  console.log('Retrieved Latest Report ID:', latest ? latest.report_id : 'None');
  console.log('Latest Report Source:', latest ? latest.generation_source : 'None');
  console.log('Summary Metrics in DB:', latest ? latest.summary_metrics : 'None');

  console.log('\n✓ Capstone Verification Completed Successfully!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
