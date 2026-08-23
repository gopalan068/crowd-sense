/**
 * backend/src/sockets/index.js
 * Socket.io server setup and real-time event routing.
 */
'use strict';

const { Server } = require('socket.io');
const { acknowledgeAlert, updateAlertStatus } = require('../services/escalationManager');
const { recordPlaybookStep } = require('../services/playbookService');

/**
 * Attaches Socket.io to the existing http.Server and returns the io instance.
 * @param {import('http').Server} server
 * @returns {import('socket.io').Server}
 */
function setupSockets(server) {
  const io = new Server(server, {
    cors: {
      origin: '*', // Allow frontend dev & production connections
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected:    ${socket.id}`);

    // Client acknowledges an alert over WebSocket
    socket.on('acknowledge_alert', async (data) => {
      const { alert_id, acknowledged_by } = data || {};
      if (alert_id) {
        await acknowledgeAlert(alert_id, acknowledged_by || 'official_1', io);
      }
    });

    // Responder updates operational status over WebSocket
    // Same as POST /api/alerts/:id/status but via WebSocket for lower latency.
    socket.on('update_alert_status', async (data) => {
      const { alert_id, status, responder_id } = data || {};
      if (alert_id && status) {
        await updateAlertStatus(alert_id, status, responder_id || 'unknown_responder', io);
      }
    });

    // Complete a playbook checklist action step over WebSocket
    socket.on('complete_playbook_step', async (data) => {
      const { alert_id, step_index, step_text, completed_by } = data || {};
      if (alert_id && step_index !== undefined && step_text) {
        await recordPlaybookStep(
          alert_id,
          Number(step_index),
          String(step_text),
          completed_by || 'official_1',
          io
        );
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

module.exports = { setupSockets };
