/**
 * backend/src/sockets/index.js
 * Socket.io server setup and real-time event routing.
 */
'use strict';

const { Server } = require('socket.io');
const { acknowledgeAlert } = require('../services/escalationManager');

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

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

module.exports = { setupSockets };
