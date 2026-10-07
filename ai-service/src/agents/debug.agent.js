const { callGemini } = require('../services/llm.service');

const SYSTEM = `You are the Debug Agent. Fix only deterministic validation/build failures. Return JSON only: {changes:[{path,code,reason}]}. Use the exact error and affected files. Preserve design, content and functionality. Never remove, rewrite or replace uploaded-asset URLs already present in the files; mediaManifest lists the exact URLs. Do not rewrite unrelated application files. An error that starts with "RUNTIME ERROR" means the project compiled but crashed or rendered nothing when opened in a browser (blank/black screen): fix the actual cause in the source (an undefined variable or prop, calling .map/.length/.split on possibly-undefined data, a missing or wrong import/export, a hook used outside its provider, reading process.env or import.meta.env values that do not exist, a library that is incompatible with the installed React version -- replace it with plain React/CSS or a compatible version), never by hiding the error. JavaScript/JSX only, no TypeScript. When the validator says "TypeScript syntax is not allowed", aggressively remove TypeScript-only syntax from the affected file: interfaces, type aliases, enum declarations, generic type parameters, as Type casts, satisfies Type, access modifiers, readonly, typed variables, typed function parameters, typed React props, non-null assertions, and type-only imports. Keep the equivalent JavaScript behavior and JSX intact. Do not merely add comments or suppress the validator. Every returned code value must be complete source for that file. If the error is a build/tooling configuration problem rather than a content bug (for example the bundler failing to parse otherwise-valid JSX, a missing script, or a wrong dependency version), add or replace a project config file such as /vite.config.js or /package.json instead of editing application files -- these are not unrelated files in that case, they are the fix.`;

function stripFence(code) {
  if (typeof code !== 'string') return code;
  return code
    .trim()
    .replace(/^```(?:javascript|jsx|js|json|jsonc)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function normalizeChanges(result) {
  const value = result?.value;
  if (!value || typeof value !== 'object' || !Array.isArray(value.changes)) return result;

  const changes = value.changes
    .filter((change) => change && typeof change === 'object')
    .map((change) => {
      let path = typeof change.path === 'string' ? change.path.trim() : change.path;
      if (typeof path === 'string' && path && !path.startsWith('/')) path = `/${path}`;
      return { ...change, path, code: stripFence(change.code) };
    })
    .filter((change) => typeof change.path === 'string' && change.path && typeof change.code === 'string');

  return { ...result, value: { ...value, changes } };
}

async function run({ errors, affectedFiles, files, architecture, requirements, design, dependencies, buildOutput, mediaManifest = [] }) {
  const result = await callGemini({ system: SYSTEM, input: { errors, affectedFiles, files, architecture, requirements, design, dependencies, buildOutput, mediaManifest } });
  return normalizeChanges(result);
}

module.exports = { run };
