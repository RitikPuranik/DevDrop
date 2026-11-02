const { callGemini } = require('../services/llm.service');
const { withSkillContext } = require('../skills');

const SYSTEM = `You are the Repair Agent for a generated multi-page React website. You receive detected issues, the affected files and the files they depend on or that depend on them (contextFiles). Work like an engineer: 1) analyse each error, 2) identify the affected page and files, 3) inspect dependencies, 4) determine the ROOT CAUSE, 5) fix it with the smallest sufficient change.
Do NOT regenerate the website and do not rewrite unrelated files. You may modify files shown in contextFiles and you MAY CREATE NEW FILES when a better fix needs them (for example splitting an oversized component into smaller ones, extracting a hook/service, adding a missing component or route page). When you split a file, rewrite the original to use the new files. You may list deleteFiles only for files that nothing imports any more.
Rules: JavaScript/JSX only; never remove uploaded-asset URLs; keep design tokens (CSS variables) and existing behaviour; every returned code value is the complete file; internal links must target registered routes; add a path="*" 404 route if missing; never hide a runtime error by swallowing it; declare third-party packages in dependencies.
Return JSON only: {rootCause, changes:[{path,code,reason}], newFiles:[{path,code,responsibility}], deleteFiles:[], dependencies:{}}.`;

const strip = (c) => (typeof c === 'string' ? c.trim().replace(/^```(?:javascript|jsx|js|json|css)?\s*/i, '').replace(/\s*```$/i, '').trim() : c);

function normalize(result) {
  const v = result?.value;
  if (!v || typeof v !== 'object') return result;
  const list = (x) => (Array.isArray(x) ? x : []).filter((c) => c && typeof c.path === 'string' && typeof c.code === 'string').map((c) => ({ ...c, code: strip(c.code) }));
  return { ...result, value: { rootCause: String(v.rootCause || ''), changes: list(v.changes), newFiles: list(v.newFiles), deleteFiles: (Array.isArray(v.deleteFiles) ? v.deleteFiles : []).filter((p) => typeof p === 'string'), dependencies: v.dependencies && typeof v.dependencies === 'object' ? v.dependencies : {} } };
}

async function run({ issues, affectedFiles, contextFiles, manifest, spec, tokens, dependencies, mediaManifest = [], skillContext = '', thinking }) {
  return normalize(await callGemini({ system: withSkillContext(SYSTEM, skillContext), input: { issues, affectedFiles, contextFiles, manifest, spec, designTokens: tokens, dependencies, mediaManifest }, thinking }));
}
module.exports = { run, normalize, SYSTEM };
