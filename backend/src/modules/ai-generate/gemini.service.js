const axios = require('axios');

// Adapted from https://github.com/piyush-eon/ai-app-builder (app/api/gen-ai-code/route.ts)
// — same JSON-contract idea (assistantMessage/title/files/dependencies), same
// system prompt approach — but called via a plain REST request instead of the
// @google/genai SDK (no new dependency needed; axios is already used
// elsewhere in this backend), non-streaming for simplicity, and gated behind
// DevDrop's own JWT auth instead of Clerk/credits/Arcjet.

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

/**
 * Keep only the system message plus the most recent few turns, so long
 * chats don't blow past context limits or slow every request down.
 */
function trimHistory(messages) {
  if (messages.length <= 10) return messages;
  return [messages[0], ...messages.slice(-8)];
}

/**
 * Turn DevDrop's { role: 'user' | 'assistant', content }[] chat history into
 * Gemini's { role: 'user' | 'model', parts: [...] }[] contents array, and
 * attach the current project files as context on the final user turn so
 * follow-up prompts ("make the header blue") can see what already exists.
 */
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

/**
 * Call Gemini and return the parsed { assistantMessage, title, files,
 * dependencies } object. Throws with a `.userMessage` on any failure the
 * caller should show back to the user (missing key, bad JSON, etc.).
 */
async function generateApp({ messages, fileData }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured on the backend');
    err.userMessage = 'AI Studio is not configured yet (missing Gemini API key on the server).';
    err.statusCode = 500;
    throw err;
  }

  const contents = buildContents(messages, fileData);

  let response;
  try {
    response = await axios.post(
      `${GEMINI_API_URL}?key=${apiKey}`,
      {
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      },
      { timeout: 60_000 }
    );
  } catch (error) {
    const apiMessage = error.response?.data?.error?.message;
    const err = new Error(apiMessage || error.message);
    err.userMessage = apiMessage
      ? `Gemini API error: ${apiMessage}`
      : 'Failed to reach Gemini. Check the server logs and your GEMINI_API_KEY.';
    err.statusCode = error.response?.status || 502;
    throw err;
  }

  const text = response.data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const err = new Error('Gemini returned non-JSON output: ' + text.slice(0, 500));
    err.userMessage = 'The AI returned an invalid response. Please try again.';
    err.statusCode = 502;
    throw err;
  }

  if (!parsed.files || typeof parsed.files !== 'object') {
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
