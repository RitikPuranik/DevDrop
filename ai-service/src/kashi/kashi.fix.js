const groq = require('../groq.service');

/**
 * Kashi's build-repair engine. Given a failed Vercel build log plus the
 * relevant repo files, asks the EDIT model for the smallest possible change
 * and then ENFORCES "fix the error and nothing else" in code (not just in the
 * prompt): edits are exact find/replace on files we supplied, each `find`
 * must match exactly once, the total diff is capped, and lockfiles / env
 * files can never be touched.
 */

const MAX_EDITS = Number.parseInt(process.env.KASHI_MAX_EDITS || '8', 10);
const MAX_CHANGED_LINES = Number.parseInt(process.env.KASHI_MAX_CHANGED_LINES || '60', 10);
const MAX_LOG_CHARS = 6000;
const MAX_FILE_CHARS = 6500;
const MAX_TOTAL_FILE_CHARS = 18000;
const MAX_REPO_PATHS = 700;

const RESPONSE_SCHEMA = {
  name: 'kashi_fix_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['fix', 'need_files', 'cannot_fix'] },
      summary: { type: ['string', 'null'] },
      reason: { type: ['string', 'null'] },
      need_files: { type: 'array', items: { type: 'string' } },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            find: { type: 'string' },
            replace: { type: 'string' },
          },
          required: ['path', 'find', 'replace'],
          additionalProperties: false,
        },
      },
    },
    required: ['action', 'summary', 'reason', 'need_files', 'edits'],
    additionalProperties: false,
  },
};

const FORBIDDEN_PATH = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|\.env(\..*)?|\.git\/.*|\.github\/.*|node_modules\/.*)$/i;

const SYSTEM_PROMPT = `You are Kashi's build-repair engine. A deployment build on Vercel FAILED although the project worked in preview. Your ONLY job is to make the SMALLEST possible code change that fixes the reported build error(s).

STRICT RULES
- Fix ONLY what the build log reports. Do not refactor, rename, reformat, reorder, restyle, upgrade, optimise, add features, add comments, or touch any code unrelated to the error.
- Change as few lines as possible. Prefer a one-line fix.
- Edit only files given to you under FILES. You may not create, delete or rename files. Never edit lockfiles or .env files.
- Typical causes of "works in preview, fails on Vercel": case-sensitive import paths (Linux is case-sensitive), a missing dependency in package.json, imports of files that don't exist, TypeScript/ESLint errors that fail the production build (CI=true treats warnings as errors), wrong export/import names, unescaped characters in JSX, use of browser-only APIs during server rendering, wrong relative paths, missing "use client". Use the REPO PATHS list to correct import casing/paths.
- If the failure cannot be fixed by changing code (missing environment variable, Vercel project settings, account/quota/plan limits, platform outage), respond with cannot_fix = true and a short reason. Do not guess.
- If you need to see another file to be sure, respond with need_files (max 4 paths taken from REPO PATHS) and nothing else.
- If PREVIOUS ATTEMPTS are listed, those fixes did not resolve the build; do not repeat them.

OUTPUT: ONLY a JSON object matching this structure:
{"action":"fix|need_files|cannot_fix","summary":"string or null","reason":"string or null","need_files":["path/from/repo/paths"],"edits":[{"path":"exact path from FILES","find":"exact existing text, copied verbatim, unique within the file","replace":"replacement text"}]}
Use action=fix with edits, action=need_files with up to 4 missing paths, or action=cannot_fix with a short reason. Set unused fields to null or empty arrays.

"find" must be copied character-for-character from the file (including indentation) and must occur exactly once in that file. Keep "find" as short as possible while still being unique.`;

const RUNTIME_ADDENDUM = `

MODE: RUNTIME. The Vercel build SUCCEEDED, but opening the live site in a real browser shows a black/blank screen. The "BUILD LOG" below is actually the BROWSER REPORT: uncaught exceptions and console errors captured from the deployed page. Production bundles are minified, so there are usually no file names: infer the cause from the message and the entry files you are given.
- Fix the root cause of the reported error in the source, with the smallest change. Never hide it (no empty try/catch, no swallowing the error).
- Typical causes: an undefined variable/prop/import, .map/.length/.split on possibly-undefined data, a wrong default/named import, a hook or context used outside its provider, a router or library used without its required wrapper, browser-only APIs at module load, a dependency version that is incompatible with the installed React.
- If the error comes from a missing environment variable or other configuration, respond with cannot_fix = true.
- You may edit index.html when the page has no mount node or a wrong entry script.`;

function truncate(text, max, fromEnd = false) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return fromEnd ? `…[truncated]\n${s.slice(-max)}` : `${s.slice(0, max)}\n…[truncated]`;
}

function buildUserPrompt({ errorLog, files, repoPaths, previousAttempts }) {
  let budget = MAX_TOTAL_FILE_CHARS;
  const fileBlocks = [];
  for (const file of files) {
    if (budget <= 0) break;
    const body = truncate(file.content, Math.min(MAX_FILE_CHARS, budget));
    budget -= body.length;
    fileBlocks.push(`=== FILE: ${file.path} ===\n${body}\n=== END FILE ===`);
  }
  const attempts = (previousAttempts || []).length
    ? `\nPREVIOUS ATTEMPTS (did not fix the build):\n${previousAttempts.map((a, i) => `${i + 1}. ${a.summary || 'unknown'}${a.paths?.length ? ` [${a.paths.join(', ')}]` : ''}`).join('\n')}\n`
    : '';
  return `BUILD LOG (tail):\n${truncate(errorLog, MAX_LOG_CHARS, true)}\n${attempts}\nREPO PATHS (${Math.min(repoPaths.length, MAX_REPO_PATHS)} shown):\n${repoPaths.slice(0, MAX_REPO_PATHS).join('\n')}\n\nFILES:\n${fileBlocks.join('\n\n')}`;
}

function countLines(text) {
  return String(text || '').split('\n').length;
}

/**
 * Applies and validates the model's edits against the supplied files.
 * @returns {{ok: true, files: Array<{path, content, originalContent}>, changedLines: number}
 *          | {ok: false, reason: string}}
 */
function applyEdits(edits, files) {
  if (!Array.isArray(edits) || edits.length === 0) return { ok: false, reason: 'No edits were returned.' };
  if (edits.length > MAX_EDITS) return { ok: false, reason: `Too many edits (${edits.length} > ${MAX_EDITS}); the fix must be minimal.` };

  const current = new Map(files.map((f) => [f.path, f.content]));
  const original = new Map(files.map((f) => [f.path, f.content]));
  const touched = new Set();
  let changedLines = 0;

  for (const edit of edits) {
    if (!edit || typeof edit.path !== 'string' || typeof edit.find !== 'string' || typeof edit.replace !== 'string') {
      return { ok: false, reason: 'Malformed edit.' };
    }
    if (FORBIDDEN_PATH.test(edit.path)) return { ok: false, reason: `Editing ${edit.path} is not allowed.` };
    if (!current.has(edit.path)) return { ok: false, reason: `Edit targets ${edit.path}, which was not provided.` };
    if (!edit.find.length) return { ok: false, reason: 'Empty "find" text.' };
    if (edit.find === edit.replace) return { ok: false, reason: 'An edit changes nothing.' };

    const content = current.get(edit.path);
    const first = content.indexOf(edit.find);
    if (first === -1) return { ok: false, reason: `"find" text not found in ${edit.path}.` };
    if (content.indexOf(edit.find, first + 1) !== -1) return { ok: false, reason: `"find" text is not unique in ${edit.path}.` };

    current.set(edit.path, content.slice(0, first) + edit.replace + content.slice(first + edit.find.length));
    touched.add(edit.path);
    changedLines += Math.max(countLines(edit.find), countLines(edit.replace));
  }

  if (changedLines > MAX_CHANGED_LINES) {
    return { ok: false, reason: `Change is too large (${changedLines} lines > ${MAX_CHANGED_LINES}); only the error may be fixed.` };
  }

  // package.json must stay valid JSON.
  for (const path of touched) {
    if (/(^|\/)package\.json$/.test(path)) {
      try { JSON.parse(current.get(path)); } catch { return { ok: false, reason: `Edit would make ${path} invalid JSON.` }; }
    }
  }

  return {
    ok: true,
    changedLines,
    files: Array.from(touched).map((path) => ({ path, content: current.get(path), originalContent: original.get(path) })),
  };
}

/**
 * @param {{errorLog: string, files: Array<{path,content}>, repoPaths?: string[],
 *          previousAttempts?: Array<{summary: string, paths?: string[]}>}} input
 * @returns {Promise<
 *   {status:'need_files', paths:string[]} |
 *   {status:'cannot_fix', reason:string} |
 *   {status:'fix', summary:string, files:Array, changedLines:number, model:string} |
 *   {status:'invalid', reason:string}>}
 */
async function proposeFix({ errorLog, files = [], repoPaths = [], previousAttempts = [], mode = 'build' }) {
  if (!errorLog || !String(errorLog).trim()) return { status: 'invalid', reason: 'No build log was provided.' };
  const safeFiles = files.filter((f) => f && typeof f.path === 'string' && typeof f.content === 'string' && !FORBIDDEN_PATH.test(f.path));

  let lastReason = 'The model did not return a usable fix.';
  // Up to 2 tries: if the first answer breaks our minimal-diff rules, tell the model why once.
  const messages = [
    { role: 'system', content: mode === 'runtime' ? SYSTEM_PROMPT + RUNTIME_ADDENDUM : SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt({ errorLog, files: safeFiles, repoPaths, previousAttempts }) },
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const out = await groq.chat({ tier: 'edit', json: true, jsonSchema: RESPONSE_SCHEMA, maxTokens: Number.parseInt(process.env.GROQ_EDIT_MAX_TOKENS || '1800', 10), messages });
    const parsed = out.json;
    if (!parsed || typeof parsed !== 'object') {
      lastReason = 'The model returned invalid JSON.';
      messages.push({ role: 'assistant', content: out.text || '' }, { role: 'user', content: 'That was not valid JSON. Reply with ONLY one of the allowed JSON objects.' });
      continue;
    }

    if (parsed.action === 'cannot_fix' || parsed.cannot_fix === true) return { status: 'cannot_fix', reason: String(parsed.reason || 'This error cannot be fixed by changing code.').slice(0, 400) };

    if (parsed.action === 'need_files' && Array.isArray(parsed.need_files) && parsed.need_files.length) {
      const known = new Set(repoPaths);
      const wanted = parsed.need_files.filter((p) => typeof p === 'string' && known.has(p) && !FORBIDDEN_PATH.test(p)).slice(0, 4);
      const already = new Set(safeFiles.map((f) => f.path));
      const fresh = wanted.filter((p) => !already.has(p));
      if (fresh.length) return { status: 'need_files', paths: fresh };
      lastReason = 'The model asked for files that are unavailable.';
      messages.push({ role: 'assistant', content: out.text || '' }, { role: 'user', content: 'Those files are already provided or unavailable. Propose the fix using the files you have, or reply with cannot_fix.' });
      continue;
    }

    const applied = applyEdits(parsed.action === 'fix' ? parsed.edits : parsed.edits, safeFiles);
    if (applied.ok) {
      return {
        status: 'fix',
        summary: String(parsed.summary || 'Fix build error').slice(0, 200),
        files: applied.files,
        changedLines: applied.changedLines,
        model: out.model,
      };
    }
    lastReason = applied.reason;
    messages.push(
      { role: 'assistant', content: out.text || '' },
      { role: 'user', content: `Your edits were rejected: ${applied.reason} Reply again with a corrected, minimal JSON answer.` }
    );
  }

  return { status: 'invalid', reason: lastReason };
}

module.exports = { proposeFix, applyEdits, FORBIDDEN_PATH, _limits: { MAX_EDITS, MAX_CHANGED_LINES } };
