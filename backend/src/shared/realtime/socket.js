/**
 * Socket.IO realtime channels.
 *
 * Root namespace:
 *   - ai-job:<jobId> rooms for AI Studio generation progress.
 *   - kashi-fix:<runId> rooms for Kashi fix progress.
 *
 * Admin namespace (/admin):
 *   - authenticated admin-only connection.
 *   - pool status is pushed only while a browser is subscribed.
 *   - when the last admin subscriber leaves a pool, its watcher stops.
 *   - there is no browser polling of /admin/*-pool/status.
 */

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('../../modules/user/user.model');
const geminiPoolClient = require('../../modules/gemini-pool/geminiPoolServiceClient');
const groqPoolClient = require('../../modules/groq-pool/groqPoolServiceClient');

let io = null;
let adminIo = null;

const ADMIN_POOL_STATUS_INTERVAL_MS = Math.max(
  2000,
  Number.parseInt(process.env.ADMIN_POOL_SOCKET_INTERVAL_MS || '10000', 10) || 5000,
);

const adminPoolWatchers = {
  gemini: { sockets: new Set(), timer: null, inFlight: false },
  groq: { sockets: new Set(), timer: null, inFlight: false },
};

function getBearerToken(socket) {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();

  const header = socket.handshake.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim();

  return null;
}

async function authenticateAdmin(socket, next) {
  try {
    const token = getBearerToken(socket);
    if (!token) return next(new Error('Authentication required.'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('role');

    if (!user || user.role !== 'admin') {
      return next(new Error('Admin privileges required.'));
    }

    socket.userId = String(user._id);
    socket.isAdmin = true;
    return next();
  } catch (error) {
    return next(new Error('Invalid or expired admin token.'));
  }
}

async function fetchPoolStatus(poolName) {
  if (poolName === 'gemini') return geminiPoolClient.getLiveStatus();
  if (poolName === 'groq') return groqPoolClient.getLiveStatus();
  return null;
}

async function pushPoolStatus(poolName) {
  const watcher = adminPoolWatchers[poolName];
  if (!watcher || watcher.sockets.size === 0 || watcher.inFlight) return;

  watcher.inFlight = true;
  try {
    const live = await fetchPoolStatus(poolName);
    for (const client of watcher.sockets) {
      client.emit('admin:pool:status', {
        pool: poolName,
        live: live || null,
        serverTimestamp: Date.now(),
      });
    }
  } catch (error) {
    console.warn(`[admin socket] ${poolName} pool status push failed:`, error.message);
  } finally {
    watcher.inFlight = false;
  }
}

function startPoolWatcher(poolName) {
  const watcher = adminPoolWatchers[poolName];
  if (!watcher || watcher.timer || watcher.sockets.size === 0) return;

  // Send the first snapshot immediately, then refresh only while at least one
  // admin browser is subscribed to this pool.
  pushPoolStatus(poolName);
  watcher.timer = setInterval(() => pushPoolStatus(poolName), ADMIN_POOL_STATUS_INTERVAL_MS);
  watcher.timer.unref?.();
}

function stopPoolWatcher(poolName) {
  const watcher = adminPoolWatchers[poolName];
  if (!watcher || watcher.sockets.size > 0) return;
  if (watcher.timer) clearInterval(watcher.timer);
  watcher.timer = null;
  watcher.inFlight = false;
}

function subscribeAdminPool(socket, poolName) {
  if (!adminPoolWatchers[poolName]) return;
  const watcher = adminPoolWatchers[poolName];
  watcher.sockets.add(socket);
  startPoolWatcher(poolName);
}

function unsubscribeAdminPool(socket, poolName) {
  if (!adminPoolWatchers[poolName]) return;
  const watcher = adminPoolWatchers[poolName];
  watcher.sockets.delete(socket);
  stopPoolWatcher(poolName);
}

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
    socket.on('kashi-fix:subscribe', (runId) => {
      if (typeof runId === 'string' && runId) socket.join(`kashi-fix:${runId}`);
    });
    socket.on('kashi-fix:unsubscribe', (runId) => {
      if (typeof runId === 'string' && runId) socket.leave(`kashi-fix:${runId}`);
    });
  });

  adminIo = io.of('/admin');
  adminIo.use(authenticateAdmin);
  adminIo.on('connection', (socket) => {
    socket.on('admin:pools:subscribe', (poolName) => {
      if (poolName === 'gemini' || poolName === 'groq') {
        subscribeAdminPool(socket, poolName);
      }
    });

    socket.on('admin:pools:unsubscribe', (poolName) => {
      if (poolName === 'gemini' || poolName === 'groq') {
        unsubscribeAdminPool(socket, poolName);
      }
    });

    socket.on('disconnect', () => {
      unsubscribeAdminPool(socket, 'gemini');
      unsubscribeAdminPool(socket, 'groq');
    });
  });

  return io;
}

function emitToJob(jobId, event, payload) {
  if (!io) return;
  io.to(`ai-job:${jobId}`).emit(event, payload);
}

function emitToKashiRun(runId, event, payload) {
  if (!io) return;
  io.to(`kashi-fix:${runId}`).emit(event, payload);
}

module.exports = { init, emitToJob, emitToKashiRun };
