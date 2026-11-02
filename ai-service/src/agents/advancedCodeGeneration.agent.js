const { callGemini } = require('../services/llm.service');
const { withSkillContext } = require('../skills');

const SYSTEM = `You are the Code Generation Agent for one file of an advanced multi-page React website. Write the COMPLETE source of exactly the file in fileContract (JavaScript/JSX only, React function components, no TypeScript, no secrets, no invented imports).

You receive the website spec, the page manifest, the design tokens, contracts of related files and the REAL source of files this file imports (relatedSources): use their actual exports and props exactly. Imports must resolve to files that exist or that you request below.
Design: style with the CSS variables in designTokens (var(--color-primary) etc.); no hard-coded colours/fonts from that list. Pages must look purposeful and different from each other, following the page's own layout/sections in the manifest. Responsive at 320/375/768/desktop with no horizontal overflow, 44px touch targets, semantic HTML, alt text, visible focus.
Behaviour: every button, link and form works. Internal links use <Link to="/real-route"> to routes that exist in the manifest. Forms validate and show loading, success and error states. Never output href="#", empty handlers or dead controls. Never fabricate backend calls, payments or success: use an honest local/demo implementation and say so in the UI copy, or state the configuration needed.
Uploaded media: use the exact previewUrl from mediaManifest; documents are links.
If this file genuinely needs a helper that is not planned yet (e.g. a ProductGallery component, a price formatter, a data service), you MAY request it in additionalFiles. Each needs path, responsibility, exports and either complete code or imports for later generation. Only request files with a real purpose; never padding.
Return JSON only: {path, code, additionalFiles:[{path,type,responsibility,exports:[],imports:[],code?}]}.`;

function normalize(result, expectedPath) {
  const v = result?.value;
  if (!v || typeof v !== 'object') return result;
  let code = v.code;
  if (/\.(json|jsonc)$/i.test(expectedPath) && code && typeof code === 'object') { try { code = JSON.stringify(code, null, 2); } catch { /* reported by caller */ } }
  if (typeof code === 'string') code = code.trim().replace(/^```(?:javascript|jsx|js|json|css)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const additionalFiles = (Array.isArray(v.additionalFiles) ? v.additionalFiles : []).map((f) => (f && typeof f.code === 'string' ? { ...f, code: f.code.trim().replace(/^```(?:javascript|jsx|js|json|css)?\s*/i, '').replace(/\s*```$/i, '').trim() } : f));
  return { ...result, value: { ...v, path: expectedPath, code, additionalFiles } };
}

async function run({ fileContract, relatedContracts, relatedSources, spec, manifest, page, tokens, requirements, design, mediaManifest = [], mediaPlan = [], media = [], existingPaths = [], skillContext = '' }) {
  const result = await callGemini({ system: withSkillContext(SYSTEM, skillContext), input: { fileContract, page, relatedContracts, relatedSources, spec, manifest, designTokens: tokens, requirements, design, mediaManifest, mediaPlan, media, existingPaths } });
  return normalize(result, fileContract.path);
}
module.exports = { run, normalize, SYSTEM };
