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
    timestamp: new Date().toISOString(),
  });
});

// --- Routes ---
app.use('/api', densityRouter);
app.use('/api', alertsRouter);

// --- Socket.io ---
const io = setupSockets(server);
app.set('io', io);

// --- Start ---
server.listen(PORT, () => {
  console.log(`[Backend] Running  → http://localhost:${PORT}`);
  console.log(`[Backend] Health   → http://localhost:${PORT}/health`);
  console.log(`[Backend] Density  → POST http://localhost:${PORT}/api/density`);
  console.log(`[Backend] AuditLog → GET http://localhost:${PORT}/api/audit-log`);
});
