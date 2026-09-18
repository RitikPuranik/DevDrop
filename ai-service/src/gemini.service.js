const axios = require('axios');
const { parse } = require('@babel/parser');
const geminiPool = require('./geminiPool.service');

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

const GEMINI_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '90000', 10);
const GEMINI_MAX_OUTPUT_TOKENS = Math.max(
  1024,
  Math.min(
    Number.parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '65536', 10) || 65536,
    65536
  )
);

const SYSTEM_PROMPT = `You are an expert React developer. Generate complete, working React applications from user prompts.

RULES:
1. Always respond with one valid JSON object only. Never use markdown fences or extra text.
2. Exact JSON shape:
{
  "assistantMessage": "<brief explanation>",
  "title": "<short 2-4 word title>",
  "files": {
    "/App.js": { "code": "<complete file>" },
    "/components/Header.js": { "code": "<complete file>" }
  },
  "dependencies": {
    "package-name": "version"
  }
}
3. Use React functional components and hooks. Do not use TypeScript.
4. Use Tailwind CSS for styling.
5. /App.js must exist and must have a default export.
6. Every relative import must resolve to a file included in "files".
7. Every imported default component must be exported with "export default".
8. Every imported named symbol must be explicitly exported from its target file with the same name.
9. Never mix default-vs-named imports incorrectly. Before returning JSON, mentally compile-check every import/export pair.
10. Do not invent component names or import paths.
11. Do not include react, react-dom, or tailwindcss in dependencies.
12. Keep components focused and avoid unnecessary duplication.
13. Return complete source for every generated file.`;

const REPAIR_SYSTEM_PROMPT = `You are a React build-fixer. Repair an already-generated React application.

Return ONLY one valid JSON object using exactly:
{
  "assistantMessage": "<brief explanation>",
  "title": "<short title>",
  "files": {
    "/App.js": { "code": "<complete file>" }
  },
  "dependencies": {
    "package-name": "version"
  }
}

Rules:
- Preserve the requested design, content, theme, interactions, and functionality.
- Fix syntax, compile, import/export, and directly related runtime-preflight problems reported below.
- Every relative import must resolve to a returned file.
- Default imports require export default.
- Named imports require a matching named export.
- Return ALL project files, not only changed files.
- Do not use TypeScript.
- Do not include markdown or explanatory text outside the JSON.`;

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
  return response?.data?.candidates?.[0]?.finishReason || null;
}


function extractJsonCandidate(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  // Models sometimes return a fenced JSON object despite the JSON MIME request.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1).trim();

  return trimmed;
}

async function recoverFromPartial({ model, contents, partialOutput, timeout }) {
  const recoveryPrompt = `The previous Gemini response was intended to be one JSON object describing a complete React app, but it could not be parsed.

Reconstruct the COMPLETE response from the user's original request and the partial response below.

Return ONLY valid JSON matching this exact shape:
{
  "assistantMessage": "brief explanation",
  "title": "short title",
  "files": {
    "/App.js": { "code": "complete source" }
  },
  "dependencies": {}
}

Requirements:
- Include every source file required by App.js and its imports.
- Preserve the requested design, theme, content, interactions, and functionality.
- Every relative import must resolve to a returned file.
- Default imports require export default.
- Named imports require matching named exports.
- Do not use markdown fences.
- Do not omit or truncate source code.
- Do not include react, react-dom, or tailwindcss in dependencies.

PARTIAL RESPONSE:
${partialOutput}`;

  const response = await requestModel({
    model,
    contents: [
      ...contents,
      { role: 'user', parts: [{ text: recoveryPrompt }] },
    ],
    timeout,
    systemPrompt: SYSTEM_PROMPT,
  });

  const raw = extractText(response);
  const finishReason = getFinishReason(response);
  if (!raw) {
    const err = new Error('Gemini recovery returned no text');
    err.retryableOutput = true;
    err.finishReason = finishReason;
    throw err;
  }

  return parseGeneratedApp(raw, finishReason);
}

function parseGeneratedApp(text, finishReason) {
  if (!text) {
    const err = new Error('Gemini returned no text');
    err.userMessage = 'Gemini did not return generated app code. Please try again.';
    err.statusCode = 502;
    throw err;
  }

  try {
    const parsed = JSON.parse(extractJsonCandidate(text));
    if (!parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
      const err = new Error('Gemini response missing files');
      err.userMessage = 'The AI response was missing generated files.';
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
    err.retryableOutput = true;
    err.userMessage =
      finishReason === 'MAX_TOKENS'
        ? 'Gemini generated too much code for one response. Please try again.'
        : 'The AI returned an incomplete response. Please try again.';
    err.statusCode = 502;
    throw err;
  }
}

function stripExtension(path) {
  return path.replace(/\.(jsx?|tsx?|mjs|cjs)$/, '');
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
  return /\bexport\s+default\b/.test(code) || /\bexport\s*\{\s*[^}]*\bdefault\b[^}]*\}/.test(code);
}

function hasNamedExport(code, name) {
  const direct = new RegExp(
    `\\bexport\\s+(?:const|let|var|function|class)\\s+${name}\\b`
  );
  const exportList = new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
  return direct.test(code) || exportList.test(code);
}

function validateGeneratedFiles(files) {
  const errors = [];

  const parseGeneratedSource = (filePath, code) => {
    // Sandpack runs Babel over these files in the browser. Validate the same
    // JavaScript/JSX syntax on the AI service before returning a result so a
    // malformed generated component cannot reach preview.
    try {
      parse(code, {
        sourceType: 'module',
        sourceFilename: filePath,
        plugins: [
          'jsx',
          'dynamicImport',
          'optionalChaining',
          'nullishCoalescingOperator',
          'topLevelAwait',
        ],
      });
    } catch (error) {
      const line = error.loc?.line;
      const column = error.loc?.column;
      const location = Number.isInteger(line)
        ? ` (${line}:${Number.isInteger(column) ? column + 1 : 1})`
        : '';
      errors.push(`${filePath}: JavaScript/JSX syntax error${location}: ${error.message}`);
    }
  };

  if (!files['/App.js']) {
    errors.push('/App.js is missing.');
  } else if (!hasDefaultExport(files['/App.js']?.code || '')) {
    errors.push('/App.js must have a default export.');
  }

  for (const [filePath, fileObj] of Object.entries(files)) {
    const code = typeof fileObj?.code === 'string' ? fileObj.code : '';
    if (!code) {
      errors.push(`${filePath} has no code.`);
      continue;
    }

    parseGeneratedSource(filePath, code);

    const importRegex =
      /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

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

      const defaultMatch = specifier
        .match(/^(?!\s*\{)([A-Za-z_$][\w$]*)/)
        ?.[1];

      if (defaultMatch && !hasDefaultExport(targetCode)) {
        errors.push(
          `${filePath} imports default "${defaultMatch}" from ${target}, but ${target} has no default export.`
        );
      }

      const namedBlock = specifier.match(/\{([\s\S]*?)\}/)?.[1];
      if (namedBlock) {
        for (const rawName of namedBlock.split(',')) {
          const imported = rawName.trim().split(/\s+as\s+/i)[0].trim();
          if (!imported) continue;
          if (!hasNamedExport(targetCode, imported)) {
            errors.push(
              `${filePath} imports named "${imported}" from ${target}, but ${target} does not export it as a named export.`
            );
          }
        }
      }
    }
  }

  return [...new Set(errors)].slice(0, 12);
}

/**
 * Issues one Gemini request for `model`, routed through the Gemini API key
 * pool: the pool picks a credential, and on any retryable failure
 * (quota/429, 5xx, overloaded, timeout, transient network error)
 * automatically retries with another key before this rejects — the model
 * fallback loop in generateApp() never sees those as a reason to switch
 * models. Returns the same axios response shape callers already expect.
 */
async function requestModel({ model, contents, timeout, systemPrompt }) {
  const { result, keyId } = await geminiPool.execute((apiKey) => {
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
  });

  const usageMetadata = result?.data?.usageMetadata;
  if (usageMetadata && keyId) {
    const poolEntry = geminiPool._internal.pool.get(keyId);
    if (poolEntry) geminiPool.markTokenUsage(poolEntry, usageMetadata);
  }

  return result;
}

/**
 * Website generation traversal order is deliberately credential-first:
 *
 *   key A -> every configured model -> key B -> every configured model -> ...
 *
 * This prevents model fallback from silently selecting a different credential
 * before the current project has had a chance to try its other models.
 */
async function requestModels({ models, contents, timeout, systemPrompt }) {
  const { result, keyId, model } = await geminiPool.executeModels(models, (apiKey, selectedModel) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;
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
  });

  const usageMetadata = result?.data?.usageMetadata;
  if (usageMetadata && keyId) {
    const poolEntry = geminiPool._internal.pool.get(keyId);
    if (poolEntry) geminiPool.markTokenUsage(poolEntry, usageMetadata);
  }

  return { result, keyId, model };
}

async function repairGeneratedApp({ model, files, dependencies, errors, timeout }) {
  const repairRequest = `The generated app has these deterministic import/export problems:

${errors.map((error) => `- ${error}`).join('\n')}

Fix the application and return ALL files.

CURRENT FILES:
${JSON.stringify(files, null, 2)}

CURRENT DEPENDENCIES:
${JSON.stringify(dependencies, null, 2)}`;

  const response = await requestModel({
    model,
    contents: [{ role: 'user', parts: [{ text: repairRequest }] }],
    timeout,
    systemPrompt: REPAIR_SYSTEM_PROMPT,
  });

  const result = parseGeneratedApp(
    extractText(response),
    getFinishReason(response)
  );

  const remainingErrors = validateGeneratedFiles(result.files);
  if (remainingErrors.length > 0) {
    const err = new Error(
      `Automatic preview validation failed: ${remainingErrors.join(' | ')}`
    );
    err.userMessage =
      'DevDrop generated the site, but its code failed syntax or import/export preflight. The AI repair step could not fully fix it.';
    err.statusCode = 502;
    throw err;
  }

  return result;
}

async function generateApp({ messages, fileData }) {
  const contents = buildContents(messages, fileData);
  const timeout = Number.isFinite(GEMINI_TIMEOUT_MS) && GEMINI_TIMEOUT_MS > 0 ? GEMINI_TIMEOUT_MS : 180000;

  let lastError = null;
  let lastTimedOutModel = null;
  let lastCapacityModel = null;
  let lastInvalidJsonModel = null;

  try {
    const { result: response, keyId, model } = await requestModels({
      models: GEMINI_MODELS,
      contents,
      timeout,
      systemPrompt: SYSTEM_PROMPT,
    });

    const finishReason = getFinishReason(response);
    const rawText = extractText(response);
    console.log('Gemini generation succeeded', {
      model,
      keyId,
      status: response.status,
      finishReason,
      elapsedMs: 0,
      outputLimit: GEMINI_MAX_OUTPUT_TOKENS,
      outputChars: rawText.length,
    });

    let result;
    try {
      result = parseGeneratedApp(rawText, finishReason);
    } catch (parseError) {
      if (!parseError.retryableOutput) throw parseError;
      lastInvalidJsonModel = model;
      lastError = parseError;
      console.warn('Gemini returned malformed JSON; attempting same-model recovery', {
        model,
        keyId,
        finishReason,
        partialChars: rawText.length,
      });
      try {
        result = await recoverFromPartial({ model, contents, partialOutput: rawText, timeout });
      } catch (recoveryError) {
        console.error('Same-model JSON recovery failed', {
          model,
          finishReason: recoveryError.finishReason || getFinishReason(recoveryError.response),
          status: recoveryError.response?.status,
          message: recoveryError.response?.data?.error?.message || recoveryError.message,
        });
        throw parseError;
      }
    }

    const validationErrors = validateGeneratedFiles(result.files);
    if (!validationErrors.length) return result;

    console.warn('Generated app failed syntax/import/export preflight; auto-repairing once', {
      model,
      keyId,
      errors: validationErrors,
    });
    return await repairGeneratedApp({
      model,
      files: result.files,
      dependencies: result.dependencies,
      errors: validationErrors,
      timeout,
    });
  } catch (error) {
    if (error.name === 'PoolExhaustedError') {
      lastError = error;
      throw Object.assign(new Error(error.message), {
        userMessage: 'AI generation is temporarily busy. DevDrop tried every configured Gemini model on each available project, but all options are exhausted right now. Please try again shortly.',
        statusCode: 503,
        code: 'GEMINI_POOL_EXHAUSTED',
      });
    }

    const status = error.response?.status;
    const apiMessage = error.response?.data?.error?.message;
    const timedOut = isTimeoutError(error);
    const capacity = isRetryableCapacityError(error);
    const retryableOutput = Boolean(error.retryableOutput);
    lastError = error;

    console.error('Gemini generation failed', {
      status,
      code: error.code,
      model: lastInvalidJsonModel || lastCapacityModel || lastTimedOutModel,
      finishReason: error.finishReason,
      message: apiMessage || error.message,
    });

    if (timedOut) lastTimedOutModel = lastTimedOutModel || 'configured models';
    if (capacity) lastCapacityModel = lastCapacityModel || 'configured models';
    if (retryableOutput) lastInvalidJsonModel = lastInvalidJsonModel || 'configured models';

    if (timedOut) {
      const err = new Error(`Gemini request timed out after ${timeout}ms`);
      err.userMessage =
        'Gemini is taking too long to respond. DevDrop tried all configured models on each available project and could not complete the request. Please try again.';
      err.statusCode = 504;
      throw err;
    }

    if (status === 503 || capacity) {
      const err = new Error(apiMessage || 'Gemini temporarily unavailable');
      err.userMessage =
        'Gemini is temporarily at capacity. DevDrop tried all configured models on each available project and none completed the request right now. Please try again shortly.';
      err.statusCode = 503;
      throw err;
    }

    if (retryableOutput) {
      const err = new Error(error.message || 'Gemini returned incomplete output');
      err.userMessage =
        'Gemini reached the end of its output before finishing the app JSON. Please try again.';
      err.statusCode = 502;
      throw err;
    }

    const err = new Error(apiMessage || error.message || lastError?.message || 'Failed to generate the application.');
    err.userMessage = apiMessage
      ? `Gemini API error: ${apiMessage}`
      : error.userMessage || 'Failed to generate the application.';
    err.statusCode = status || error.statusCode || 502;
    throw err;
  }
}

module.exports = { generateApp };
