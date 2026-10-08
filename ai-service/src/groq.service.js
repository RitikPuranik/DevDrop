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

/**
 * @param {{tier?: 'fast'|'edit', messages: Array<{role:string, content:string}>,
 *          json?: boolean, temperature?: number, maxTokens?: number, timeoutMs?: number}} opts
 * @returns {Promise<{text: string, json: any, model: string, keyId: string}>}
 */
async function chat({ tier = 'fast', messages, json = false, jsonSchema = null, temperature, maxTokens, timeoutMs }) {
  const models = getModels(tier);
  const defaultTemp = tier === 'edit' ? 0.1 : 0.3;
  const defaultMax = tier === 'edit' ? Number.parseInt(process.env.GROQ_EDIT_MAX_TOKENS || '1800', 10) : Number.parseInt(process.env.GROQ_FAST_MAX_TOKENS || '500', 10);
  const timeout = timeoutMs || Number.parseInt(process.env.GROQ_TIMEOUT_MS || (tier === 'edit' ? '90000' : '25000'), 10);

  let lastError = null;
  for (const model of models) {
    try {
      const { result, keyId } = await groqPool.execute((rawKey) =>
        axios
          .post(
            GROQ_URL,
            {
              model,
              messages,
              temperature: temperature ?? defaultTemp,
              max_tokens: maxTokens || defaultMax,
              ...(json ? {
                response_format: jsonSchema
                  ? { type: 'json_schema', json_schema: jsonSchema }
                  : { type: 'json_object' },
              } : {}),
            },
            { timeout, headers: { Authorization: `Bearer ${rawKey}`, 'Content-Type': 'application/json' } }
          )
          .then((res) => res.data)
      );
      const text = result?.choices?.[0]?.message?.content || '';
      return { text, json: json ? parseJson(text) : null, model, keyId, finishReason: result?.choices?.[0]?.finish_reason };
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
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
