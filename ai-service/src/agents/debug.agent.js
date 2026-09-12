const { callGemini } = require('../services/llm.service');
const SYSTEM = `You are the Debug Agent. Fix only deterministic validation/build failures. Return JSON only: {changes:[{path,code,reason}]}. Use the exact error and affected files. Preserve design, content and functionality. Do not rewrite unrelated files. JavaScript/JSX only, no TypeScript. Every returned code value must be complete source for that file.`;
async function run({ errors, affectedFiles, files, architecture, requirements, design, dependencies, buildOutput }) { return callGemini({ system: SYSTEM, input: { errors, affectedFiles, files, architecture, requirements, design, dependencies, buildOutput } }); }
module.exports = { run };
