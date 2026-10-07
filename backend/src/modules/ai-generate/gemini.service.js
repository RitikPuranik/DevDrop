const axios = require('axios');

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || '')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

const MAX_RETRIES = Number.parseInt(
  process.env.GEMINI_MAX_RETRIES || '2',
  10
);

const RETRY_DELAY_MS = Number.parseInt(
  process.env.GEMINI_RETRY_DELAY_MS || '1000',
  10
);

const MAX_RETRY_DELAY_MS = Number.parseInt(
  process.env.GEMINI_MAX_RETRY_DELAY_MS || '8000',
  10
);

const REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.GEMINI_REQUEST_TIMEOUT_MS || '60000',
  10
);

const SYSTEM_PROMPT = `You are an expert React developer and AI website builder.

Your job is to generate complete, working React applications based on the user's request.

IMPORTANT:
- Return ONLY valid JSON.
- Do NOT return markdown.
- Do NOT return code fences.
- Do NOT add text before or after the JSON.
- The generated project must actually run.

EXACT RESPONSE FORMAT:

{
  "assistantMessage": "Briefly explain what you built or changed.",
  "title": "Short 2-4 word title",
  "files": {
    "/App.js": {
      "code": "FULL FILE CONTENT"
    },
    "/components/Header.js": {
      "code": "FULL FILE CONTENT"
    }
  },
  "dependencies": {
    "framer-motion": "^12.0.0"
  }
}

RULES:

1. Use React functional components and hooks.

2. Generate JavaScript/JSX only.
   Do NOT use TypeScript.

3. The main entry file must always be:
   /App.js

4. /App.js must contain:
   export default function App() { ... }

5. Every imported local file must exist in "files".

6. Every imported npm package must exist in "dependencies", except:
   - react
   - react-dom

7. Do not include:
   - node_modules
   - package-lock.json
   - .git files
   - binary files

8. Use Tailwind-style utility classes when the runtime supports them.
   Prefer simple className usage.

9. Do not depend on external images unless the user specifically asks for them.

10. For visual assets, prefer:
    - SVG
    - CSS
    - gradients
    - icons
    - simple shapes

11. Keep dependencies minimal.

12. Do not add unnecessary packages.

13. The application must be responsive on:
    - desktop
    - tablet
    - mobile

14. When modifying an existing project:
    - preserve existing functionality
    - preserve existing design unless the user asks to change it
    - return every file needed for the resulting project
    - ensure imports still work

15. Never return placeholder comments such as:
    // rest of code here
    // implementation omitted

16. Every returned file must contain complete source code.

17. Prefer one-page applications unless the user explicitly requests multiple pages.

18. Make the generated UI polished, modern and visually coherent.

19. Do not hallucinate unavailable APIs.

20. If the user requests a feature that needs a backend but the current project has no backend, implement the frontend interaction safely with local state or a clear mock data layer.

21. Generated code must be syntactically valid JavaScript/JSX.

22. Do not use unsupported Node-only APIs inside browser components.

23. Do not create circular imports.

24. Avoid excessive dependency count.

25. The final response JSON must contain:
    assistantMessage
    title
    files
    dependencies
`;

/**
 * Keep enough history for conversational edits without allowing
 * unnecessarily large requests.
 */
function trimHistory(messages) {
  if (!Array.isArray(messages)) return [];

  if (messages.length <= 10) {
    return messages;
  }

  return [
    messages[0],
    ...messages.slice(-8),
  ];
}

/**
 * Convert DevDrop chat history into Gemini contents.
 */
function buildContents(messages, fileData) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const trimmed = trimHistory(safeMessages);

  return trimmed.map((msg, index) => {
    const isAssistant = msg.role === 'assistant';

    const role = isAssistant ? 'model' : 'user';

    let text = String(msg.content || '');

    const isLastMessage = index === trimmed.length - 1;

    if (!isAssistant && isLastMessage && fileData) {
      text +=
        '\n\nCURRENT PROJECT FILES:\n' +
        JSON.stringify(fileData, null, 2) +
        '\n\nUse these files as the source of truth for edits.';
    }

    return {
      role,
      parts: [
        {
          text,
        },
      ],
    };
  });
}

/**
 * Build Gemini REST URL for a specific model.
 */
function getGeminiUrl(model) {
  return (
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent`
  );
}

/**
 * Wait before retry.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff with a small amount of jitter.
 */
function getRetryDelay(attempt) {
  const exponential = Math.min(
    RETRY_DELAY_MS * Math.pow(2, attempt),
    MAX_RETRY_DELAY_MS
  );

  const jitter = Math.floor(Math.random() * 500);

  return exponential + jitter;
}

/**
 * Determine whether an error is transient and worth retrying.
 */
function isRetryableError(error) {
  const status = error?.response?.status;

  if (!status) {
    return true;
  }

  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

/**
 * Extract Google's API error message.
 */
function getApiErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.error?.status ||
    error?.message ||
    'Unknown Gemini API error'
  );
}

/**
 * Extract generated text safely.
 */
function extractGeneratedText(response) {
  const candidates = response?.data?.candidates;

  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Gemini returned no candidates');
  }

  const parts = candidates[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    throw new Error('Gemini response contained no content parts');
  }

  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

/**
 * Remove markdown fences and accidental surrounding text.
 */
function cleanJsonText(text) {
  if (!text) return '';

  let cleaned = text.trim();

  // Remove markdown code fences.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  // If Gemini added text around the JSON, isolate the JSON object.
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned.trim();
}

/**
 * Parse Gemini JSON safely.
 */
function parseGeminiJson(text) {
  const cleaned = cleanJsonText(text);

  if (!cleaned) {
    throw new Error('Gemini returned an empty response');
  }

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    /*
     * Some models occasionally return escaped JSON as a string.
     * Try one additional parse.
     */
    try {
      const decoded = JSON.parse(JSON.stringify(cleaned));

      if (typeof decoded === 'string') {
        return JSON.parse(decoded);
      }
    } catch {
      // Ignore second parse attempt.
    }

    const error = new Error(
      `Gemini returned invalid JSON: ${firstError.message}`
    );

    error.rawText = cleaned.slice(0, 2000);

    throw error;
  }
}

/**
 * Validate and normalize generated files.
 */
function normalizeFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new Error('Gemini response "files" must be an object');
  }

  const normalized = {};
  const seen = new Set();

  for (const [rawPath, rawFile] of Object.entries(files)) {
    if (!rawPath || typeof rawPath !== 'string') {
      continue;
    }

    let path = rawPath.trim().replace(/\\/g, '/');

    if (!path.startsWith('/')) {
      path = `/${path}`;
    }

    // Security: never accept path traversal.
    if (
      path.includes('../') ||
      path.includes('/..') ||
      path === '/..' ||
      path.includes('\0')
    ) {
      throw new Error(`Unsafe generated file path: ${path}`);
    }

    if (
      path.startsWith('/node_modules/') ||
      path.startsWith('/.git/') ||
      path.includes('/.git/')
    ) {
      throw new Error(`Generated project contains forbidden path: ${path}`);
    }

    if (seen.has(path)) {
      continue;
    }

    seen.add(path);

    let code = '';

    if (typeof rawFile === 'string') {
      code = rawFile;
    } else if (rawFile && typeof rawFile === 'object') {
      code =
        typeof rawFile.code === 'string'
          ? rawFile.code
          : typeof rawFile.content === 'string'
            ? rawFile.content
            : '';
    }

    if (typeof code !== 'string') {
      throw new Error(`Invalid content for generated file: ${path}`);
    }

    normalized[path] = {
      code,
    };
  }

  if (!normalized['/App.js']) {
    throw new Error('Generated project is missing /App.js');
  }

  return normalized;
}

/**
 * Normalize dependencies.
 */
function normalizeDependencies(dependencies) {
  if (
    !dependencies ||
    typeof dependencies !== 'object' ||
    Array.isArray(dependencies)
  ) {
    return {};
  }

  const normalized = {};

  for (const [name, version] of Object.entries(dependencies)) {
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      typeof version !== 'string' ||
      !version.trim()
    ) {
      continue;
    }

    const packageName = name.trim();

    /*
     * React and ReactDOM are supplied by DevDrop's generated runtime.
     * Do not duplicate them.
     */
    if (
      packageName === 'react' ||
      packageName === 'react-dom'
    ) {
      continue;
    }

    normalized[packageName] = version.trim();
  }

  return normalized;
}

/**
 * Validate final AI structure.
 */
function normalizeGenerationResult(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini response must be a JSON object');
  }

  const files = normalizeFiles(parsed.files);

  const dependencies = normalizeDependencies(
    parsed.dependencies
  );

  return {
    assistantMessage:
      typeof parsed.assistantMessage === 'string'
        ? parsed.assistantMessage
        : 'Generated the requested application.',

    title:
      typeof parsed.title === 'string' && parsed.title.trim()
        ? parsed.title.trim()
        : 'Generated App',

    files,

    dependencies,
  };
}

/**
 * Make one Gemini request.
 */
async function requestGemini({
  model,
  apiKey,
  contents,
}) {
  const url = `${getGeminiUrl(model)}?key=${encodeURIComponent(apiKey)}`;

  return axios.post(
    url,
    {
      contents,

      systemInstruction: {
        parts: [
          {
            text: SYSTEM_PROMPT,
          },
        ],
      },

      generationConfig: {
        temperature: 0.7,

        responseMimeType: 'application/json',

        /*
         * Keep token budget comfortably high for complete applications.
         * Gemini may ignore unsupported fields depending on the model,
         * but this is harmless for supported models.
         */
        maxOutputTokens: 30000,
      },
    },
    {
      timeout: REQUEST_TIMEOUT_MS,

      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Generate the application.
 *
 * Strategy:
 *
 * model A attempt 1
 * model A attempt 2
 * model A attempt 3
 * model B attempt 1
 * ...
 *
 * Only transient errors are retried.
 */
async function generateApp({ messages, fileData }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const err = new Error(
      'GEMINI_API_KEY is not configured on the backend'
    );

    err.userMessage =
      'AI Studio is not configured yet. Add GEMINI_API_KEY to the backend .env file.';

    err.statusCode = 500;

    throw err;
  }

  const contents = buildContents(messages, fileData);

  const models = [
    DEFAULT_GEMINI_MODEL,
    ...FALLBACK_MODELS,
  ].filter(
    (model, index, all) =>
      model && all.indexOf(model) === index
  );

  let lastError = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(
          `[AI] Gemini request: model=${model}, attempt=${attempt + 1}/${MAX_RETRIES + 1}`
        );

        const response = await requestGemini({
          model,
          apiKey,
          contents,
        });

        console.log(
          `[AI] Gemini request succeeded: model=${model}`
        );

        const text = extractGeneratedText(response);

        const parsed = parseGeminiJson(text);

        const result = normalizeGenerationResult(parsed);

        console.log(
          `[AI] Generation normalized successfully: model=${model}, files=${Object.keys(result.files).length}`
        );

        return result;
      } catch (error) {
        lastError = error;

        const status = error?.response?.status;

        console.warn(
          `[AI] Gemini request failed: model=${model}, ` +
          `status=${status || 'network/error'}, ` +
          `attempt=${attempt + 1}/${MAX_RETRIES + 1}, ` +
          `message=${getApiErrorMessage(error)}`
        );

        /*
         * Parsing/validation failures are not fixed by retrying
         * the exact same response.
         */
        if (!status && error?.rawText) {
          break;
        }

        if (!isRetryableError(error)) {
          break;
        }

        if (attempt < MAX_RETRIES) {
          const delay = getRetryDelay(attempt);

          console.log(
            `[AI] Retrying Gemini in ${delay}ms...`
          );

          await sleep(delay);
        }
      }
    }

    console.warn(
      `[AI] Model unavailable after retries: ${model}`
    );
  }

  const apiMessage = getApiErrorMessage(lastError);

  const err = new Error(apiMessage);

  const lastStatus =
    lastError?.response?.status || lastError?.statusCode;

  if (
    lastStatus === 429 ||
    lastStatus === 500 ||
    lastStatus === 502 ||
    lastStatus === 503 ||
    lastStatus === 504
  ) {
    err.userMessage =
      'The AI provider is temporarily busy. DevDrop retried the request but the configured model(s) are currently unavailable. Please try again shortly.';
  } else if (lastError?.rawText) {
    err.userMessage =
      'The AI returned an invalid project response. Please try the request again.';
  } else {
    err.userMessage =
      `AI generation failed: ${apiMessage}`;
  }

  err.statusCode = lastStatus || 502;

  throw err;
}

module.exports = {
  generateApp,
};