const geminiPool = require('../geminiPool.service');
const axios = require('axios');
const { classify, envMs } = require('../geminiFailureClassifier');
const { getJobContext } = require('../utils/jobContext');

const CONFIGURED_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '45000', 10);
// Never let a single Gemini model attempt block the whole credential pool for
// minutes. A model timeout should fall through to the next model on the same
// key, then to the next key. Keep an operator override, but cap it at 60s.
const MAX_GEMINI_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_MAX_TIMEOUT_MS || '60000', 10);
const DEFAULT_TIMEOUT_MS = Math.min(
  Number.isFinite(MAX_GEMINI_TIMEOUT_MS) && MAX_GEMINI_TIMEOUT_MS > 0 ? MAX_GEMINI_TIMEOUT_MS : 60000,
  Number.isFinite(CONFIGURED_TIMEOUT_MS) && CONFIGURED_TIMEOUT_MS > 0 ? CONFIGURED_TIMEOUT_MS : 45000
);
const MAX_AGENT_RETRIES = Math.max(1, Number.parseInt(process.env.AGENT_MAX_RETRIES || '2', 10) || 2);
const RETRY_DELAY_MS = Math.max(0, Number.parseInt(process.env.GEMINI_RETRY_DELAY_MS || '500', 10) || 0);
// Temporary pool exhaustion (every project rate limited / cooling down / model
// at capacity) is waited out HERE, between complete failover cycles, without
// consuming the agent-retry budget and without restarting the pipeline:
//   GEMINI_CAPACITY_WAIT_MAX_MS      total time one call may wait for capacity
//                                    (default 1800000, 0 = never wait, fail fast)
//   GEMINI_CAPACITY_MAX_CYCLES       max waits per call (default 50)
//   GEMINI_CAPACITY_FALLBACK_WAIT_MS first wait when no retry time is known
//                                    (default 5000, doubles each cycle, jittered)
// A provider-supplied wait is used as-is; only the fallback is bounded.
const CAPACITY_WAIT_MAX_MS = envMs('GEMINI_CAPACITY_WAIT_MAX_MS', 1800000);
const CAPACITY_MAX_CYCLES = envMs('GEMINI_CAPACITY_MAX_CYCLES', 50);
const CAPACITY_FALLBACK_WAIT_MS = envMs('GEMINI_CAPACITY_FALLBACK_WAIT_MS', 5000);
const DEFAULT_GEMINI_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];

function configuredGeminiModels() {
  const configured = String(process.env.GEMINI_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  const primary = String(process.env.GEMINI_MODEL || '').trim();
  const candidates = configured.length ? configured : [primary, ...DEFAULT_GEMINI_MODELS];
  const unique = candidates.filter((model, index, models) => models.indexOf(model) === index);

  return unique.length ? unique : DEFAULT_GEMINI_MODELS.slice();
}

const MODEL_ATTEMPT_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.GEMINI_MAX_MODEL_ATTEMPTS || '', 10) || configuredGeminiModels().length
);
const MODELS = configuredGeminiModels().slice(0, MODEL_ATTEMPT_LIMIT);


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractText(response) {
  return response?.data?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || '')
    .join('') || '';
}

function stripMarkdownFence(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function findBalancedJson(text) {
  const source = stripMarkdownFence(text);

  let start = -1;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '{' || source[index] === '[') {
      start = index;
      break;
    }
  }

  if (start < 0) return source;

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inString && char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const expected = char === '}' ? '{' : '[';
      if (stack[stack.length - 1] !== expected) return source;
      stack.pop();

      if (stack.length === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return source;
}

function repairJsonString(text) {
  const source = String(text || '');
  let output = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (!inString) {
      output += char;
      if (char === '"') {
        inString = true;
        escaped = false;
      }
      continue;
    }

    if (escaped) {
      if (char === '"' || char === '\\' || char === '/' ||
          char === 'b' || char === 'f' || char === 'n' ||
          char === 'r' || char === 't' || char === 'u') {
        output += '\\' + char;
      } else {
        // Preserve an invalid backslash as a literal backslash.
        output += '\\\\' + char;
      }
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      // Peek ahead: a quote immediately followed by a JSON structural
      // character (once whitespace is skipped) is almost always the real
      // end of the string (e.g. `"code": "...`, `<attr>": ` ). A quote
      // followed by anything else -- like `>` closing a JSX attribute, or
      // more code -- is an internal quote the model forgot to escape.
      // This is a heuristic, not a proof: it can still misjudge rarer
      // patterns like `["a", "b"]` or `{"k": "v"}` appearing verbatim
      // inside generated code, but it correctly handles the much more
      // common case of quoted JSX/HTML attributes and string literals.
      let cursor = index + 1;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
      const next = source[cursor];

      if (
        cursor >= source.length ||
        next === ',' ||
        next === '}' ||
        next === ']' ||
        next === ':'
      ) {
        output += '"';
        inString = false;
      } else {
        // Quote appearing inside generated source code.
        output += '\\"';
      }
      continue;
    }

    const code = char.charCodeAt(0);
    if (code < 0x20) {
      if (char === '\n') output += '\\n';
      else if (char === '\r') output += '\\r';
      else if (char === '\t') output += '\\t';
      else output += '\\u' + code.toString(16).padStart(4, '0');
    } else {
      output += char;
    }
  }

  if (escaped) output += '\\\\';

  return output;
}

// Uses JSON.parse's own error feedback to locate and escape raw control
// characters one at a time. This sidesteps the ambiguity that makes
// string-boundary heuristics unreliable: "bad control character" is an
// unambiguous, precisely located error straight from the parser, so no
// guessing about where a string starts or ends is needed here.
function escapeControlCharsByParseError(text) {
  let source = String(text || '');
  for (let i = 0; i < 200; i += 1) {
    try {
      JSON.parse(source);
      return source;
    } catch (e) {
      const match = /Bad control character in string literal in JSON at position (\d+)/.exec(e.message);
      if (!match) return source;
      const pos = Number(match[1]);
      const char = source[pos];
      if (char === undefined) return source;
      let replacement;
      if (char === '\n') replacement = '\\n';
      else if (char === '\r') replacement = '\\r';
      else if (char === '\t') replacement = '\\t';
      else replacement = '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
      source = source.slice(0, pos) + replacement + source.slice(pos + 1);
    }
  }
  return source;
}

function repairTrailingCommas(text) {
  const source = String(text || '');
  let output = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (inString && char === '\\') {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = !inString;
      continue;
    }

    if (!inString && char === ',') {
      let cursor = index + 1;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
      if (source[cursor] === '}' || source[cursor] === ']') continue;
    }

    output += char;
  }

  return output;
}

function repairBareKeys(text) {
  const source = String(text || '');
  let output = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (inString && char === '\\') {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = !inString;
      continue;
    }

    if (!inString && /[A-Za-z_$]/.test(char)) {
      let cursor = index;
      while (cursor < source.length && /[A-Za-z0-9_$-]/.test(source[cursor])) {
        cursor += 1;
      }

      let lookahead = cursor;
      while (lookahead < source.length && /\s/.test(source[lookahead])) lookahead += 1;

      if (source[lookahead] === ':') {
        output += '"' + source.slice(index, cursor) + '"';
        index = cursor - 1;
        continue;
      }
    }

    output += char;
  }

  return output;
}

function extractJson(text) {
  const candidate = findBalancedJson(text);
  const attempts = [
    candidate,
    repairTrailingCommas(candidate),
    escapeControlCharsByParseError(candidate),
    repairTrailingCommas(escapeControlCharsByParseError(candidate)),
    repairJsonString(candidate),
    repairTrailingCommas(repairJsonString(candidate)),
    escapeControlCharsByParseError(repairJsonString(candidate)),
    repairBareKeys(repairTrailingCommas(escapeControlCharsByParseError(repairJsonString(candidate)))),
  ];

  let lastError;

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (error) {
      lastError = error;
    }
  }

  const error = new Error(
    `${lastError?.message || 'Invalid generated JSON'} (initial parse: Invalid generated JSON)`
  );
  error.category = 'generated_json';
  error.rawPreview = candidate.slice(0, 2000);
  throw error;
}

function safeError(error) {
  const status = error?.response?.status ?? null;
  let category = 'model_error';

  if (error?.code === 'GEMINI_POOL_EXHAUSTED') category = error.temporary ? 'capacity' : 'model_error';
  else if (error?.code === 'ECONNABORTED') category = 'timeout';
  else if (status === 429) category = 'rate_limit';
  else if (status >= 500) category = 'capacity';
  else if (error?.category === 'generated_json') category = 'generated_json';

  return {
    status,
    category,
    message: error?.response?.data?.error?.message || error?.message || 'Gemini request failed',
  };
}

// How long to wait before the next full failover cycle. Provider/pool-derived
// retry times are honored exactly; the fallback is exponential with jitter.
function capacityWaitMs(poolError, cycle) {
  const known = Number(poolError?.retryAfterMs);
  if (Number.isFinite(known) && known >= 0) return Math.ceil(known) + 50; // small margin past the reset
  const base = CAPACITY_FALLBACK_WAIT_MS * (2 ** cycle);
  return Math.round(Math.min(base, 60000) * (0.8 + Math.random() * 0.4));
}

/**
 * Waits (async, no thread blocked) for Gemini capacity. If the call runs
 * inside a job, the job reports "Waiting for Gemini capacity" and gives its
 * worker slot back while it waits, then re-acquires a slot before resuming
 * exactly where it stopped (completed stages and results are untouched).
 */
async function waitForCapacity(waitMs, poolError) {
  const ctx = getJobContext();
  const info = {
    waitMs,
    retryAfterMs: poolError?.retryAfterMs ?? null,
    retryAt: poolError?.retryAt || new Date(Date.now() + waitMs).toISOString(),
    reason: poolError?.reason || 'capacity',
    attemptedProjects: poolError?.attemptedProjects ?? null,
    message: 'Waiting for Gemini capacity',
  };
  console.warn('[LLM] waiting for Gemini capacity', {
    jobId: ctx.jobId || null,
    waitMs,
    reason: info.reason,
    attemptedProjects: info.attemptedProjects,
    retryAt: info.retryAt,
  });
  let resume = null;
  if (typeof ctx.onCapacityWait === 'function') resume = await ctx.onCapacityWait(info);
  try {
    await sleep(waitMs);
  } finally {
    if (typeof resume === 'function') await resume();
  }
}

async function callGemini({ system, input, timeout = DEFAULT_TIMEOUT_MS }) {
  const requestTimeout = Math.min(
    Number.isFinite(Number(timeout)) && Number(timeout) > 0 ? Number(timeout) : DEFAULT_TIMEOUT_MS,
    Number.isFinite(MAX_GEMINI_TIMEOUT_MS) && MAX_GEMINI_TIMEOUT_MS > 0 ? MAX_GEMINI_TIMEOUT_MS : 60000
  );
  let lastError;
  let capacityCycles = 0;
  let capacityWaitedMs = 0;

  for (let attempt = 1; attempt <= MAX_AGENT_RETRIES;) {
    const startedAt = Date.now();

    try {
      // ALL provider failover (project rate limits, model capacity, invalid
      // credentials, transient errors) lives in the pool. Do not add another
      // key/model loop here: executeModels() already switches to the next
      // eligible project immediately inside this one call.
      const { result, model } = await geminiPool.executeModels(MODELS, async (apiKey, model) => {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            contents: [{
              role: 'user',
              parts: [
                { text: JSON.stringify((({ media, ...rest }) => rest)(input || {})) },
                // Label each inline part with its assetId/fileName first. Gemini sees
                // inline parts in order with no names, so without the label it could
                // not tie what it observes back to a mediaPlan assetId.
                ...((input?.media || []).flatMap((asset) => [
                  ...(asset.label ? [{ text: asset.label }] : asset.assetId ? [{ text: `Uploaded asset assetId=${asset.assetId} fileName=${asset.fileName || 'unknown'} mimeType=${asset.mimeType}` }] : []),
                  { inlineData: { mimeType: asset.mimeType, data: asset.data } },
                ])),
              ],
            }],
            systemInstruction: { parts: [{ text: system }] },
            generationConfig: {
              responseMimeType: 'application/json',
              maxOutputTokens: Number.parseInt(
                process.env.GEMINI_MAX_OUTPUT_TOKENS || '32768',
                10
              ),
              thinkingConfig: { thinkingLevel: 'low' },
            },
          },
          {
            timeout: requestTimeout,
            headers: { 'Content-Type': 'application/json' },
          }
        );

        // IMPORTANT: JSON parsing must happen INSIDE the pool callback.
        // Otherwise a model can return HTTP 200 with malformed JSON, the pool
        // marks that credential/model as successful, and the LLM layer gets
        // the parse error after the pool has already stopped. Throwing here
        // lets the pool try another project/model for the same call.
        const raw = extractText(response);
        try {
          const parsed = extractJson(raw);
          return {
            response,
            parsed,
          };
        } catch (error) {
          console.warn('[Gemini Pool] INVALID GENERATED JSON', {
            model,
            message: error.message,
            position: String(error.message).match(/position (\d+)/i)?.[1] || null,
          });
          error.code = error.code || 'GEMINI_INVALID_GENERATED_JSON';
          error.retryableOutput = true;
          throw error;
        }
      });

      const parsed = result?.parsed;

      return {
        value: parsed,
        // The pool selected the model after walking the model list.
        model,
        durationMs: Date.now() - startedAt,
        attempt,
      };
    } catch (error) {
      lastError = error;
      const detail = safeError(error);

      // One concise line per failure (no stack trace for expected 429s).
      console.warn('[LLM] agent request failed', {
        jobId: getJobContext().jobId || null,
        attempt,
        durationMs: Date.now() - startedAt,
        ...detail,
      });

      if (error?.code === 'GEMINI_POOL_EXHAUSTED') {
        // Every eligible project was tried (or none was eligible). Wait for
        // capacity between complete cycles instead of failing the stage; this
        // does NOT consume the agent retry budget (`attempt` is unchanged).
        const waitMs = capacityWaitMs(error, capacityCycles);
        const withinBudget =
          CAPACITY_WAIT_MAX_MS > 0 &&
          capacityCycles < CAPACITY_MAX_CYCLES &&
          capacityWaitedMs + waitMs <= CAPACITY_WAIT_MAX_MS;
        if (error.shouldRetry && withinBudget) {
          capacityCycles += 1;
          capacityWaitedMs += waitMs;
          await waitForCapacity(waitMs, error);
          continue;
        }
        break;
      }

      // Bad requests and unusable generated output will not improve by
      // repeating the identical call; surface them straight away.
      if (detail.category === 'generated_json' || classify(error).classification === 'permanent') {
        break;
      }

      attempt += 1;
      if (attempt <= MAX_AGENT_RETRIES && RETRY_DELAY_MS > 0) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // Prefer the provider's own explanation (e.g. "invalid argument ...") over
  // axios' generic "Request failed with status code 400".
  const failure = lastError ? safeError(lastError) : null;
  const finalMessage = failure?.message || lastError?.message || 'All Gemini agent attempts failed';
  const error = new Error(finalMessage);
  error.failure = failure || safeError(error);
  if (lastError?.code === 'GEMINI_POOL_EXHAUSTED') {
    error.code = 'GEMINI_POOL_EXHAUSTED';
    error.temporary = Boolean(lastError.temporary);
    error.retryAfterMs = lastError.retryAfterMs ?? null;
    error.retryAt = lastError.retryAt || null;
    error.poolResult = lastError.result || null;
    error.userMessage = lastError.temporary
      ? 'Gemini capacity is temporarily exhausted. Please try again shortly.'
      : undefined;
  }
  throw error;
}

module.exports = { callGemini };
