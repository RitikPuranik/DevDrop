'use strict';
const { costPerMillionTokensUsd } = require('./config');

class BudgetExceededError extends Error {
  constructor(resource, detail) {
    super(`Advanced generation stopped: ${detail}`);
    this.name = 'BudgetExceededError';
    this.code = 'BUDGET_EXCEEDED';
    this.resource = resource;
    // Not retried (running again would spend the same budget) and shown to the user as-is.
    this.failureClass = 'permanent';
    this.userMessage = `${detail} The generation was stopped to protect your plan's resource budget. Try a smaller scope, or send a follow-up edit to continue from what was built.`;
    this.failure = { category: 'budget_exceeded' };
  }
}

const estimateTokens = (value) => {
  try { return Math.ceil((typeof value === 'string' ? value : JSON.stringify(value ?? '')).length / 4); } catch { return 0; }
};

/**
 * Tracks what a job has ACTUALLY consumed and refuses further work once a limit is reached.
 * Provider-reported token usage is used when present; otherwise tokens are estimated from payload size.
 */
function createBudget(limits, { now = () => Date.now(), startedAt = now() } = {}) {
  const used = { llmCalls: 0, inputTokens: 0, outputTokens: 0, repairAttempts: 0, outputBytes: 0 };
  const consumedBefore = { ms: 0 }; // time spent by earlier attempts of the same job when resuming from a checkpoint

  const totalTokens = () => used.inputTokens + used.outputTokens;
  const costUsd = () => (totalTokens() / 1_000_000) * costPerMillionTokensUsd();
  const elapsedMs = () => now() - startedAt + consumedBefore.ms;

  function assertWithin(extra = '') {
    if (elapsedMs() > limits.maxWallClockMs) throw new BudgetExceededError('time', `The time budget of ${Math.round(limits.maxWallClockMs / 60000)} minutes was reached${extra}.`);
    if (used.llmCalls >= limits.maxLlmCalls) throw new BudgetExceededError('llm_calls', `The limit of ${limits.maxLlmCalls} model requests was reached${extra}.`);
    if (totalTokens() >= limits.maxTotalTokens) throw new BudgetExceededError('tokens', `The token budget (${limits.maxTotalTokens.toLocaleString('en-US')}) was reached${extra}.`);
    if (costUsd() >= limits.maxCostUsd) throw new BudgetExceededError('cost', `The cost budget ($${limits.maxCostUsd}) was reached${extra}.`);
  }

  return {
    limits,
    used,
    assertWithin,
    elapsedMs,
    totalTokens,
    costUsd,
    // Wired into llm.service through the job context.
    beforeLlmCall: () => assertWithin(),
    afterLlmCall: ({ input, value, usage }) => {
      used.llmCalls += 1;
      const inTok = Number(usage?.promptTokenCount);
      const outTok = Number(usage?.candidatesTokenCount) + (Number(usage?.thoughtsTokenCount) || 0);
      used.inputTokens += Number.isFinite(inTok) && inTok > 0 ? inTok : estimateTokens((({ media, ...rest }) => rest)(input || {}));
      used.outputTokens += Number.isFinite(outTok) && outTok > 0 ? outTok : estimateTokens(value);
    },
    canRepair: () => used.repairAttempts < limits.maxRepairAttempts,
    recordRepairAttempt: () => { used.repairAttempts += 1; },
    /** Output size is checked on the assembled project; a project over the cap is refused rather than silently truncated. */
    assertOutputSize(files) {
      let bytes = 0;
      for (const f of Object.values(files || {})) bytes += Buffer.byteLength(typeof f === 'string' ? f : f?.code || '', 'utf8');
      used.outputBytes = bytes;
      if (bytes > limits.maxOutputBytes) throw new BudgetExceededError('output_size', `The generated project (${(bytes / 1048576).toFixed(1)} MB) is larger than the ${(limits.maxOutputBytes / 1048576).toFixed(0)} MB output budget.`);
      return bytes;
    },
    restore(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return;
      // A resumed attempt keeps what earlier attempts already spent, so retries cannot be used to dodge the limits.
      for (const k of ['llmCalls', 'inputTokens', 'outputTokens', 'repairAttempts']) if (Number.isFinite(snapshot[k])) used[k] = snapshot[k];
      if (Number.isFinite(snapshot.elapsedMs)) consumedBefore.ms = snapshot.elapsedMs;
    },
    snapshot: () => ({ ...used, elapsedMs: elapsedMs(), totalTokens: totalTokens(), costUsd: Number(costUsd().toFixed(4)) }),
    report: () => ({ limits, used: { ...used, totalTokens: totalTokens(), estimatedCostUsd: Number(costUsd().toFixed(4)), elapsedMs: elapsedMs() } }),
  };
}

module.exports = { createBudget, BudgetExceededError, estimateTokens };
