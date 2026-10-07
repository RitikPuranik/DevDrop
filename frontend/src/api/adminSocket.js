import { io } from 'socket.io-client';

let adminSocket = null;
const subscribers = new Map();

function getBaseUrl() {
  return import.meta.env.VITE_API_URL || window.location.origin;
}

function notifyPool(pool, live, payload) {
  const poolSubscribers = subscribers.get(pool);
  if (!poolSubscribers) return;
  for (const callback of Array.from(poolSubscribers)) {
    try {
      callback(live || null, payload);
    } catch (error) {
      console.warn(`[admin socket] ${pool} subscriber failed:`, error?.message || error);
    }
  }
}

function emitActiveSubscriptions(socket) {
  for (const pool of subscribers.keys()) {
    socket.emit('admin:pools:subscribe', pool);
  }
}

function disconnectAdminSocket() {
  if (!adminSocket) return;
  adminSocket.disconnect();
  adminSocket = null;
}

function ensureSocket() {
  if (adminSocket) return adminSocket;

  const token = localStorage.getItem('token');
  if (!token) return null;

  adminSocket = io(`${getBaseUrl()}/admin`, {
    auth: { token },
    withCredentials: true,
    autoConnect: true,
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 8000,
  });

  adminSocket.on('connect', () => {
    // Namespace subscriptions are lost after a socket reconnect because the
    // server-side room membership belongs to the old connection.
    emitActiveSubscriptions(adminSocket);
  });

  adminSocket.on('admin:pool:status', (payload) => {
    const pool = payload?.pool;
    if (pool !== 'gemini' && pool !== 'groq') return;
    notifyPool(pool, payload.live, payload);
  });

  adminSocket.on('connect_error', (error) => {
    console.warn('[admin socket] connection failed:', error.message);
  });

  return adminSocket;
}

// The AdminPanel owns the socket lifetime. It connects only after the page has
// verified the user is an admin and disconnects when the admin page unmounts.
export function connectAdminSocket() {
  return ensureSocket();
}

export function closeAdminSocket() {
  subscribers.clear();
  disconnectAdminSocket();
}

export function subscribeToAdminPoolStatus(pool, callback) {
  if (pool !== 'gemini' && pool !== 'groq') {
    throw new Error(`Unsupported admin pool: ${pool}`);
  }

  let poolSubscribers = subscribers.get(pool);
  if (!poolSubscribers) {
    poolSubscribers = new Set();
    subscribers.set(pool, poolSubscribers);
  }
  poolSubscribers.add(callback);

  const socket = ensureSocket();
  if (socket?.connected) {
    socket.emit('admin:pools:subscribe', pool);
  }

  return () => {
    const current = subscribers.get(pool);
    current?.delete(callback);
    if (current?.size === 0) {
      subscribers.delete(pool);
      if (adminSocket?.connected) {
        adminSocket.emit('admin:pools:unsubscribe', pool);
      }
    }
  };
}

// Logging out in another part of the app should immediately tear down the
// privileged namespace instead of keeping a stale JWT connection alive.
if (typeof window !== 'undefined') {
  window.addEventListener('auth-changed', () => {
    subscribers.clear();
    disconnectAdminSocket();
  });
}
