/**
 * backend/src/services/controlRoomRules.js
 *
 * Deterministic, inspectable rule matching engine for live Control Room events.
 * Harmonized with Planner recommendation rules (e.g. gate overflow, fast rise)
 * and standard escalation procedures.
 *
 * All rule outputs are strictly grounded in live numbers (density, slope, optical flow, gate states).
 * Every matched recommendation includes complete `triggerData` for accountability and auditability.
 */
'use strict';

/** p/m²/min — density rising faster than this = rapid surge */
const THRESHOLD_FAST_RISE_SLOPE = 0.28;

const LIVE_RULES = [
  // ── Rule 0a: Citizen Medical Emergency ────────────────────────────────────
  {
    id: 'citizen_medical',
    condition: (ctx) =>
      ctx.alert_type === 'citizen_report' &&
      (ctx.category === 'MEDICAL_ASSISTANCE' || ctx.category === 'MEDICAL_EMERGENCY' || String(ctx.category).includes('MEDICAL')),
    recommend: (ctx) => ({
      ruleId: 'citizen_medical',
      text: `Citizen Medical Emergency reported in ${ctx.zoneId}. Dispatch nearest 2 first-aid responders directly to victim coordinate and establish a 3m physical ventilation clearance.`,
      triggerData: {
        alert_type: 'citizen_report',
        category: ctx.category,
        reporter_name: ctx.reporter_name || 'Anonymous Citizen',
        zoneId: ctx.zoneId,
      },
    }),
  },

  // ── Rule 0b: Citizen Blocked Exits / Fire Egress ───────────────────────────
  {
    id: 'citizen_blocked_exits',
    condition: (ctx) =>
      ctx.alert_type === 'citizen_report' &&
      (ctx.category === 'BLOCKED_EXITS' || ctx.category === 'BLOCKED_EXIT' || String(ctx.category).includes('BLOCKED') || String(ctx.category).includes('FIRE')),
    recommend: (ctx) => ({
      ruleId: 'citizen_blocked_exits',
      text: `Citizen reports Blocked Exits/Egress obstruction in ${ctx.zoneId}. Dispatch safety marshals to physically clear and unblock exit gates/doors immediately and reroute pedestrian streams.`,
      triggerData: {
        alert_type: 'citizen_report',
        category: ctx.category,
        reporter_name: ctx.reporter_name || 'Anonymous Citizen',
        zoneId: ctx.zoneId,
      },
    }),
  },

  // ── Rule 0c: Citizen Stampede / Focal Pressure Risk ────────────────────────
  {
    id: 'citizen_stampede_risk',
    condition: (ctx) =>
      ctx.alert_type === 'citizen_report' &&
      (ctx.category === 'STAMPEDE_RISK' || ctx.category === 'GENERAL_PANIC' || String(ctx.category).includes('STAMPEDE') || String(ctx.category).includes('PRESSURE')),
    recommend: (ctx) => ({
      ruleId: 'citizen_stampede_risk',
      text: `Citizen reports Stampede/Surge Risk in ${ctx.zoneId}. Deploy crowd intervention personnel to relieve localized compression points, unlock emergency bypass gates, and guide crowd with directional megaphones.`,
      triggerData: {
        alert_type: 'citizen_report',
        category: ctx.category,
        reporter_name: ctx.reporter_name || 'Anonymous Citizen',
        zoneId: ctx.zoneId,
      },
    }),
  },

  // ── Rule 0d: Citizen Suspicious Activity ──────────────────────────────────
  {
    id: 'citizen_suspicious_activity',
    condition: (ctx) =>
      ctx.alert_type === 'citizen_report' &&
      (ctx.category === 'SUSPICIOUS_ACTIVITY' || String(ctx.category).includes('SUSPICIOUS')),
    recommend: (ctx) => ({
      ruleId: 'citizen_suspicious_activity',
      text: `Citizen reports Suspicious Activity in ${ctx.zoneId}. Dispatch 2 security officers to discreetly assess reported location and maintain visual surveillance via nearest CCTV feed.`,
      triggerData: {
        alert_type: 'citizen_report',
        category: ctx.category,
        reporter_name: ctx.reporter_name || 'Anonymous Citizen',
        zoneId: ctx.zoneId,
      },
    }),
  },

  // ── Rule 0e: Citizen Theft / Disturbance / Violence ───────────────────────
  {
    id: 'citizen_theft_disturbance',
    condition: (ctx) =>
      ctx.alert_type === 'citizen_report' &&
      (ctx.category === 'REPORT_THEFT' || String(ctx.category).includes('THEFT') || String(ctx.category).includes('VIOLENCE') || String(ctx.category).includes('DISTURBANCE')),
    recommend: (ctx) => ({
      ruleId: 'citizen_theft_disturbance',
      text: `Citizen reports Theft/Disturbance in ${ctx.zoneId}. Deploy tactical security personnel to isolate confrontation and establish a physical separation buffer.`,
      triggerData: {
        alert_type: 'citizen_report',
        category: ctx.category,
        reporter_name: ctx.reporter_name || 'Anonymous Citizen',
        zoneId: ctx.zoneId,
      },
    }),
  },

  // ── Rule 0f: Generic Citizen Emergency Fallback ───────────────────────────
  {
    id: 'citizen_general_sos',
    condition: (ctx) => ctx.alert_type === 'citizen_report',
    recommend: (ctx) => ({
      ruleId: 'citizen_general_sos',
      text: `Citizen Emergency SOS reported in ${ctx.zoneId} (${(ctx.category || 'Incident').replace(/_/g, ' ')}). Dispatch nearest roving patrol marshal to assist victim coordinate and verify situation.`,
      triggerData: {
        alert_type: 'citizen_report',
        category: ctx.category,
        reporter_name: ctx.reporter_name || 'Anonymous Citizen',
        zoneId: ctx.zoneId,
      },
    }),
  },

  // ── Rule 1: Panic / Stampede / Mass Exodus Emergency Dispersal ─────────────
  {
    id: 'panic_emergency_dispersal',
    condition: (ctx) => Boolean(ctx.panic_signature || ctx.exodus_signature || ctx.eventType === 'alert_panic'),
    recommend: (ctx) => ({
      ruleId: 'panic_emergency_dispersal',
      text: 'Unlock all perimeter emergency exits immediately, physically clear barricade restrictions, and dispatch all available field responders.',
      triggerData: {
        panic_signature: Boolean(ctx.panic_signature),
        exodus_signature: Boolean(ctx.exodus_signature),
        flow_turbulence: ctx.flow_turbulence ?? null,
        density: ctx.density ?? null,
      },
    }),
  },

  // ── Rule 2: Emergency Gate Active Overflow Valve ─────────────────────────
  {
    id: 'gate_overflow_valve',
    condition: (ctx) => {
      const isElevated = ctx.severity === 'orange' || ctx.severity === 'red';
      const gate2Closed = ctx.gateStates?.opening_gate_2 === false || ctx.gateStates?.gate_2 === 'closed' || ctx.gate2Closed === true;
      return isElevated && gate2Closed;
    },
    recommend: (ctx) => ({
      ruleId: 'gate_overflow_valve',
      text: 'Designate and open Emergency Gate 2 immediately as an active overflow valve to relieve corridor pressure.',
      triggerData: {
        zoneId: ctx.zoneId,
        density: ctx.density ?? null,
        severity: ctx.severity,
        gateState: 'Emergency Gate 2 is closed',
      },
    }),
  },

  // ── Rule 3: Fast Density Rise Rate (Surge Metering) ──────────────────────
  {
    id: 'fast_rise_rate',
    condition: (ctx) => (ctx.trend_slope !== null && ctx.trend_slope !== undefined && ctx.trend_slope >= THRESHOLD_FAST_RISE_SLOPE && ctx.density >= 1.2),
    recommend: (ctx) => ({
      ruleId: 'fast_rise_rate',
      text: 'Rapid crowd surge detected. Implement staggered entry timing and cap arrival influx at upstream entry points to slow rate of buildup.',
      triggerData: {
        trend_slope: ctx.trend_slope,
        threshold: THRESHOLD_FAST_RISE_SLOPE,
        density: ctx.density ?? null,
      },
    }),
  },

  // ── Rule 4: Flow Convergence Chokepoint ──────────────────────────────────
  {
    id: 'convergence_chokepoint',
    condition: (ctx) => (ctx.flow_convergence !== null && ctx.flow_convergence !== undefined && ctx.flow_convergence >= 0.55),
    recommend: (ctx) => ({
      ruleId: 'convergence_chokepoint',
      text: 'High crowd flow convergence detected. Position crowd stewards to split inward movement and redistribute flow away from the junction.',
      triggerData: {
        flow_convergence: ctx.flow_convergence,
        threshold: 0.55,
        density: ctx.density ?? null,
      },
    }),
  },

  // ── Rule 5: Obstacle / Barricade Flow Restriction ─────────────────────────
  {
    id: 'obstacle_flow_restriction',
    condition: (ctx) => (ctx.flow_turbulence !== null && ctx.flow_turbulence !== undefined && ctx.flow_turbulence >= 0.65 && ctx.density >= 2.0),
    recommend: (ctx) => ({
      ruleId: 'obstacle_flow_restriction',
      text: 'Turbulent flow restriction detected near barricades. Establish one-way baffling corridors to prevent cross-flow friction.',
      triggerData: {
        flow_turbulence: ctx.flow_turbulence,
        density: ctx.density,
      },
    }),
  },

  // ── Rule 6: Unacknowledged Escalation Timeout ────────────────────────────
  {
    id: 'unacknowledged_escalation_timeout',
    condition: (ctx) => ctx.eventType === 'alert_escalated',
    recommend: (ctx) => ({
      ruleId: 'unacknowledged_escalation_timeout',
      text: 'Unacknowledged alert escalated to senior command. Dispatch nearest patrol marshal for direct visual verification of sector conditions.',
      triggerData: {
        escalated_to: ctx.escalated_to || 'official_2',
        zoneId: ctx.zoneId,
        timeSinceTriggered: ctx.timeSinceTriggered || '30s',
      },
    }),
  },

  // ── Rule 7: Standard Critical Red Escalation Procedure ────────────────────
  {
    id: 'standard_critical_red',
    condition: (ctx) => ctx.severity === 'red',
    recommend: (ctx) => ({
      ruleId: 'standard_critical_red',
      text: 'Deploy rapid-response personnel to divert converging crowd flow, unlatch secondary emergency egress gates, and stage medical standby unit.',
      triggerData: {
        severity: 'red',
        density: ctx.density ?? null,
        zoneId: ctx.zoneId,
      },
    }),
  },

  // ── Rule 8: Standard Elevated Orange Escalation Procedure ─────────────────
  {
    id: 'standard_elevated_orange',
    condition: (ctx) => ctx.severity === 'orange',
    recommend: (ctx) => ({
      ruleId: 'standard_elevated_orange',
      text: 'Deploy crowd management personnel to initiate one-way surge baffling and temporarily meter outer gate holding queues.',
      triggerData: {
        severity: 'orange',
        density: ctx.density ?? null,
        zoneId: ctx.zoneId,
      },
    }),
  },

  // ── Rule 9: Standard Moderate Yellow Escalation Procedure ─────────────────
  {
    id: 'standard_moderate_yellow',
    condition: (ctx) => ctx.severity === 'yellow' && ctx.eventType === 'threshold_crossed',
    recommend: (ctx) => ({
      ruleId: 'standard_moderate_yellow',
      text: 'Deploy patrol marshals to observe entry/exit transition flow and verify emergency corridor pathways remain 100% unobstructed.',
      triggerData: {
        severity: 'yellow',
        density: ctx.density ?? null,
        zoneId: ctx.zoneId,
      },
    }),
  },
];

/**
 * Match incoming live zone/alert context against the deterministic rules table.
 *
 * @param {Object} ctx
 * @returns {Object|null} Matched recommendation object { ruleId, text, triggerData } or null
 */
function matchLiveRules(ctx) {
  if (!ctx) return null;

  for (const rule of LIVE_RULES) {
    try {
      if (rule.condition(ctx)) {
        return rule.recommend(ctx);
      }
    } catch (err) {
      console.warn(`[ControlRoomRules] Error evaluating rule ${rule.id}:`, err.message);
    }
  }

  return null;
}

module.exports = {
  matchLiveRules,
  LIVE_RULES,
  THRESHOLD_FAST_RISE_SLOPE,
};
