/**
 * frontend/src/lib/scenarios.js
 *
 * Named, deterministic scenario configurations for the CrowdSense Planner
 * Pre-Event Bottleneck Analysis module.
 *
 * Each scenario fully specifies simulation parameters and any scripted events,
 * making runs deterministic and reproducible regardless of the user's current
 * real-time simulation state.
 *
 * Scripted event trigger types:
 *   "time"           — fires at a specific simulated second (atSec)
 *   "first_red_zone" — fires the first time any grid cell crosses the Fruin
 *                      red threshold (3.8 p/m²) — see bottleneckAnalysis.js
 *
 * Scripted event actions:
 *   "openGate"        — sets opening[gateId].isOpen = true
 *   "closeGate"       — sets opening[gateId].isOpen = false
 *   "triggerEmergency"— switches all agents to panic mode (nearest exit)
 */

/** Fruin LOS F threshold (people/m²) — imported to keep in sync with fruinDensity.js */
export const RED_THRESHOLD = 3.8

export const SCENARIOS = {
  baseline: {
    id: 'baseline',
    label: 'Baseline',
    description:
      'Normal spawn rate, gates as configured in the current venue (Gate 1 open, Gate 2 closed).',
    spawnRatePerSec: 5,
    maxAgents: 600,
    durationSec: 120,
    scriptedEvents: [],
  },

  gate2_closed_full: {
    id: 'gate2_closed_full',
    label: 'Gate 2 Closed (Full Duration)',
    description:
      'Gate 2 (emergency opening) remains closed for the entire simulation. ' +
      'Shows crowd behaviour when the secondary egress is unavailable.',
    spawnRatePerSec: 5,
    maxAgents: 600,
    durationSec: 120,
    // Gate 2 starts closed by default (isOpen:false) — no explicit events needed.
    // The runner will force-close all openings at scenario init via closeAllOpenings.
    scriptedEvents: [],
    forceCloseAllGates: true,   // runner-level flag: start with all openings closed
  },

  gate2_opens_at_crisis: {
    id: 'gate2_opens_at_crisis',
    label: 'Gate 2 Opens at First Red Zone',
    description:
      'Gate 2 automatically opens the first time any zone crosses the critical ' +
      'density threshold (3.8 p/m²). Demonstrates reactive gate management.',
    spawnRatePerSec: 5,
    maxAgents: 600,
    durationSec: 120,
    scriptedEvents: [
      {
        trigger: 'first_red_zone',
        action:  'openGate',
        // Target the first available closed opening (fallback if ID not found)
        gateId:  'opening_1788696075354',
      },
    ],
  },

  overcapacity: {
    id: 'overcapacity',
    label: 'Overcapacity Arrival',
    description:
      'Spawn rate pushed well above expected normal attendance (2.4× baseline). ' +
      'Stress-tests chokepoints under surge conditions.',
    spawnRatePerSec: 12,
    maxAgents: 800,
    durationSec: 120,
    scriptedEvents: [],
  },

  focus_normal: {
    id: 'focus_normal',
    label: 'Focus Point Convergence (Normal)',
    description:
      'Agents actively converge on the designated venue Focus Point (e.g. shrine, stage, or central junction) ' +
      'under normal walking conditions. Identifies focal accumulation and gathering-zone bottlenecks.',
    spawnRatePerSec: 5,
    maxAgents: 600,
    durationSec: 120,
    isFocusMode: true,
    focusCondition: 'normal',
    scriptedEvents: [],
  },

  focus_surged: {
    id: 'focus_surged',
    label: 'Focus Point Surge (Rushed / Surged)',
    description:
      'Crowd converges towards the designated Focus Point under rushed/surged conditions (2.0× speed multiplier). ' +
      'Stress-tests focal crush zones and rapid accumulation around key attractions.',
    spawnRatePerSec: 7,
    maxAgents: 650,
    durationSec: 120,
    isFocusMode: true,
    focusCondition: 'rushed',
    scriptedEvents: [],
  },

  panic_midway: {
    id: 'panic_midway',
    label: 'Panic Trigger Midway',
    description:
      'Emergency / panic mode is activated at T+60s. All agents switch to ' +
      'nearest-exit navigation at panic speed. Tests egress paths under crisis.',
    spawnRatePerSec: 5,
    maxAgents: 600,
    durationSec: 120,
    scriptedEvents: [
      { trigger: 'time', atSec: 60, action: 'triggerEmergency' },
    ],
  },
}

/** Ordered list for UI rendering (preserves logical grouping) */
export const SCENARIO_ORDER = [
  'baseline',
  'gate2_closed_full',
  'gate2_opens_at_crisis',
  'overcapacity',
  'focus_normal',
  'focus_surged',
  'panic_midway',
]
