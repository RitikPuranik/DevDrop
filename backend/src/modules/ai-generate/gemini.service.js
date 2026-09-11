const axios = require('axios');

// DevDrop keeps the AI Studio provider behind the backend so the Gemini key
// never reaches the browser. We use Gemini's structured JSON response mode
// and a generous timeout because generating a complete React app can take
// longer than a normal API request.

const RETIRED_GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
]);

const configuredModel = (process.env.GEMINI_MODEL || '').trim();
const GEMINI_MODEL =
  configuredModel && !RETIRED_GEMINI_MODELS.has(configuredModel)
    ? configuredModel
    : 'gemini-3.8-flash';

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '180000', 10);

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

async function generateApp({ messages, fileData }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    const err = new Error('GEMINI_API_KEY is not configured on the backend');
    err.userMessage = 'AI Studio is not configured yet. Add a valid GEMINI_API_KEY to backend/.env and restart the server.';
    err.statusCode = 500;
    throw err;
  }

  const contents = buildContents(messages, fileData);

  let response;
  const startedAt = Date.now();
  try {
    response = await axios.post(
      `${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`,
      {
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      },
      {
        timeout: Number.isFinite(GEMINI_TIMEOUT_MS) && GEMINI_TIMEOUT_MS > 0 ? GEMINI_TIMEOUT_MS : 180000,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const apiMessage = error.response?.data?.error?.message;
    const status = error.response?.status;

    console.error('Gemini request failed', {
      model: GEMINI_MODEL,
      status,
      code: error.code,
      elapsedMs: Date.now() - startedAt,
      message: apiMessage || error.message,
    });

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      const err = new Error(`Gemini request timed out after ${GEMINI_TIMEOUT_MS}ms`);
      err.userMessage = `Gemini took too long to respond. The server waited ${Math.round(GEMINI_TIMEOUT_MS / 1000)} seconds. Please try again.`;
      err.statusCode = 504;
      throw err;
    }

    const err = new Error(apiMessage || error.message);
    err.userMessage = apiMessage
      ? `Gemini API error: ${apiMessage}`
      : 'Failed to reach Gemini. Check the backend network connection and GEMINI_API_KEY.';
    err.statusCode = status || 502;
    throw err;
  }

  const text = response.data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || '';

  if (!text) {
    const finishReason = response.data?.candidates?.[0]?.finishReason;
    const err = new Error(`Gemini returned no text (finishReason=${finishReason || 'unknown'})`);
    err.userMessage = 'Gemini did not return generated app code. Please try again with a more specific prompt.';
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

module.exports = { generateApp };
