/**
 * backend/scripts/fake_generator.js
 * Multi-Zone Synthetic CV Data Generator Script.
 *
 * Emits concurrent readings for:
 *   - zone_1 (general, live_webcam): Ramps gradually (safe → moderate)
 *   - zone_2 (corridor, pre_recorded): Ramps aggressively, pushing density past corridor red threshold (2.0 p/m²)
 *
 * Usage:
 *   node backend/scripts/fake_generator.js [--panic] [--fast]
 */
'use strict';

const http = require('http');

const BACKEND_HOST = process.env.BACKEND_HOST || 'localhost';
const BACKEND_PORT = process.env.BACKEND_PORT || 4000;

const args = process.argv.slice(2);
const isPanicMode = args.includes('--panic');
const isFastMode = args.includes('--fast');
const intervalMs = isFastMode ? 500 : 1000;

let step = 0;

let z1_people = 10; // Zone 1 General (20 sqm area)
let z2_people = 15; // Zone 2 Corridor (15 sqm area)

console.log(`[FakeGenerator] Multi-Zone Generator starting...`);
console.log(`[FakeGenerator] Target backend: http://${BACKEND_HOST}:${BACKEND_PORT}/api/density`);
console.log(`[FakeGenerator] Interval: ${intervalMs}ms | Mode: ${isPanicMode ? 'PANIC SURGE' : 'RAMP UP'}`);

function sendZoneReading(zone_id, zone_type, feed_source, people_count, area_sqm) {
  const density = Math.round((people_count / area_sqm) * 1000) / 1000;
  const timestamp = new Date().toISOString();

  const payload = JSON.stringify({
    zone_id,
    zone_type,
    feed_source,
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
      if (res.statusCode !== 200) {
        console.warn(`[FakeGenerator] Backend returned status ${res.statusCode}`);
      }
    }
  );

  req.on('error', (err) => {
    console.error(`[FakeGenerator] Error for ${zone_id}: ${err.message}`);
  });

  req.write(payload);
  req.end();
}

function tick() {
  step++;

  if (isPanicMode) {
    z1_people = Math.min(80, z1_people + 5);
    z2_people = Math.min(65, z2_people + 8);
  } else {
    // Zone 1: Moderate variation (density 0.5 to 2.2)
    if (step % 30 < 15) {
      z1_people = Math.min(44, z1_people + 2);
    } else {
      z1_people = Math.max(10, z1_people - 2);
    }

    // Zone 2 Corridor: Surging (density 1.0 to 3.2 - BREACHES CORRIDOR RED THRESHOLD 2.0)
    if (step % 20 < 12) {
      z2_people = Math.min(50, z2_people + 3);
    } else {
      z2_people = Math.max(15, z2_people - 4);
    }
  }

  // Send readings for both zones
  sendZoneReading('zone_1', 'general', 'live_webcam', z1_people, 20.0);
  sendZoneReading('zone_2', 'corridor', 'pre_recorded', z2_people, 15.0);

  console.log(
    `[FakeGenerator] #${step} | Z1 (General): ${z1_people}p (${(z1_people/20).toFixed(2)}/m²) | ` +
    `Z2 (Corridor): ${z2_people}p (${(z2_people/15).toFixed(2)}/m²)`
  );
}

setInterval(tick, intervalMs);
tick();
