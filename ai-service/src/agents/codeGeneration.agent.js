const { callGemini } = require('../services/llm.service');

const SYSTEM = `You are the Code Generation Agent. Generate exactly one complete JavaScript/JSX source file from its architecture contract. Use the supplied mediaPlan as a concrete implementation guide. When uploaded media exists, place each asset in the role selected by the media plan instead of dumping all assets into a generic gallery. Preserve the intended visual hierarchy, focal point, crop, aspect ratio, and video behavior. Never substitute a stock image when a user asset is available for that role. Return JSON only: {path,code}. Generate no other files. React functional components only, no TypeScript, no invented imports/components, no secrets. Preserve user content exactly. Imports must match the supplied related file contracts. Use Tailwind-compatible class names without requiring extra packages unless the architecture explicitly declares them. When the target path is a JSON file (for example package.json), "code" must be that JSON serialized as a single escaped string value, never a nested JSON object.`;

// Gemini generally follows the {path, code} contract, but for JSON targets
// like /package.json it occasionally "helpfully" emits `code` as a real
// nested object instead of a JSON-encoded string, and it can echo `path`
// without the leading slash. Both are the model failing to format an
// otherwise-correct answer rather than a different file being generated, so
// we repair them here instead of failing the whole multi-agent run. Anything
// we can't confidently repair (a genuinely different path, a non-string,
// non-object code value) is left as-is so the orchestrator's
// {path, code:string} check still catches it.
function normalize(result, expectedPath) {
  const value = result?.value;
  if (!value || typeof value !== 'object') return result;

  let { path, code } = value;

  if (code !== null && typeof code === 'object') {
    try {
      code = JSON.stringify(code, null, 2);
    } catch {
      // Leave code as-is; the orchestrator's typeof check will surface this.
    }
  }

  if (typeof path === 'string') {
    const trimmed = path.trim();
    if (trimmed === expectedPath || `/${trimmed}` === expectedPath) path = expectedPath;
  }

  return { ...result, value: { ...value, path, code } };
}

async function run({ fileContract, relatedContracts, requirements, design, userData, media = [] }) {
  const result = await callGemini({ system: SYSTEM, input: { fileContract, relatedContracts, requirements, design, userData, media } });
  return normalize(result, fileContract.path);
}
module.exports = { run };
