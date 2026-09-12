const geminiPool = require('../geminiPool.service');
const axios = require('axios');

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '90000', 10);
const MAX_AGENT_RETRIES = Math.max(1, Number.parseInt(process.env.AGENT_MAX_RETRIES || '2', 10) || 2);
const RETRY_DELAY_MS = Number.parseInt(process.env.GEMINI_RETRY_DELAY_MS || '500', 10);
const MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.7-flash',
  'gemini-3.6-flash',
].filter((m, i, a) => m && a.indexOf(m) === i);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractText(response) {
  return response.data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
}

function extractJson(text) {
  const value = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? value.slice(start, end + 1) : value);
}

function safeError(error) {
  return {
    status: error.response?.status || null,
    category: error.code === 'ECONNABORTED' ? 'timeout' : error.response?.status === 429 ? 'rate_limit' : error.response?.status >= 500 ? 'capacity' : 'model_error',
    message: error.response?.data?.error?.message || error.message || 'Gemini request failed',
  };
}

async function callGemini({ system, input, timeout = DEFAULT_TIMEOUT_MS }) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_AGENT_RETRIES; attempt += 1) {
    for (const model of MODELS) {
      const startedAt = Date.now();
      try {
        const { result } = await geminiPool.execute((apiKey) => axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
            systemInstruction: { parts: [{ text: system }] },
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: Number.parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '32768', 10), thinkingConfig: { thinkingLevel: 'low' } },
          },
          { timeout, headers: { 'Content-Type': 'application/json' } }
        ));
        const raw = extractText(result);
        const parsed = extractJson(raw);
        return { value: parsed, model, durationMs: Date.now() - startedAt, attempt };
      } catch (error) {
        lastError = error;
        const detail = safeError(error);
        console.warn('[LLM] agent request failed', { model, attempt, durationMs: Date.now() - startedAt, ...detail });
        if (attempt < MAX_AGENT_RETRIES && RETRY_DELAY_MS > 0) await sleep(RETRY_DELAY_MS);
      }
    }
  }
  const error = new Error(lastError?.message || 'All Gemini agent attempts failed');
  error.failure = safeError(lastError || error);
  throw error;
}

module.exports = { callGemini };
