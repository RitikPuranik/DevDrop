const geminiPool = require('../geminiPool.service');
const axios = require('axios');

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
const RATE_LIMIT_COOLDOWN_MS = Math.max(0, Number.parseInt(process.env.GEMINI_RATE_LIMIT_COOLDOWN_MS || '5000', 10) || 0);
const RATE_LIMIT_COOLDOWN_MAX_MS = Math.max(
  RATE_LIMIT_COOLDOWN_MS,
  Number.parseInt(process.env.GEMINI_RATE_LIMIT_COOLDOWN_MAX_MS || '60000', 10) || 60000
);
const MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  // 'gemini-3.5-flash',
  // 'gemini-3.5-flash-lite',
].filter((model, index, models) => models.indexOf(model) === index);


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

  if (error?.code === 'ECONNABORTED') category = 'timeout';
  else if (status === 429) category = 'rate_limit';
  else if (status >= 500) category = 'capacity';
  else if (error?.category === 'generated_json') category = 'generated_json';

  return {
    status,
    category,
    message: error?.response?.data?.error?.message || error?.message || 'Gemini request failed',
  };
}

function retrySecondsFromMessage(message) {
  const match = String(message || '').match(/retry in ([\d.]+)s/i);
  if (!match) return 0;
  return Math.max(0, Number.parseFloat(match[1]) * 1000);
}

async function callGemini({ system, input, timeout = DEFAULT_TIMEOUT_MS }) {
  const requestTimeout = Math.min(
    Number.isFinite(Number(timeout)) && Number(timeout) > 0 ? Number(timeout) : DEFAULT_TIMEOUT_MS,
    Number.isFinite(MAX_GEMINI_TIMEOUT_MS) && MAX_GEMINI_TIMEOUT_MS > 0 ? MAX_GEMINI_TIMEOUT_MS : 60000
  );
  let lastError;

  for (let attempt = 1; attempt <= MAX_AGENT_RETRIES; attempt += 1) {
    const startedAt = Date.now();

    try {
      // IMPORTANT: credential-first traversal lives inside the pool.
      // For each key/project, executeModels tries the entire model list before
      // moving to the next credential:
      //
      //   key A -> 3.8 -> 3.7 -> 3.6 -> 3.5-lite
      //   key B -> 3.8 -> 3.7 -> 3.6 -> 3.5-lite
      //   ...
      //
      // Do not wrap this in a separate `for (const model of MODELS)` loop,
      // because that changes the traversal back to model-first and causes the
      // exact regression this pool was added to solve.
      const { result, model } = await geminiPool.executeModels(MODELS, async (apiKey, model) => {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
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
        // makes malformed output participate in the same key-first fallback:
        //
        //   key A -> 3.7 -> malformed JSON -> 3.6 -> ... -> key B
        //
        // without treating a bad model response as a successful request.
        const raw = extractText(response);
        try {
          const parsed = extractJson(raw);
          return {
            response,
            parsed,
          };
        } catch (error) {
          // HTTP 200 does not mean the generated contract is usable. Keep
          // malformed JSON inside the pool's fallback path so this exact
          // credential can try the next model before we move to another key.
          console.warn('[Gemini Pool] INVALID GENERATED JSON', {
            keyId: String(apiKey).length > 8 ? `${String(apiKey).slice(0, 4)}...${String(apiKey).slice(-4)}` : 'redacted',
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
        // The pool selected the model after walking the model list for the
        // winning credential. Preserve that selected model for callers.
        model,
        durationMs: Date.now() - startedAt,
        attempt,
      };
    } catch (error) {
      lastError = error;
      const detail = safeError(error);

      console.warn('[LLM] agent request failed', {
        attempt,
        durationMs: Date.now() - startedAt,
        ...detail,
      });

      if (detail.category === 'generated_json') {
        break;
      }

      const poolUnavailable =
        error?.code === 'GEMINI_POOL_EXHAUSTED' ||
        (detail.category === 'model_error' &&
          /all gemini keys are temporarily unavailable|gemini pool exhausted/i.test(detail.message || ''));

      if (poolUnavailable) {
        const retryAfterMs = Number.isFinite(error?.retryAfterMs) ? error.retryAfterMs : 0;
        console.warn('[LLM] Gemini pool exhausted for this agent attempt', {
          attempt,
          retryAfterMs,
          attemptedKeys: error?.attemptedKeyIds?.length || null,
          classification: error?.classification || detail.category,
        });

        // The pool has already tried every key across every model. Waiting for
        // the shortest provider cooldown before the next agent attempt is
        // useful, but NEVER run another model loop here.
        if (attempt < MAX_AGENT_RETRIES && retryAfterMs > 0) {
          const waitMs = Math.min(RATE_LIMIT_COOLDOWN_MAX_MS, retryAfterMs);
          console.warn('[LLM] waiting before retrying the full key-first pool', {
            waitMs,
            retryAfterMs,
            nextAttempt: attempt + 1,
          });
          await sleep(waitMs);
        }
        continue;
      }

      if (detail.category === 'rate_limit') {
        const providerRetryMs = retrySecondsFromMessage(detail.message);
        const waitMs = Math.min(
          RATE_LIMIT_COOLDOWN_MAX_MS,
          Math.max(RATE_LIMIT_COOLDOWN_MS, providerRetryMs)
        );
        if (attempt < MAX_AGENT_RETRIES && waitMs > 0) {
          console.warn('[LLM] rate limit cooldown after pool request', {
            waitMs,
            retryIndex: attempt,
          });
          await sleep(waitMs);
        }
      }

      if (attempt < MAX_AGENT_RETRIES && RETRY_DELAY_MS > 0) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  const finalMessage = lastError?.message || 'All Gemini agent attempts failed';
  const error = new Error(finalMessage);
  error.failure = safeError(lastError || error);
  throw error;
}

module.exports = { callGemini };
