const axios = require('axios');

const RETIRED_GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
]);

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

const GEMINI_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '180000', 10);
const GEMINI_RETRY_DELAY_MS = Number.parseInt(process.env.GEMINI_RETRY_DELAY_MS || '500', 10);
const GEMINI_MAX_MODEL_ATTEMPTS = Math.max(
  1,
  Math.min(
    Number.parseInt(process.env.GEMINI_MAX_MODEL_ATTEMPTS || '4', 10) || 4,
    GEMINI_MODELS.length
  )
);
const GEMINI_MAX_OUTPUT_TOKENS = Math.max(
  1024,
  Math.min(
    Number.parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '65536', 10) || 65536,
    65536
  )
);

const SYSTEM_PROMPT = `You are an expert React developer. Generate complete, working React applications from user prompts.

RULES:
1. Return exactly one valid JSON object. No markdown fences or text outside JSON.
2. Exact shape:
{
  "assistantMessage": "<brief explanation>",
  "title": "<short title>",
  "files": {
    "/App.js": { "code": "<complete source>" },
    "/components/Header.js": { "code": "<complete source>" }
  },
  "dependencies": { "package-name": "version" }
}
3. Use React functional components and hooks. No TypeScript.
4. Use Tailwind CSS for styling.
5. /App.js must exist and have a default export.
6. Every relative import must resolve to a file included in files.
7. Default imports require export default. Named imports require matching named exports.
8. Never mix default and named imports incorrectly.
9. Do not include react, react-dom, or tailwindcss in dependencies.
10. Return ALL project files when modifying an existing project.
11. Keep the implementation complete but reasonably compact so the JSON is unlikely to hit the output limit.`;

const REPAIR_SYSTEM_PROMPT = `You are a React build fixer. Repair the supplied generated React project.

Return ONLY one valid JSON object with this shape:
{
  "assistantMessage": "<brief explanation>",
  "title": "<short title>",
  "files": { "/App.js": { "code": "<complete source>" } },
  "dependencies": { "package-name": "version" }
}

Rules:
- Preserve the requested design, content, theme, interactions, and functionality.
- Fix only import/export and directly related compile problems.
- Every relative import must resolve to a returned file.
- Default imports require export default.
- Named imports require a matching named export.
- Return ALL files.
- No TypeScript.
- No markdown outside JSON.`;

function trimHistory(messages) {
  if (messages.length <= 10) return messages;
  return [messages[0], ...messages.slice(-8)];
}

function buildContents(messages, fileData) {
  const trimmed = trimHistory(messages);
  return trimmed.map((msg, idx) => {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    if (msg.role !== 'user') return { role, parts: [{ text: msg.content }] };

    let text = msg.content;
    if (idx === trimmed.length - 1 && fileData) {
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

  try {
    const parsed = JSON.parse(text);
    if (!parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
      const err = new Error('Gemini response missing files');
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
  } catch (error) {
    if (error.statusCode) throw error;

    const err = new Error('Gemini returned incomplete/non-JSON output: ' + text.slice(0, 500));
    err.finishReason = finishReason;
    // A JSON parse failure is retryable even when Gemini reports STOP. Large
    // responses can be unusable before a useful machine-readable payload exists.
    err.retryableOutput = true;
    err.userMessage = 'Gemini returned an incomplete app response. DevDrop will retry automatically.';
    err.statusCode = 502;
    throw err;
  }
}

function resolveFilePath(fromPath, importPath, files) {
  if (!importPath.startsWith('.')) return null;

  const fromParts = fromPath.split('/').filter(Boolean);
  fromParts.pop();
  for (const segment of importPath.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') fromParts.pop();
    else fromParts.push(segment);
  }

  const base = '/' + fromParts.join('/');
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];
  return candidates.find((candidate) => Object.prototype.hasOwnProperty.call(files, candidate)) || null;
}

function hasDefaultExport(code) {
  return /\bexport\s+default\b/.test(code) || /\bexport\s*\{[^}]*\bdefault\b[^}]*\}/.test(code);
}

function hasNamedExport(code, name) {
  const direct = new RegExp(`\\bexport\\s+(?:const|let|var|function|class)\\s+${name}\\b`);
  const exportList = new RegExp(`\\bexport\\s*\{[^}]*\\b${name}\\b[^}]*\}`);
  return direct.test(code) || exportList.test(code);
}

function validateGeneratedFiles(files) {
  const errors = [];
  if (!files['/App.js']) errors.push('/App.js is missing.');
  else if (!hasDefaultExport(files['/App.js']?.code || '')) errors.push('/App.js must have a default export.');

  for (const [filePath, fileObj] of Object.entries(files)) {
    const code = typeof fileObj?.code === 'string' ? fileObj.code : '';
    if (!code) {
      errors.push(`${filePath} has no code.`);
      continue;
    }

    const importRegex = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    while ((match = importRegex.exec(code))) {
      const specifier = match[1] || '';
      const importPath = match[2] || match[3] || '';
      if (!importPath.startsWith('.')) continue;

      const target = resolveFilePath(filePath, importPath, files);
      if (!target) {
        errors.push(`${filePath} imports missing relative file ${importPath}.`);
        continue;
      }

      const targetCode = typeof files[target]?.code === 'string' ? files[target].code : '';
      const defaultMatch = specifier.match(/^(?!\s*\{)([A-Za-z_$][\w$]*)/)?.[1];
      if (defaultMatch && !hasDefaultExport(targetCode)) {
        errors.push(`${filePath} imports default "${defaultMatch}" from ${target}, but ${target} has no default export.`);
      }

      const namedBlock = specifier.match(/\{([\s\S]*?)\}/)?.[1];
      if (namedBlock) {
        for (const rawName of namedBlock.split(',')) {
          const imported = rawName.trim().split(/\s+as\s+/i)[0].trim();
          if (imported && !hasNamedExport(targetCode, imported)) {
            errors.push(`${filePath} imports named "${imported}" from ${target}, but ${target} does not export it as a named export.`);
          }
        }
      }
    }
  }

  return [...new Set(errors)].slice(0, 12);
}

async function requestModel({ model, apiKey, contents, timeout, systemPrompt = SYSTEM_PROMPT }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  return axios.post(
    `${url}?key=${encodeURIComponent(apiKey)}`,
    {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    },
    { timeout, headers: { 'Content-Type': 'application/json' } }
  );
}

async function repairGeneratedApp({ model, apiKey, files, dependencies, errors, timeout }) {
  const repairRequest = `The generated app failed deterministic preflight validation.\n\nPROBLEMS:\n${errors
    .map((error) => `- ${error}`)
    .join('\n')}\n\nCURRENT FILES:\n${JSON.stringify(files)}\n\nCURRENT DEPENDENCIES:\n${JSON.stringify(dependencies)}\n\nReturn the repaired complete project.`;

  const response = await requestModel({
    model,
    apiKey,
    contents: [{ role: 'user', parts: [{ text: repairRequest }] }],
    timeout,
    systemPrompt: REPAIR_SYSTEM_PROMPT,
  });

  const result = parseGeneratedApp(extractText(response), getFinishReason(response));
  const remainingErrors = validateGeneratedFiles(result.files);
  if (remainingErrors.length) {
    const err = new Error(`Automatic preview validation failed: ${remainingErrors.join(' | ')}`);
    err.userMessage = 'The generated app still has a preview import/export mismatch. Use Fix with AI once more.';
    err.statusCode = 502;
    throw err;
  }
  return result;
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
  const timeout = Number.isFinite(GEMINI_TIMEOUT_MS) && GEMINI_TIMEOUT_MS > 0 ? GEMINI_TIMEOUT_MS : 180000;

  let lastError = null;
  let lastTimedOutModel = null;
  let lastCapacityModel = null;
  let lastInvalidJsonModel = null;

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

      const result = parseGeneratedApp(extractText(response), finishReason);
      const validationErrors = validateGeneratedFiles(result.files);
      if (!validationErrors.length) return result;

      console.warn('Generated app failed import/export preflight; auto-repairing once', {
        model,
        errors: validationErrors,
      });
      return await repairGeneratedApp({
        model,
        apiKey,
        files: result.files,
        dependencies: result.dependencies,
        errors: validationErrors,
        timeout,
      });
    } catch (error) {
      const status = error.response?.status;
      const apiMessage = error.response?.data?.error?.message;
      const timedOut = isTimeoutError(error);
      const capacity = isRetryableCapacityError(error);
      const retryableOutput = Boolean(error.retryableOutput);
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
      if (retryableOutput) lastInvalidJsonModel = model;

      if ((timedOut || capacity || retryableOutput) && attempt < GEMINI_MAX_MODEL_ATTEMPTS - 1) {
        const reason = timedOut ? 'timeout' : capacity ? 'capacity' : 'invalid JSON output';
        console.warn(`Gemini ${reason} on ${model}; trying fallback model ${GEMINI_MODELS[attempt + 1]}`);
        if (GEMINI_RETRY_DELAY_MS > 0) await sleep(GEMINI_RETRY_DELAY_MS);
        continue;
      }

      if (timedOut) {
        const err = new Error(`Gemini request timed out after ${timeout}ms`);
        err.userMessage = `Gemini timed out after ${Math.round(timeout / 1000)} seconds. DevDrop tried ${GEMINI_MAX_MODEL_ATTEMPTS} model attempts. Please try again.`;
        err.statusCode = 504;
        throw err;
      }

      if (status === 503 || capacity) {
        const err = new Error(apiMessage || 'Gemini temporarily unavailable');
        err.userMessage = `Gemini is temporarily at capacity. DevDrop tried ${GEMINI_MAX_MODEL_ATTEMPTS} model attempts and none were available right now. Please try again shortly.`;
        err.statusCode = 503;
        throw err;
      }

      if (retryableOutput) {
        const err = new Error(error.message || 'Gemini returned incomplete output');
        err.userMessage = `Gemini returned unusable JSON on ${lastInvalidJsonModel || model} after ${GEMINI_MAX_MODEL_ATTEMPTS} model attempts. Please try again.`;
        err.statusCode = 502;
        throw err;
      }

      const err = new Error(apiMessage || error.message);
      err.userMessage = apiMessage
        ? `Gemini API error: ${apiMessage}`
        : error.userMessage || 'Failed to generate the application.';
      err.statusCode = status || error.statusCode || 502;
      throw err;
    }
  }

  const fallback = new Error(lastError?.message || 'All Gemini models failed');
  fallback.userMessage = lastTimedOutModel
    ? `Gemini generation timed out on ${lastTimedOutModel}. Please try again.`
    : lastCapacityModel
      ? 'Gemini is temporarily at capacity. Please try again shortly.'
      : 'Gemini returned an unusable response. Please try again.';
  fallback.statusCode = lastTimedOutModel ? 504 : lastCapacityModel ? 503 : 502;
  throw fallback;
}

module.exports = { generateApp };
