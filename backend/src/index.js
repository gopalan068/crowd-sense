/**
 * backend/src/index.js
 * Express + Socket.io entry point.
 */
'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');

const { setupSockets } = require('./sockets');
const densityRouter = require('./routes/density');
const alertsRouter = require('./routes/alerts');
const postEventRouter = require('./routes/postEvent');
const { router: respondersRouter } = require('./routes/responders');
const citizenReportsRouter = require('./routes/citizenReports');
const conditionsRouter = require('./routes/conditions');
const { sendEmergencyNotification } = require('./services/notifications');

const PORT = process.env.PORT || 4000;

const app = express();
const server = http.createServer(app);

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Health check ---
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'crowd-safety-backend',
    optical_flow_enabled: (process.env.ENABLE_OPTICAL_FLOW || 'true').toLowerCase() !== 'false',
    timestamp: new Date().toISOString(),
  });
});

// --- Dispatch Simulation REST endpoint ---
app.post('/api/dispatch/simulate', async (req, res) => {
  const { action, zone_id } = req.body || {};
  const io = app.get('io');
  const result = await sendEmergencyNotification({
    zone_id: zone_id || 'zone_1',
    message: `[MOCK DISPATCH] ${action || 'SIREN ACTIVATION'} triggered for ${zone_id || 'zone_1'}.`,
    is_panic: true,
  });

  if (io) {
    io.emit('mock_dispatch_toast', {
      zone_id: zone_id || 'zone_1',
      title: action || 'MOCK DISPATCH ACTIVATED',
      message: result.message,
      timestamp: result.timestamp,
      is_simulation: true,
    });
  }

  return res.status(200).json(result);
});

// --- Routes ---
app.use('/api', densityRouter);
app.use('/api', alertsRouter);
app.use('/api', postEventRouter);
app.use('/api', respondersRouter);
app.use('/api', citizenReportsRouter);
app.use('/api', conditionsRouter);

// --- Socket.io ---
const io = setupSockets(server);
app.set('io', io);

// --- Start ---
server.listen(PORT, () => {
  console.log(`[Backend] Running           → http://localhost:${PORT}`);
  console.log(`[Backend] Health            → http://localhost:${PORT}/health`);
  console.log(`[Backend] Density           → POST http://localhost:${PORT}/api/density`);
  console.log(`[Backend] AuditLog          → GET http://localhost:${PORT}/api/audit-log`);
  console.log(`[Backend] PostEventTimeline → GET http://localhost:${PORT}/api/post-event-timeline`);
  console.log(`[Backend] ResponderCheckin  → POST http://localhost:${PORT}/api/responders/checkin`);
  console.log(`[Backend] ResponderNearest  → GET http://localhost:${PORT}/api/responders/nearest?zone_id=zone_1`);
  console.log(`[Backend] CitizenReport     → POST http://localhost:${PORT}/api/citizen-reports`);
  console.log(`[Backend] WeatherConditions → GET http://localhost:${PORT}/api/conditions/current | POST http://localhost:${PORT}/api/conditions/set`);
});
