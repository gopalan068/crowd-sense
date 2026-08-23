/**
 * backend/src/data/playbookData.js
 * Static Incident Response Playbook Data Table (Source of Truth).
 *
 * CORE PRINCIPLE:
 * Action steps and resource numbers in this file are STATIC, HAND-AUTHORED,
 * and immutable at runtime. They are NEVER generated or altered by an LLM.
 *
 * Sourced either from:
 *   - "ndma_guideline": Adapted from National Disaster Management Authority (NDMA)
 *     published crowd safety & stampede avoidance guidelines.
 *   - "illustrative_default": Reasonable operational defaults for categories without
 *     direct NDMA equivalents (clearly marked as non-official).
 */
'use strict';

const PLAYBOOK_TABLE = {
  // ── 1. CV Graduated Escalation: Yellow (Moderate Density 1.5 - 2.5 p/m²) ───
  cv_graduated_yellow: {
    id: 'cv_graduated_yellow',
    title: 'Moderate Density Monitoring & Flow Maintenance Protocol',
    alert_type: 'graduated_escalation',
    severity: 'yellow',
    source: 'ndma_guideline',
    reference_note: 'Adapted from NDMA Crowd Management Guidelines §4.2 on progressive density monitoring and flow maintenance.',
    required_resources: {
      personnel: 2,
      ambulances: 0,
      evacuation_team: false,
    },
    immediate_actions: [
      'Deploy 2 patrol marshals to observe entry/exit transition flow rates',
      'Verify emergency corridor pathways remain 100% free of temporary physical obstructions',
      'Broadcast gentle "Keep moving forward" advisory over zone PA system',
      'Monitor rate-of-rise trend slope on operations dashboard',
    ],
  },

  // ── 2. CV Graduated Escalation: Orange (Elevated Density 2.5 - 4.0 p/m²) ───
  cv_graduated_orange: {
    id: 'cv_graduated_orange',
    title: 'Elevated Density Baffling & Medical Standby Protocol',
    alert_type: 'graduated_escalation',
    severity: 'orange',
    source: 'ndma_guideline',
    reference_note: 'Adapted from NDMA Guidelines §5.1 on holding-area regulation and medical standby staging.',
    required_resources: {
      personnel: 4,
      ambulances: 1,
      evacuation_team: false,
    },
    immediate_actions: [
      'Deploy 4 crowd management personnel to initiate one-way surge baffling',
      'Stage nearest paramedic / medical standby unit at adjacent access corridor',
      'Temporarily meter outer gate holding queues to reduce influx rate into zone',
      'Brief sector supervisor on potential graduated red escalation',
    ],
  },

  // ── 3. CV Graduated Escalation: Red (Critical Density > 4.0 p/m²) ──────────
  cv_graduated_red: {
    id: 'cv_graduated_red',
    title: 'Critical Density Egress Release & Flow Diversion Protocol',
    alert_type: 'graduated_escalation',
    severity: 'red',
    source: 'ndma_guideline',
    reference_note: 'Adapted from NDMA Guidelines §6.3 on emergency exit release and multi-agency containment.',
    required_resources: {
      personnel: 6,
      ambulances: 2,
      evacuation_team: true,
    },
    immediate_actions: [
      'Deploy 6 rapid-response crowd control personnel to divert converging flow',
      'Unlatch and open all secondary emergency egress gates in the zone immediately',
      'Place 2 dedicated ambulances on active standby at perimeter gate throat',
      'Initiate synchronized crowd diversion announcements over central PA',
      'Establish direct radio communication link between sector team and incident command',
    ],
  },

  // ── 4. CV Panic Signature / Stampede Fast-Path Bypass ───────────────────────
  cv_panic_red: {
    id: 'cv_panic_red',
    title: 'Stampede Surge Avoidance & Mass Exodus Dispersal Protocol',
    alert_type: 'immediate_panic_alert',
    severity: 'red',
    source: 'ndma_guideline',
    reference_note: 'Adapted from NDMA National Disaster Guidelines on Stampede Avoidance & High-Turbulence Surge Mitigation.',
    required_resources: {
      personnel: 8,
      ambulances: 3,
      evacuation_team: true,
    },
    immediate_actions: [
      'Deploy all available on-duty field responders (min 8) to incident zone immediately',
      'Fully unlock all emergency exit corridors and physically remove bottleneck barricades',
      'Dispatch 3 emergency medical and triage units to designated perimeter staging points',
      'Broadcast calm, continuous evacuation guidance instructions over all public address channels',
      'Halt all further incoming crowd ingress at outer perimeter barriers',
    ],
  },

  // ── 5. Citizen Report: Medical Assistance / Emergency ──────────────────────
  citizen_medical: {
    id: 'citizen_medical',
    title: 'Citizen Medical Emergency & Dedicated Egress Protocol',
    alert_type: 'citizen_report',
    category: 'MEDICAL_ASSISTANCE',
    severity: 'red',
    source: 'ndma_guideline',
    reference_note: 'Adapted from NDMA Guidelines §7.2 on dedicated medical evacuation corridors and field triage.',
    required_resources: {
      personnel: 2,
      ambulances: 1,
      evacuation_team: false,
    },
    immediate_actions: [
      'Dispatch nearest 2 first-aid responders directly to victim reporting coordinate',
      'Clear a 3-metre physical buffer perimeter around patient to ensure adequate ventilation',
      'Prepare stretcher evacuation corridor via designated medical route',
      'Coordinate with base medical tent and triage doctor for reception',
    ],
  },

  // ── 6. Citizen Report: Fire / Smoke / Blocked Exits ────────────────────────
  citizen_fire_egress: {
    id: 'citizen_fire_egress',
    title: 'Exit Obstruction Clearance & Sector Rerouting Protocol',
    alert_type: 'citizen_report',
    category: 'FIRE_SMOKE',
    severity: 'red',
    source: 'ndma_guideline',
    reference_note: 'Adapted from NDMA Fire & Egress Safety Guidelines §3.4 on exit unobstructedness.',
    required_resources: {
      personnel: 4,
      ambulances: 1,
      evacuation_team: true,
    },
    immediate_actions: [
      'Dispatch 4 safety marshals to physically clear and unblock obstructed exit doors/turnstiles',
      'Reroute pedestrian streams away from affected sector toward alternative marked conduits',
      'Place venue fire suppression team and water tender on active standby',
      'Guide crowd movement with handheld megaphones to prevent exit bottlenecking',
    ],
  },

  // ── 7. Citizen Report: Crowd Pressure / Stampede Risk ───────────────────────
  citizen_crowd_pressure: {
    id: 'citizen_crowd_pressure',
    title: 'Focal Point Crowd Compression Relief Protocol',
    alert_type: 'citizen_report',
    category: 'CROWD_PRESSURE',
    severity: 'red',
    source: 'ndma_guideline',
    reference_note: 'Adapted from NDMA Crowd Management Guidelines on focal point pressure relief.',
    required_resources: {
      personnel: 5,
      ambulances: 2,
      evacuation_team: true,
    },
    immediate_actions: [
      'Deploy 5 crowd intervention personnel to relieve localized compression points',
      'Open emergency bypass gates to ease lateral pressure on boundary fencing',
      'Direct crowd along perimeter routes using directional megaphones',
      'Position paramedic units at choke point exits for rapid response',
    ],
  },

  // ── 8. Citizen Report: Suspicious Activity ──────────────────────────────────
  citizen_suspicious_activity: {
    id: 'citizen_suspicious_activity',
    title: 'Discreet Security Assessment & Cordon Protocol',
    alert_type: 'citizen_report',
    category: 'SUSPICIOUS_ACTIVITY',
    severity: 'orange',
    source: 'illustrative_default',
    reference_note: 'Illustrative security default for event policing. Not sourced from an official NDMA crowd guideline.',
    required_resources: {
      personnel: 2,
      ambulances: 0,
      evacuation_team: false,
    },
    immediate_actions: [
      'Dispatch 2 security officers to discreetly assess reported item/activity without causing alarm',
      'Maintain visual surveillance via nearest CCTV camera feed',
      'Establish a 10-metre cordon buffer if an unattended suspicious package is confirmed',
      'Brief sector police commander for formal escalation or bomb squad notification',
    ],
  },

  // ── 9. Citizen Report: Violence / Disturbance / Theft ───────────────────────
  citizen_violence_disturbance: {
    id: 'citizen_violence_disturbance',
    title: 'Disturbance Isolation & Peace-Keeping Protocol',
    alert_type: 'citizen_report',
    category: 'VIOLENCE',
    severity: 'orange',
    source: 'illustrative_default',
    reference_note: 'Illustrative operational protocol for venue peace-keeping. Reasonable standard default.',
    required_resources: {
      personnel: 3,
      ambulances: 0,
      evacuation_team: false,
    },
    immediate_actions: [
      'Deploy 3 tactical security personnel to isolate and de-escalate confrontation',
      'Create a physical separation buffer between conflicting parties',
      'Direct surrounding crowd away from confrontation area to prevent crowd surges',
      'Hand over involved individuals to venue police outpost for formal logging',
    ],
  },

  // ── 10. Citizen Report: Missing Person / Child ──────────────────────────────
  citizen_missing_person: {
    id: 'citizen_missing_person',
    title: 'Lost Person Reunification & Perimeter Alert Protocol',
    alert_type: 'citizen_report',
    category: 'MISSING_PERSON',
    severity: 'yellow',
    source: 'illustrative_default',
    reference_note: 'Illustrative lost person reunification procedure. Not an NDMA disaster guideline.',
    required_resources: {
      personnel: 2,
      ambulances: 0,
      evacuation_team: false,
    },
    immediate_actions: [
      'Log missing individual description (name, age, clothing, last seen zone/time)',
      'Alert all perimeter exit gates and turnstile marshals with physical description',
      'Make localized information desk announcement (avoiding general panic wording)',
      'Direct reporting family/guardians to Central Help & Reunification Booth',
    ],
  },

  // ── 11. Citizen Report: General Assistance ─────────────────────────────────
  citizen_general_help: {
    id: 'citizen_general_help',
    title: 'Citizen Assistance & Crowd Support Protocol',
    alert_type: 'citizen_report',
    category: 'GENERAL_HELP',
    severity: 'yellow',
    source: 'illustrative_default',
    reference_note: 'Illustrative citizen assistance standard procedure.',
    required_resources: {
      personnel: 1,
      ambulances: 0,
      evacuation_team: false,
    },
    immediate_actions: [
      'Direct nearest roving volunteer/marshal to assist citizen coordinate',
      'Provide venue orientation, drinking water, or accessibility support as required',
      'Update operational log upon successful resolution of citizen request',
    ],
  },
};

module.exports = {
  PLAYBOOK_TABLE,
};
