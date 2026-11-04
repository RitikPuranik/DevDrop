// Pure helpers for the deployment-management UI (kept free of React so they're trivially testable).

export const STATE_META = {
  READY: { label: 'Ready', tone: 'ok' },
  ERROR: { label: 'Failed', tone: 'bad' },
  BUILDING: { label: 'Building', tone: 'busy' },
  INITIALIZING: { label: 'Initializing', tone: 'busy' },
  QUEUED: { label: 'Queued', tone: 'busy' },
  CANCELED: { label: 'Canceled', tone: 'muted' },
  UNKNOWN: { label: 'Unknown', tone: 'muted' },
};

export const TONE_CLASSES = {
  ok: 'text-emerald-300 bg-emerald-400/10 border-emerald-300/20',
  bad: 'text-red-300 bg-red-500/10 border-red-400/20',
  busy: 'text-[#cbb392] bg-[#cbb392]/10 border-[#cbb392]/20',
  muted: 'text-white/45 bg-white/5 border-white/10',
  accent: 'text-[#cbb392] bg-[#cbb392]/10 border-[#cbb392]/25',
  info: 'text-sky-300 bg-sky-400/10 border-sky-300/20',
};

export const stateMeta = (state) => STATE_META[state] || STATE_META.UNKNOWN;

export const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
};

export const formatRelative = (value, now = Date.now()) => {
  const t = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(t)) return '—';
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const formatAbsolute = (value) => {
  const t = value ? new Date(value) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toLocaleString() : '—';
};

export const formatLogTime = (ts) => {
  if (!Number.isFinite(ts) || ts <= 0) return '--:--:--';
  const d = new Date(ts);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

/** Stable key so a double-click / network retry of the same confirmation maps to one server-side operation. */
export const newIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export const isOperationActive = (op) => Boolean(op && op.active);

/** Pulls the server's user-safe message out of an axios error. */
export const apiErrorMessage = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.message || (err?.code === 'ECONNABORTED' ? 'The request timed out.' : fallback);

export const RANGE_PRESETS = [
  { id: 'all', label: 'All time', ms: null },
  { id: '15m', label: 'Last 15 min', ms: 15 * 60 * 1000 },
  { id: '1h', label: 'Last hour', ms: 60 * 60 * 1000 },
  { id: '6h', label: 'Last 6 hours', ms: 6 * 60 * 60 * 1000 },
  { id: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
];

export const rangeToSince = (rangeId, now = Date.now()) => {
  const preset = RANGE_PRESETS.find((r) => r.id === rangeId);
  return preset && preset.ms ? now - preset.ms : undefined;
};

export const LEVEL_CLASSES = {
  error: 'text-red-300',
  warning: 'text-amber-300',
  info: 'text-white/50',
  debug: 'text-white/30',
};

export const OPERATION_STEPS = [
  { key: 'validated', label: 'Checked' },
  { key: 'requested', label: 'Sent to Vercel' },
  { key: 'verifying', label: 'Switching production' },
  { key: 'confirmed', label: 'Confirmed' },
];
