// Shared by websiteGeneration.orchestrator.js and websiteEditing.orchestrator.js
// so both pipelines report progress (job.currentStage/generationMeta.agents)
// through the exact same shape the frontend already polls for.

function withTimeout(promise, ms, name) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${name} timed out after ${ms}ms`), { failure: { category: 'timeout' } })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function stage(name, fn, meta, onStage, timeoutMs) {
  const started = Date.now();
  const item = { name, status: 'processing', durationMs: 0 };
  meta.push(item);
  onStage?.(name, 'started', item);
  try {
    // Per-stage/per-agent timeouts were removed in favor of a single
    // overall timeout wrapping the whole pipeline (see the orchestrators).
    // Pass timeoutMs only for the rare stage that still needs its own cap.
    const value = timeoutMs ? await withTimeout(fn(), timeoutMs, name) : await fn();
    item.status = 'completed';
    item.durationMs = Date.now() - started;
    item.model = value?.model || null;
    item.attempt = value?.attempt || null;
    onStage?.(name, 'completed', item);
    return value;
  } catch (error) {
    item.status = 'failed';
    item.durationMs = Date.now() - started;
    item.failure = { category: error.failure?.category || 'agent_error', message: error.message };
    onStage?.(name, 'failed', item);
    throw error;
  }
}

module.exports = { withTimeout, stage };
