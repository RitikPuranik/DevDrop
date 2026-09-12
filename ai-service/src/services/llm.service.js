const geminiPool = require('../geminiPool.service');
const axios = require('axios');

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '180000', 10);
const MAX_AGENT_RETRIES = Math.max(1, Number.parseInt(process.env.AGENT_MAX_RETRIES || '2', 10) || 2);
const RETRY_DELAY_MS = Math.max(0, Number.parseInt(process.env.GEMINI_RETRY_DELAY_MS || '500', 10) || 0);
const RATE_LIMIT_COOLDOWN_MS = Math.max(0, Number.parseInt(process.env.GEMINI_RATE_LIMIT_COOLDOWN_MS || '5000', 10) || 0);
const RATE_LIMIT_COOLDOWN_MAX_MS = Math.max(
  RATE_LIMIT_COOLDOWN_MS,
  Number.parseInt(process.env.GEMINI_RATE_LIMIT_COOLDOWN_MAX_MS || '60000', 10) || 60000
);
const RATE_LIMIT_MAX_RETRIES = Math.max(
  0,
  Number.parseInt(process.env.GEMINI_RATE_LIMIT_MAX_RETRIES || '5', 10) || 0
);

const MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.7-flash',
  process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash',
  'gemini-3.6-flash',
]
  .filter((model) => model && !/gemini-3\.8-flash/i.test(model))
  .filter((model, index, models) => models.indexOf(model) === index);

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
    repairJsonString(candidate),
    repairTrailingCommas(repairJsonString(candidate)),
    repairBareKeys(repairTrailingCommas(repairJsonString(candidate))),
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
  let lastError;

  for (let attempt = 1; attempt <= MAX_AGENT_RETRIES; attempt += 1) {
    for (const model of MODELS) {
      let rateLimitRetries = 0;

      while (true) {
        const startedAt = Date.now();

        try {
          const { result } = await geminiPool.execute((apiKey) => axios.post(
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
              timeout,
              headers: { 'Content-Type': 'application/json' },
            }
          ));

          const raw = extractText(result);
          const parsed = extractJson(raw);

          return {
            value: parsed,
            model,
            durationMs: Date.now() - startedAt,
            attempt,
          };
        } catch (error) {
          lastError = error;
          const detail = safeError(error);

          console.warn('[LLM] agent request failed', {
            model,
            attempt,
            rateLimitRetries,
            durationMs: Date.now() - startedAt,
            ...detail,
          });

          if (detail.category === 'generated_json') {
            // A malformed model response is not a key failure. Move to the
            // next model/agent attempt instead of poisoning the key pool.
            break;
          }

          const poolUnavailable =
            detail.category === 'model_error' &&
            /all gemini keys are temporarily unavailable/i.test(detail.message || '');

          if (detail.category !== 'rate_limit' && !poolUnavailable) {
            break;
          }

          if (rateLimitRetries >= RATE_LIMIT_MAX_RETRIES) {
            console.warn('[LLM] rate-limit retry budget exhausted', {
              model,
              attempt,
              rateLimitRetries,
              maxRateLimitRetries: RATE_LIMIT_MAX_RETRIES,
            });
            break;
          }

          const providerRetryMs = retrySecondsFromMessage(detail.message);
          const requestedWaitMs = Math.max(RATE_LIMIT_COOLDOWN_MS, providerRetryMs);
          const waitMs = Math.min(
            RATE_LIMIT_COOLDOWN_MAX_MS,
            requestedWaitMs
          );

          rateLimitRetries += 1;

          if (waitMs > 0) {
            console.warn('[LLM] rate limit cooldown', {
              waitMs,
              configuredCooldownMs: RATE_LIMIT_COOLDOWN_MS,
              maxCooldownMs: RATE_LIMIT_COOLDOWN_MAX_MS,
              retryIndex: rateLimitRetries,
            });
            await sleep(waitMs);
          }
        }
      }
    }

    if (attempt < MAX_AGENT_RETRIES && RETRY_DELAY_MS > 0) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  let finalMessage = lastError?.message || 'All Gemini agent attempts failed';
  if (lastError?.category === 'generated_json') {
    finalMessage = `Gemini returned malformed JSON after all repair attempts: ${finalMessage}`;
  }

  const error = new Error(finalMessage);
  error.failure = safeError(lastError || error);
  throw error;
}

module.exports = { callGemini };
