const axios = require('axios');

// DevDrop keeps the AI Studio provider behind the backend so the Gemini key
// never reaches the browser. Generation uses Gemini's JSON response mode.

const RETIRED_GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
]);

// Current Gemini Flash models. A 503 means the selected model is temporarily
// capacity constrained, so we automatically try the next available model.
const DEFAULT_GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
];

const configuredModel = (process.env.GEMINI_MODEL || '').trim();
const configuredFallback =
  configuredModel &&
  !RETIRED_GEMINI_MODELS.has(configuredModel) &&
  !DEFAULT_GEMINI_MODELS.includes(configuredModel)
    ? configuredModel
    : null;

// Always try the current 3.8 Flash first. A local GEMINI_MODEL remains a
// fallback when it points at a different non-retired model.
const GEMINI_MODELS = [
  DEFAULT_GEMINI_MODELS[0],
  ...(configuredModel &&
  !RETIRED_GEMINI_MODELS.has(configuredModel) &&
  configuredModel !== DEFAULT_GEMINI_MODELS[0]
    ? [configuredModel]
    : []),
  ...DEFAULT_GEMINI_MODELS.slice(1),
  ...(configuredFallback ? [configuredFallback] : []),
].filter((model, index, models) => models.indexOf(model) === index);

// Keep each attempt bounded. A timeout is treated like a temporary capacity
// problem and automatically moves to the next Flash model.
const GEMINI_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '90000', 10);
const GEMINI_RETRY_DELAY_MS = Number.parseInt(process.env.GEMINI_RETRY_DELAY_MS || '500', 10);
const GEMINI_MAX_MODEL_ATTEMPTS = Math.max(
  1,
  Math.min(
    Number.parseInt(process.env.GEMINI_MAX_MODEL_ATTEMPTS || '2', 10) || 2,
    GEMINI_MODELS.length
  )
);

// Gemini 3.8 Flash supports up to 65,536 output tokens. The old 8,192-token
// ceiling was too small for full multi-file React apps and caused the JSON to
// be cut off halfway through a source file. Keep the value configurable while
// clamping it to the model's documented maximum.
const GEMINI_MAX_OUTPUT_TOKENS = Math.max(
  1024,
  Math.min(
    Number.parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '65536', 10) || 65536,
    65536
  )
);

const SYSTEM_PROMPT = `You are an expert React developer. Your job is to generate complete, working React applications based on user prompts.

RULES:
1. Always respond with a valid JSON object — no markdown fences, no extra text.
2. The JSON must match this exact shape:
{
  "assistantMessage": "<brief explanation of what you built/changed>",
  "title": "<short 2-4 word title for the app, e.g. 'Todo List App'>",
  "files": {
    "/App.js": { "code": "<full file content>" },
    "/components/SomeComponent.js": { "code": "<full file content>" }
  },
  "dependencies": {
    "some-package": "latest"
  }
}
3. Use React (functional components + hooks). Do NOT use TypeScript in generated files.
4. Use Tailwind CSS for all styling. Do not use CSS modules or inline styles unless absolutely necessary.
5. The entry point must always be /App.js and must export a default component.
6. All imports must reference files you include in "files" or packages in "dependencies".
7. Do not include react, react-dom, or tailwindcss in "dependencies" — they are always available.
8. When modifying existing code, include ALL files (both changed and unchanged) in "files", not just the ones you changed.
9. Keep code clean, readable, and production-quality.
10. Keep generated source files focused and avoid unnecessary duplicated boilerplate so the complete response fits within the output limit.`;

function trimHistory(messages) {
  if (messages.length <= 10) return messages;
  return [messages[0], ...messages.slice(-8)];
}

function buildContents(messages, fileData) {
  const trimmed = trimHistory(messages);

  return trimmed.map((msg, idx) => {
    const role = msg.role === 'assistant' ? 'model' : 'user';

    if (msg.role !== 'user') {
      return { role, parts: [{ text: msg.content }] };
    }

    let text = msg.content;
    const isLast = idx === trimmed.length - 1;
    if (isLast && fileData) {
      text += '\n\nCurrent project files for context:\n' + JSON.stringify(fileData, null, 2);
    }

    return { role, parts: [{ text }] };
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableCapacityError = (error) => {
  const status = error.response?.status;
  const message = error.response?.data?.error?.message || error.message || '';
  return status === 503 || /high demand|temporarily unavailable|unavailable/i.test(message);
};

const isTimeoutError = (error) =>
  error.code === 'ECONNABORTED' ||
  error.code === 'ETIMEDOUT' ||
  /timeout of \d+ms exceeded/i.test(error.message || '');

function extractText(response) {
  return response.data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || '';
}

function getFinishReason(response) {
  return response.data?.candidates?.[0]?.finishReason || null;
}

function parseGeneratedApp(text, finishReason) {
  if (!text) {
    const err = new Error('Gemini returned no text');
    err.userMessage = 'Gemini did not return generated app code. Please try again.';
    err.statusCode = 502;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const err = new Error('Gemini returned incomplete/non-JSON output: ' + text.slice(0, 500));
    err.finishReason = finishReason;
    err.retryableOutput = finishReason === 'MAX_TOKENS' || finishReason === 'OTHER';
    err.userMessage =
      finishReason === 'MAX_TOKENS'
        ? 'Gemini generated too much code for one response. DevDrop will retry with the expanded output limit.'
        : 'The AI returned an incomplete response. Please try again.';
    err.statusCode = 502;
    throw err;
  }

  if (!parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
    const err = new Error('Gemini response missing "files"');
    err.userMessage = 'The AI response was missing generated files. Please try again.';
    err.statusCode = 502;
    throw err;
  }

  return {
    assistantMessage: parsed.assistantMessage || '',
    title: parsed.title || 'Generated App',
    files: parsed.files,
    dependencies: parsed.dependencies || {},
  };
}

async function requestModel({ model, apiKey, contents, timeout }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  return axios.post(
    `${url}?key=${encodeURIComponent(apiKey)}`,
    {
      contents,
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        // Gemini 3.8 migration guidance removes temperature/top_p/top_k.
        responseMimeType: 'application/json',
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        // Code generation does not need maximum reasoning depth. Keeping this
        // low materially reduces latency and makes fallback attempts practical.
        thinkingConfig: { thinkingLevel: 'low' },
      },
    },
    {
      timeout,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

async function generateApp({ messages, fileData }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    const err = new Error('GEMINI_API_KEY is not configured on the backend');
    err.userMessage = 'AI Studio is not configured yet. Add a valid GEMINI_API_KEY to backend/.env and restart the server.';
    err.statusCode = 500;
    throw err;
  }

  const contents = buildContents(messages, fileData);
  const timeout =
    Number.isFinite(GEMINI_TIMEOUT_MS) && GEMINI_TIMEOUT_MS > 0
      ? GEMINI_TIMEOUT_MS
      : 90000;

  let lastError = null;
  let lastTimedOutModel = null;
  let lastCapacityModel = null;

  for (let attempt = 0; attempt < GEMINI_MAX_MODEL_ATTEMPTS; attempt += 1) {
    const model = GEMINI_MODELS[attempt];
    const startedAt = Date.now();

    try {
      const response = await requestModel({ model, apiKey, contents, timeout });
      const finishReason = getFinishReason(response);
      console.log('Gemini generation succeeded', {
        model,
        attempt: attempt + 1,
        status: response.status,
        finishReason,
        elapsedMs: Date.now() - startedAt,
        outputLimit: GEMINI_MAX_OUTPUT_TOKENS,
      });
      return parseGeneratedApp(extractText(response), finishReason);
    } catch (error) {
      const status = error.response?.status;
      const apiMessage = error.response?.data?.error?.message;
      const timedOut = isTimeoutError(error);
      const capacity = isRetryableCapacityError(error);
      lastError = error;

      console.error('Gemini model attempt failed', {
        model,
        attempt: attempt + 1,
        status,
        code: error.code,
        finishReason: error.finishReason,
        elapsedMs: Date.now() - startedAt,
        message: apiMessage || error.message,
      });

      if (timedOut) lastTimedOutModel = model;
      if (capacity) lastCapacityModel = model;

      const retryableOutput = Boolean(error.retryableOutput);

      if ((timedOut || capacity || retryableOutput) && attempt < GEMINI_MAX_MODEL_ATTEMPTS - 1) {
        const reason = timedOut ? 'timeout' : capacity ? 'capacity' : 'incomplete output';
        console.warn(
          `Gemini ${reason} on ${model}; trying fallback model ${GEMINI_MODELS[attempt + 1]}`
        );
        if (GEMINI_RETRY_DELAY_MS > 0) await sleep(GEMINI_RETRY_DELAY_MS);
        continue;
      }

      if (timedOut) {
        const err = new Error(`Gemini request timed out after ${timeout}ms`);
        err.userMessage =
          `Gemini is taking too long to respond. DevDrop tried ${GEMINI_MAX_MODEL_ATTEMPTS} Gemini Flash model${GEMINI_MAX_MODEL_ATTEMPTS === 1 ? '' : 's'} ` +
          `and the last attempt (${lastTimedOutModel || model}) timed out after ${Math.round(timeout / 1000)} seconds. Please try again.`;
        err.statusCode = 504;
        throw err;
      }

      if (status === 503 || capacity) {
        const err = new Error(apiMessage || 'Gemini temporarily unavailable');
        err.userMessage =
          `Gemini is temporarily at capacity. DevDrop tried ${GEMINI_MAX_MODEL_ATTEMPTS} Gemini Flash model${GEMINI_MAX_MODEL_ATTEMPTS === 1 ? '' : 's'} ` +
          `and none were available right now. Please try again shortly.`;
        err.statusCode = 503;
        throw err;
      }

      if (error.retryableOutput) {
        const err = new Error(error.message || 'Gemini returned incomplete output');
        err.userMessage =
          `Gemini reached the end of its output before finishing the app JSON. ` +
          `The response limit is now ${GEMINI_MAX_OUTPUT_TOKENS.toLocaleString()} tokens; please try again.`;
        err.statusCode = 502;
        throw err;
      }

      const err = new Error(apiMessage || error.message);
      err.userMessage = apiMessage
        ? `Gemini API error: ${apiMessage}`
        : 'Failed to reach Gemini. Check the backend network connection and GEMINI_API_KEY.';
      err.statusCode = status || 502;
      throw err;
    }
  }

  const fallback = new Error(lastError?.message || 'All Gemini models failed');
  fallback.userMessage = lastTimedOutModel
    ? `Gemini generation timed out on ${lastTimedOutModel}. Please try again.`
    : lastCapacityModel
      ? 'Gemini is temporarily at capacity. Please try again shortly.'
      : 'Gemini is temporarily unavailable. Please try again shortly.';
  fallback.statusCode = lastTimedOutModel ? 504 : 503;
  throw fallback;
}

module.exports = { generateApp };
