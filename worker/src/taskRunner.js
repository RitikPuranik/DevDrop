// Minimal in-process task runner: bounded concurrency + bounded FIFO queue.
// No external queue system — tasks live in memory and are lost on restart.

const createTaskRunner = ({ handlers, concurrency = 2, maxQueue = 50, onStatus = async () => {} }) => {
  const queue = [];
  const running = new Set();
  const known = new Set(); // taskIds queued or running (idempotency for retried webhooks)
  let accepting = true;
  let idleResolvers = [];

  const notifyIdle = () => {
    if (running.size === 0 && queue.length === 0) {
      idleResolvers.forEach((r) => r());
      idleResolvers = [];
    }
  };

  const report = async (task, status, extra) => {
    try {
      await onStatus(task, status, extra);
    } catch (err) {
      // A failed callback must never affect the task or the Worker.
      console.warn(`⚠️  Task ${task.taskId} status callback (${status}) failed: ${err.message}`);
    }
  };

  const execute = async (task) => {
    running.add(task.taskId);
    console.log(`▶️  Task started: ${task.taskId} (${task.type})`);
    await report(task, 'running');
    try {
      const result = await handlers[task.type](task.payload || {}, task);
      console.log(`✅ Task completed: ${task.taskId} (${task.type})`);
      await report(task, 'completed', { result: result === undefined ? null : result });
    } catch (err) {
      console.error(`❌ Task failed: ${task.taskId} (${task.type}): ${err.message}`);
      await report(task, 'failed', { error: err.message });
    } finally {
      running.delete(task.taskId);
      known.delete(task.taskId);
      pump();
      notifyIdle();
    }
  };

  function pump() {
    while (running.size < concurrency && queue.length > 0) {
      const next = queue.shift();
      execute(next); // execute() never rejects
    }
  }

  const enqueue = (task) => {
    if (!accepting) return { accepted: false, reason: 'shutting_down' };
    if (!handlers[task.type]) return { accepted: false, reason: 'unknown_type' };
    if (known.has(task.taskId)) return { accepted: true, duplicate: true };
    if (queue.length >= maxQueue) return { accepted: false, reason: 'queue_full' };

    known.add(task.taskId);
    queue.push(task);
    console.log(`📥 Task queued: ${task.taskId} (${task.type})`);
    report(task, 'queued');
    pump();
    return { accepted: true };
  };

  // Stop accepting work and wait (up to timeoutMs) for in-flight tasks.
  const drain = async (timeoutMs) => {
    accepting = false;
    queue.length = 0;
    if (running.size === 0) return true;
    return Promise.race([
      new Promise((resolve) => idleResolvers.push(() => resolve(true))),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs).unref()),
    ]);
  };

  const stats = () => ({ running: running.size, queued: queue.length, concurrency, maxQueue });

  return { enqueue, drain, stats };
};

module.exports = { createTaskRunner };
