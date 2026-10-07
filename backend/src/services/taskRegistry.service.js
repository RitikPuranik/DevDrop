// In-memory record of tasks the Backend dispatched to the Worker.
// No timers: expired entries are pruned lazily on access so the Backend
// keeps running zero background schedulers.

const TASK_STATUSES = ['queued', 'running', 'completed', 'failed'];
const TERMINAL = new Set(['completed', 'failed']);
const RANK = { queued: 0, running: 1, completed: 2, failed: 2 };
const TTL_MS = 60 * 60 * 1000;

const tasks = new Map();

const prune = () => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, t] of tasks) {
    if (TERMINAL.has(t.status) && t.updatedAt < cutoff) tasks.delete(id);
  }
};

const create = (taskId, type, payload = null) => {
  prune();
  const now = Date.now();
  const task = { taskId, type, payload, status: 'queued', result: null, error: null, createdAt: now, updatedAt: now };
  tasks.set(taskId, task);
  return task;
};

// Ignores out-of-order updates (e.g. a late "running" after "completed").
const update = (taskId, { status, result, error }) => {
  if (!TASK_STATUSES.includes(status)) return null;
  const task = tasks.get(taskId);
  if (!task) return null;
  if (RANK[status] < RANK[task.status] || (TERMINAL.has(task.status) && status !== task.status)) return task;
  task.status = status;
  if (result !== undefined) task.result = result;
  if (error !== undefined) task.error = error;
  task.updatedAt = Date.now();
  return task;
};

const get = (taskId) => tasks.get(taskId) || null;
const clear = () => tasks.clear();

module.exports = { TASK_STATUSES, create, update, get, clear };
