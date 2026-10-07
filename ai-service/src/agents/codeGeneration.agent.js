const { callGemini } = require('../services/llm.service');

const SYSTEM = `You are the Code Generation Agent. Generate exactly one complete JavaScript/JSX source file from its architecture contract. Use the supplied mediaPlan as a concrete implementation guide. When uploaded media exists, place each asset in the role selected by the media plan instead of dumping all assets into a generic gallery. Preserve the intended visual hierarchy, focal point, crop, aspect ratio, and video behavior. Never substitute a stock image when a user asset is available for that role. Each mediaManifest asset includes a previewUrl (a short asset:// reference that the system replaces with the real signed URL after generation: copy it character-for-character, never shorten it, never build or guess a URL, and never add query strings to it). When implementing an uploaded image/video, use that exact previewUrl as the source/poster and do not replace it with a stock URL or a filename-only path. For a personal portrait, prefer the planned hero/about/profile role; for a demonstration video, prefer the planned hero/project/case-study/video role rather than automatically creating a gallery page. The generated website must be genuinely responsive at 320px, 375px, 430px, 768px and desktop widths: never use fixed page widths that cause horizontal overflow, use flexible grids/flex layouts, fluid type (clamp where appropriate), images/videos with max-width:100% and height:auto, wrap or collapse navigation for small screens, stack multi-column sections when space is tight, and keep controls comfortably tappable (about 44px minimum hit areas) while preserving the visual style. Documents in mediaManifest (kind "document", e.g. the resume with isResume) are links, not media: for View Resume use <a href={previewUrl} target="_blank" rel="noreferrer"> and for Download Resume use <a href={downloadUrl} download> with the exact manifest URLs. Only render resume actions when a resume exists in mediaManifest. Never embed storage keys or credentials, and never use /public or filename-only paths for uploaded assets. If an image labelled STYLE REFERENCE IMAGE is attached, the finished UI must look like that image: copy its surface treatment, shadows/highlights, radius, color usage, button and card shapes, typography feel and decorative elements (use design.designSystem as the written spec of the same look), while using the real content. Return JSON only: {path,code}. Generate no other files. React functional components only, no TypeScript, no invented imports/components, no secrets. Preserve user content exactly. Imports must match the supplied related file contracts. Use Tailwind-compatible class names without requiring extra packages unless the architecture explicitly declares them. When the target path is a JSON file (for example package.json), "code" must be that JSON serialized as a single escaped string value, never a nested JSON object.`;

// The architecture contract owns the destination path. Models sometimes
// return `src/main.jsx`, a different-but-plausible filename, or a stale path
// from a related contract. Never let that formatting mistake change which
// file the orchestrator is writing. The model controls only the source code.
function normalize(result, expectedPath) {
  const value = result?.value;
  if (!value || typeof value !== 'object') return result;

  let code = value.code;
  const isJsonTarget = /\.(json|jsonc)$/i.test(expectedPath);

  if (isJsonTarget && code !== null && typeof code === 'object') {
    try {
      code = JSON.stringify(code, null, 2);
    } catch {
      // Leave it as-is so the orchestrator can report a precise contract error.
    }
  }

  if (typeof code === 'string') {
    code = code.trim();
    // Gemini occasionally wraps source in a markdown fence despite the JSON
    // response contract. Removing only an outer fence is deterministic and
    // does not alter the user's code.
    code = code.replace(/^```(?:javascript|jsx|js|json|jsonc)?\s*/i, '');
    code = code.replace(/\s*```$/i, '').trim();
  }

  return { ...result, value: { ...value, path: expectedPath, code } };
}

async function run({ fileContract, relatedContracts, requirements, design, userData, mediaManifest = [], mediaPlan = [], media = [] }) {
  const result = await callGemini({ system: SYSTEM, input: { fileContract, relatedContracts, requirements, design, userData, mediaManifest, mediaPlan, media } });
  return normalize(result, fileContract.path);
}
module.exports = { run };
