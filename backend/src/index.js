/**
 * backend/src/index.js
 * Express + Socket.io entry point.
 */
'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const { setupSockets } = require('./sockets');
const densityRouter = require('./routes/density');
const alertsRouter = require('./routes/alerts');
const postEventRouter = require('./routes/postEvent');
const { router: respondersRouter } = require('./routes/responders');
const citizenReportsRouter = require('./routes/citizenReports');
const conditionsRouter = require('./routes/conditions');
const reportsRouter = require('./routes/reports');
const venuesRouter = require('./routes/venues');
const plannerRouter = require('./routes/planner');
const pipelineRouter = require('./routes/pipeline');
const assistantRouter = require('./routes/assistant');
const { seedDemoVenue } = require('../scripts/seedDemoVenue');
const { sendEmergencyNotification } = require('./services/notifications');

const PORT = process.env.PORT || 4000;

const app = express();
const server = http.createServer(app);

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Health check ---
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'crowd-safety-backend',
    optical_flow_enabled: (process.env.ENABLE_OPTICAL_FLOW || 'true').toLowerCase() !== 'false',
    groq_configured: Boolean(process.env.GROQ_API_KEY),
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
app.use('/api', reportsRouter);
app.use('/api', venuesRouter);
app.use('/api', plannerRouter);
app.use('/api', pipelineRouter);
app.use('/api', assistantRouter);

// --- Dual Video Stream Proxy (Port 5001 -> Port 4000) ---
// Seamlessly proxies both CCTV (Zone 1) and Drone Overhead (Zone 2) MJPEG video feeds in production
app.get('/stream/:zone_id', (req, res) => {
  const { zone_id } = req.params;
  const streamReq = http.request(
    {
      hostname: '127.0.0.1',
      port: 5001,
      path: `/stream/${zone_id}`,
      method: 'GET',
    },
    (streamRes) => {
      res.writeHead(streamRes.statusCode, streamRes.headers);
      streamRes.pipe(res);
    }
  );

  streamReq.on('error', () => {
    res.status(503).send('Stream service unavailable');
  });

  req.on('close', () => {
    streamReq.destroy();
  });

  streamReq.end();
});

// --- Serve Frontend Static Build (Single Service Deployment) ---
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  console.log(`[Backend] Serving frontend static assets from: ${frontendDistPath}`);
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

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
  console.log(`[Backend] ReportsGenerate   → POST http://localhost:${PORT}/api/reports/generate`);
  console.log(`[Backend] ReportsLatest     → GET http://localhost:${PORT}/api/reports/latest`);
  console.log(`[Backend] Venues            → GET/POST http://localhost:${PORT}/api/venues`);
  console.log(`[Backend] PlannerNarrate   → POST http://localhost:${PORT}/api/planner/narrate-report`);
  // Seed demo venue after a short delay to let DB initialize tables
  setTimeout(seedDemoVenue, 500);
});
