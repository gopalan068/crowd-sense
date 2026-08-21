/**
 * backend/scripts/fake_generator.js
 * Synthetic CV Data Generator Script.
 *
 * Ramps up crowd density over time to simulate a building crowd surge.
 * Allows full end-to-end testing of green → yellow → orange → red → panic alerts
 * and auto-escalation timers without a camera feed.
 *
 * Usage:
 *   node backend/scripts/fake_generator.js [--panic] [--fast] [--zone=zone_1]
 */
'use strict';

const http = require('http');

const BACKEND_HOST = process.env.BACKEND_HOST || 'localhost';
const BACKEND_PORT = process.env.BACKEND_PORT || 4000;

const args = process.argv.slice(2);
const isPanicMode = args.includes('--panic');
const isFastMode = args.includes('--fast');

const zoneArg = args.find((a) => a.startsWith('--zone='));
const zone_id = zoneArg ? zoneArg.split('=')[1] : 'zone_1';

const intervalMs = isFastMode ? 500 : 1000;
const area_sqm = 20.0;

let currentPeople = isPanicMode ? 70 : 8; // start light unless panic flag passed
const targetPeopleMax = 95; // density ~4.75 (triggers panic alert)

console.log(`[FakeGenerator] Starting density generator for zone '${zone_id}'...`);
console.log(`[FakeGenerator] Target backend: http://${BACKEND_HOST}:${BACKEND_PORT}/api/density`);
console.log(`[FakeGenerator] Interval: ${intervalMs}ms | Mode: ${isPanicMode ? 'PANIC SURGE' : 'RAMP UP'}`);

let step = 0;

function sendReading() {
  step++;

  if (isPanicMode) {
    currentPeople = Math.min(targetPeopleMax, currentPeople + 8);
  } else {
    // Gradual rise over 30 steps, then reset to simulate crowd flow cycle
    if (step % 40 < 10) {
      currentPeople = Math.max(5, currentPeople - 2); // green/yellow
    } else if (step % 40 < 25) {
      currentPeople += 3; // yellow/orange
    } else {
      currentPeople += 4; // red / surge
    }
  }

  const people_count = currentPeople;
  const density = Math.round((people_count / area_sqm) * 1000) / 1000;
  const timestamp = new Date().toISOString();

  const payload = JSON.stringify({
    zone_id,
    zone_type: 'general',
    people_count,
    area_sqm,
    density,
    flow_convergence: 0.0,
    flow_turbulence: 0.0,
    timestamp,
  });

  const req = http.request(
    {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/api/density',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    (res) => {
      if (res.statusCode === 200) {
        console.log(
          `[FakeGenerator] Sent reading #${step}: count=${people_count} ` +
          `density=${density}/m² timestamp=${timestamp}`
        );
      } else {
        console.warn(`[FakeGenerator] Backend returned status ${res.statusCode}`);
      }
    }
  );

  req.on('error', (err) => {
    console.error(`[FakeGenerator] Failed to send reading: ${err.message}`);
  });

  req.write(payload);
  req.end();
}

// Start sending every second
setInterval(sendReading, intervalMs);
sendReading();
