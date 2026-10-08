const axios = require('axios');
const groqPool = require('./groqPool.service');

/**
 * Thin Groq (OpenAI-compatible) chat client for Kashi. Two model tiers:
 *
 *   fast -> quick answers to basic questions + app navigation
 *   edit -> code editing (fixing deployment build errors)
 *
 * Each tier has a fallback chain (first entry = primary). Key failover is
 * handled by groqPool.execute(); model fallback happens here when a model is
 * rejected outright (decommissioned / not found / unsupported).
 */

const GROQ_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';

const list = (value, fallback) => {
  const items = String(value || '').split(',').map((m) => m.trim()).filter(Boolean);
  return items.length ? items : fallback;
};

function getModels(tier) {
  if (tier === 'edit') {
    return list(process.env.GROQ_EDIT_MODELS || process.env.GROQ_EDIT_MODEL, ['openai/gpt-oss-120b']);
  }
  return list(process.env.GROQ_FAST_MODELS || process.env.GROQ_FAST_MODEL, ['openai/gpt-oss-20b']);
}

function parseJson(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
    }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* fall through */ }
    }
  }
  return null;
}

// Models whose strict structured output recently failed: skip response_format for a while
// so we don't burn a request (and TPM budget) on a call that is likely to 400 again.
const structuredBlockedUntil = new Map();
const STRUCTURED_BLOCK_MS = 10 * 60 * 1000;

const isGptOss = (model) => /gpt-oss/i.test(model);

// 400s that are really "this generation went wrong" (truncated / malformed JSON,
// hallucinated tool call) rather than "this request is invalid".
function generationFailure(error) {
  const data = error?.response?.data?.error || {};
  const msg = String(data.message || '');
  return {
    isGenerationFailure: error?.response?.status === 400
      && (data.failed_generation !== undefined || /failed to (validate|generate)|tool choice is none|called a tool/i.test(msg)),
    failedText: typeof data.failed_generation === 'string' ? data.failed_generation : '',
  };
}

function buildBody({ model, messages, temperature, maxTokens, json, jsonSchema, structured }) {
  const body = { model, messages, temperature, max_tokens: maxTokens };
  if (isGptOss(model)) {
    // gpt-oss is a reasoning model: reasoning tokens count against max_tokens, so keep
    // it short and don't return it. Otherwise output gets truncated mid-JSON.
    body.reasoning_effort = process.env.GROQ_REASONING_EFFORT || 'low';
    body.include_reasoning = false;
  }
  if (json && structured) {
    // Strict json_schema is only reliable on gpt-oss; other models get json_object.
    body.response_format = jsonSchema && isGptOss(model)
      ? { type: 'json_schema', json_schema: jsonSchema }
      : { type: 'json_object' };
  }
  return body;
}

/**
 * @param {{tier?: 'fast'|'edit', messages: Array<{role:string, content:string}>,
 *          json?: boolean, temperature?: number, maxTokens?: number, timeoutMs?: number}} opts
 * @returns {Promise<{text: string, json: any, model: string, keyId: string}>}
 */
async function chat({ tier = 'fast', messages, json = false, jsonSchema = null, temperature, maxTokens, timeoutMs }) {
  const models = getModels(tier);
  const defaultTemp = tier === 'edit' ? 0.1 : 0.3;
  // Generous defaults: they have to cover hidden reasoning + the actual answer.
  const defaultMax = tier === 'edit'
    ? Number.parseInt(process.env.GROQ_EDIT_MAX_TOKENS || '3500', 10)
    : Number.parseInt(process.env.GROQ_FAST_MAX_TOKENS || '800', 10);
  const timeout = timeoutMs || Number.parseInt(process.env.GROQ_TIMEOUT_MS || (tier === 'edit' ? '90000' : '25000'), 10);
  const tokens = Math.max(maxTokens || 0, defaultMax);

  const call = async (model, structured) => {
    const body = buildBody({ model, messages, temperature: temperature ?? defaultTemp, maxTokens: tokens, json, jsonSchema, structured });
    const { result, keyId } = await groqPool.execute((rawKey) =>
      axios
        .post(GROQ_URL, body, { timeout, headers: { Authorization: `Bearer ${rawKey}`, 'Content-Type': 'application/json' } })
        .then((res) => res.data)
    );
    const choice = result?.choices?.[0];
    const text = choice?.message?.content || '';
    return { text, json: json ? parseJson(text) : null, model, keyId, finishReason: choice?.finish_reason };
  };

  let lastError = null;
  for (const model of models) {
    try {
      return await call(model, !((structuredBlockedUntil.get(model) || 0) > Date.now()));
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const { isGenerationFailure, failedText } = generationFailure(error);

      if (isGenerationFailure) {
        structuredBlockedUntil.set(model, Date.now() + STRUCTURED_BLOCK_MS);
        console.warn('[Groq] generation failed, retrying without response_format', { model, message: error?.response?.data?.error?.message });
        // 1) the model often did produce usable JSON; salvage it.
        const salvaged = json ? parseJson(failedText) : null;
        if (salvaged) return { text: failedText, json: salvaged, model, keyId: null, finishReason: 'salvaged' };
        // 2) retry same model in plain mode (prompt already demands JSON; parseJson handles fences).
        try {
          return await call(model, false);
        } catch (retryError) {
          lastError = retryError;
          console.warn('[Groq] plain retry failed', { model, status: retryError?.response?.status, message: retryError?.response?.data?.error?.message });
        }
        if (models.length > 1) continue;
        throw lastError;
      }

      // Model-level rejection -> try the next model in the chain.
      if ([400, 404, 422].includes(status) && models.length > 1) {
        console.warn('[Groq] model rejected, trying next', { model, status, message: error?.response?.data?.error?.message });
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

module.exports = { chat, getModels, parseJson };