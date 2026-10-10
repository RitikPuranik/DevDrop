const { callGemini } = require('../services/llm.service');
const { normalizeChanges } = require('./debug.agent');

const SYSTEM = `You are the Deployment Readiness Agent. The generated React + Vite website already builds and passes a browser smoke test, and it looks right in DevDrop's sandbox preview. Your only job is to remove things that work in that preview but break on a real Vercel deployment.

You receive findings produced by a deterministic scanner (each has id, path, line, message) plus the affected files. Typical causes:
- process-env / import-meta-env: reading environment variables that do not exist on the deployed site. Replace the usage with a literal or a safe in-code default. Never invent secrets or keys.
- localhost-url: a fetch/img/link to a local address. Remove the network call and render from static in-file data, keeping the same UI and content.
- missing-asset: a filename or /public path (for an image, video, pdf, ...) that is not part of the project. If a mediaManifest entry fits, use its exact previewUrl/downloadUrl; otherwise replace it with an inline SVG, a CSS gradient or a neutral placeholder block. Never reference a file that is not in the project.

Rules:
- Make the smallest change that resolves each finding; preserve design, copy, layout and behaviour.
- Never remove, rewrite or shorten asset:// references or real uploaded-asset URLs that are already in the code.
- JavaScript/JSX only, no TypeScript. Do not add new dependencies.
- Only edit files named in the findings unless a finding cannot be fixed without touching one directly related file.
- Every returned code value must be the COMPLETE new source of that file.
- If a finding is a false positive (for example the match is inside a comment or a string shown to the user), return no change for it.
Return JSON only: {"changes":[{"path":"/File.js","code":"<complete file>","reason":"<short>"}]}. Return {"changes":[]} when nothing needs to change.`;

async function run({ findings, files, mediaManifest = [], dependencies = {} }) {
  const result = await callGemini({ system: SYSTEM, input: { findings, files, mediaManifest, dependencies } });
  return normalizeChanges(result);
}

module.exports = { run, SYSTEM };
