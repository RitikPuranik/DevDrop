const axios = require('axios');

const MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
];
const configuredModel = (process.env.GEMINI_MODEL || '').trim();
const modelList = [configuredModel, ...MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
const timeout = Math.max(1000, Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '180000', 10) || 180000);
const maxAttempts = Math.max(1, Math.min(Number.parseInt(process.env.GEMINI_MAX_MODEL_ATTEMPTS || '4', 10) || 4, modelList.length));
const maxOutputTokens = Math.max(1024, Math.min(Number.parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '65536', 10) || 65536, 65536));
const retryDelay = Math.max(0, Number.parseInt(process.env.GEMINI_RETRY_DELAY_MS || '500', 10) || 500);

const SYSTEM_PROMPT = `You are an expert React developer. Generate complete, working React applications from user prompts.

Return ONLY one JSON object:
{
  "assistantMessage": "<brief explanation>",
  "title": "<short title>",
  "files": { "/App.js": { "code": "<complete source>" } },
  "dependencies": { "package-name": "version" }
}

Rules:
- Use JavaScript/JSX only, never TypeScript.
- /App.js must exist and use export default.
- Every relative import must resolve to a returned file.
- Default imports require default exports; named imports require matching named exports.
- Do not include react, react-dom, or tailwindcss in dependencies.
- Return every project file when modifying an existing project.
- Keep the complete response compact enough to fit the output limit.`;

const REPAIR_PROMPT = `You are a React build fixer. Repair the supplied generated project.
Return ONLY the same JSON shape with ALL project files.
Preserve the design and functionality. Fix the listed import/export or directly related build problems. Use JavaScript/JSX only.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function contentsFrom(messages, fileData) {
  const history = messages.length > 10 ? [messages[0], ...messages.slice(-8)] : messages;
  return history.map((message, index) => {
    const role = message.role === 'assistant' ? 'model' : 'user';
    let text = String(message.content || '');
    if (index === history.length - 1 && fileData) {
      text += `\n\nCurrent project files:\n${JSON.stringify(fileData)}`;
    }
    return { role, parts: [{ text }] };
  });
}

function extractText(response) {
  return response.data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
}

function finishReason(response) {
  return response.data?.candidates?.[0]?.finishReason || null;
}

function parseApp(text, reason) {
  if (!text) throw Object.assign(new Error('Gemini returned no text'), { statusCode: 502, userMessage: 'Gemini did not return generated app code.' });
  try {
    const parsed = JSON.parse(text);
    if (!parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) throw new Error('Missing files');
    return {
      assistantMessage: parsed.assistantMessage || '',
      title: parsed.title || 'Generated App',
      files: parsed.files,
      dependencies: parsed.dependencies || {},
    };
  } catch (_error) {
    const err = new Error(`Gemini returned incomplete/non-JSON output: ${text.slice(0, 400)}`);
    err.retryableOutput = true;
    err.finishReason = reason;
    err.statusCode = 502;
    err.userMessage = 'Gemini returned an incomplete app response.';
    err.partialOutput = text;
    throw err;
  }
}

function resolvePath(from, importPath, files) {
  if (!importPath.startsWith('.')) return null;
  const parts = from.split('/').filter(Boolean);
  parts.pop();
  for (const s of importPath.split('/')) {
    if (!s || s === '.') continue;
    if (s === '..') parts.pop(); else parts.push(s);
  }
  const base = '/' + parts.join('/');
  const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`, `${base}/index.js`, `${base}/index.jsx`];
  return candidates.find((p) => Object.prototype.hasOwnProperty.call(files, p)) || null;
}

const hasDefault = (code) => /\bexport\s+default\b/.test(code);
const hasNamed = (code, name) => new RegExp(`\\bexport\\s+(?:const|let|var|function|class)\\s+${name}\\b`).test(code) || new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(code);

function validate(files) {
  const errors = [];
  if (!files['/App.js']) errors.push('/App.js is missing.');
  else if (!hasDefault(files['/App.js']?.code || '')) errors.push('/App.js must have a default export.');

  for (const [path, file] of Object.entries(files)) {
    const code = typeof file?.code === 'string' ? file.code : '';
    if (!code) { errors.push(`${path} has no code.`); continue; }
    const re = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(code))) {
      const spec = m[1] || '';
      const importPath = m[2] || m[3] || '';
      if (!importPath.startsWith('.')) continue;
      const target = resolvePath(path, importPath, files);
      if (!target) { errors.push(`${path} imports missing relative file ${importPath}.`); continue; }
      const targetCode = files[target]?.code || '';
      const defaultName = spec.match(/^(?!\s*\{)([A-Za-z_$][\w$]*)/)?.[1];
      if (defaultName && !hasDefault(targetCode)) errors.push(`${path} imports default "${defaultName}" from ${target}, but it has no default export.`);
      const block = spec.match(/\{([\s\S]*?)\}/)?.[1];
      if (block) for (const item of block.split(',')) {
        const name = item.trim().split(/\s+as\s+/i)[0].trim();
        if (name && !hasNamed(targetCode, name)) errors.push(`${path} imports named "${name}" from ${target}, but it is not exported.`);
      }
    }
  }
  return [...new Set(errors)].slice(0, 12);
}

async function callModel(model, apiKey, contents, systemPrompt) {
  return axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    },
    { timeout, headers: { 'Content-Type': 'application/json' } }
  );
}

async function repair({ model, apiKey, result, errors }) {
  const prompt = `Problems found during deterministic preflight:\n${errors.map((e) => `- ${e}`).join('\n')}\n\nCURRENT PROJECT:\n${JSON.stringify(result.files)}\n\nDEPENDENCIES:\n${JSON.stringify(result.dependencies)}\n\nReturn the repaired project.`;
  const response = await callModel(model, apiKey, [{ role: 'user', parts: [{ text: prompt }] }], REPAIR_PROMPT);
  const fixed = parseApp(extractText(response), finishReason(response));
  const remaining = validate(fixed.files);
  if (remaining.length) throw Object.assign(new Error(`Repair validation failed: ${remaining.join(' | ')}`), { statusCode: 502, userMessage: 'The generated app still has a preview build problem. Please try again.' });
  return fixed;
}

async function generateApp({ messages, fileData }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') throw Object.assign(new Error('Missing GEMINI_API_KEY'), { statusCode: 500, userMessage: 'Add GEMINI_API_KEY to ai-service/.env.' });
  const contents = contentsFrom(messages, fileData);
  let lastError;

  for (let i = 0; i < maxAttempts; i += 1) {
    const model = modelList[i];
    const started = Date.now();
    try {
      const response = await callModel(model, apiKey, contents, SYSTEM_PROMPT);
      const reason = finishReason(response);
      const text = extractText(response);
      console.log('Gemini response', { model, attempt: i + 1, status: response.status, finishReason: reason, outputChars: text.length, elapsedMs: Date.now() - started });
      const result = parseApp(text, reason);
      const errors = validate(result.files);
      if (!errors.length) return result;
      console.warn('AI preflight found import/export issues; repairing once', { model, errors });
      return await repair({ model, apiKey, result, errors });
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const message = error.response?.data?.error?.message || error.message || '';
      const capacity = status === 503 || /high demand|temporarily unavailable|unavailable/i.test(message);
      const timeoutError = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || /timeout of \d+ms exceeded/i.test(message);
      const retryable = Boolean(error.retryableOutput);
      console.error('Gemini attempt failed', { model, attempt: i + 1, status, finishReason: error.finishReason, elapsedMs: Date.now() - started, message });
      if ((capacity || timeoutError || retryable) && i < maxAttempts - 1) {
        await sleep(retryDelay);
        continue;
      }
      if (error.statusCode) throw error;
      throw Object.assign(new Error(message || 'Gemini request failed'), { statusCode: status || 502, userMessage: capacity ? 'Gemini is temporarily at capacity. Please try again shortly.' : 'AI generation failed. Please try again.' });
    }
  }
  throw Object.assign(lastError || new Error('All Gemini models failed'), { statusCode: 502 });
}

module.exports = { generateApp };
