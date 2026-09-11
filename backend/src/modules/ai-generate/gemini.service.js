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
const primaryModel =
  configuredModel && !RETIRED_GEMINI_MODELS.has(configuredModel)
    ? configuredModel
    : DEFAULT_GEMINI_MODELS[0];

const GEMINI_MODELS = [
  primaryModel,
  ...DEFAULT_GEMINI_MODELS.filter((model) => model !== primaryModel),
];

const GEMINI_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '60000', 10);
const GEMINI_RETRY_DELAY_MS = Number.parseInt(process.env.GEMINI_RETRY_DELAY_MS || '1000', 10);
const GEMINI_MAX_MODEL_ATTEMPTS = Math.max(
  1,
  Math.min(
    Number.parseInt(process.env.GEMINI_MAX_MODEL_ATTEMPTS || String(GEMINI_MODELS.length), 10) || GEMINI_MODELS.length,
    GEMINI_MODELS.length
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
9. Keep code clean, readable, and production-quality.`;

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

function extractText(response) {
  return response.data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || '';
}

function parseGeneratedApp(text) {
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
    const err = new Error('Gemini returned non-JSON output: ' + text.slice(0, 500));
    err.userMessage = 'The AI returned an invalid response. Please try again.';
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
        temperature: 0.7,
        responseMimeType: 'application/json',
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
  const timeout = Number.isFinite(GEMINI_TIMEOUT_MS) && GEMINI_TIMEOUT_MS > 0 ? GEMINI_TIMEOUT_MS : 60000;
  let lastError = null;

  for (let attempt = 0; attempt < GEMINI_MAX_MODEL_ATTEMPTS; attempt += 1) {
    const model = GEMINI_MODELS[attempt];
    const startedAt = Date.now();

    try {
      const response = await requestModel({ model, apiKey, contents, timeout });
      console.log('Gemini generation succeeded', {
        model,
        attempt: attempt + 1,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
      });
      return parseGeneratedApp(extractText(response));
    } catch (error) {
      const status = error.response?.status;
      const apiMessage = error.response?.data?.error?.message;
      lastError = error;

      console.error('Gemini model attempt failed', {
        model,
        attempt: attempt + 1,
        status,
        code: error.code,
        elapsedMs: Date.now() - startedAt,
        message: apiMessage || error.message,
      });

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        const err = new Error(`Gemini request timed out after ${timeout}ms`);
        err.userMessage = `Gemini took too long to respond. The server waited ${Math.round(timeout / 1000)} seconds. Please try again.`;
        err.statusCode = 504;
        throw err;
      }

      if (!isRetryableCapacityError(error) || attempt >= GEMINI_MAX_MODEL_ATTEMPTS - 1) {
        const message = apiMessage || error.message;
        const err = new Error(message);
        err.userMessage = status === 503
          ? 'Gemini is temporarily at capacity. DevDrop tried multiple Gemini Flash models, but they are currently unavailable. Please try again shortly.'
          : apiMessage
            ? `Gemini API error: ${apiMessage}`
            : 'Failed to reach Gemini. Check the backend network connection and GEMINI_API_KEY.';
        err.statusCode = status || 502;
        throw err;
      }

      console.warn(`Gemini capacity issue on ${model}; trying fallback model next`);
      if (GEMINI_RETRY_DELAY_MS > 0) await sleep(GEMINI_RETRY_DELAY_MS);
    }
  }

  const fallback = new Error(lastError?.message || 'All Gemini models failed');
  fallback.userMessage = 'Gemini is temporarily unavailable. Please try again shortly.';
  fallback.statusCode = 503;
  throw fallback;
}

module.exports = { generateApp };
