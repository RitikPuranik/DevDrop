/**
 * Thin Socket.IO wrapper for pushing AI-generation progress to the
 * frontend. Clients join a room named `ai-job:<jobId>` right after they
 * receive a jobId from POST /api/ai-generate, and this module emits
 * per-agent + completion events into that room as they arrive from
 * ai-service's webhook — replacing the old 2s frontend poll loop.
 */

const { Server } = require('socket.io');

let io = null;

function init(httpServer, { allowedOrigins } = {}) {
  io = new Server(httpServer, {
    cors: { origin: allowedOrigins || '*', credentials: true },
  });

  io.on('connection', (socket) => {
    socket.on('ai-job:subscribe', (jobId) => {
      if (typeof jobId === 'string' && jobId) socket.join(`ai-job:${jobId}`);
    });
    socket.on('ai-job:unsubscribe', (jobId) => {
      if (typeof jobId === 'string' && jobId) socket.leave(`ai-job:${jobId}`);
    });
  });

  return io;
}

function emitToJob(jobId, event, payload) {
  if (!io) return; // socket.io not initialized (e.g. in tests) — no-op
  io.to(`ai-job:${jobId}`).emit(event, payload);
}

module.exports = { init, emitToJob };
