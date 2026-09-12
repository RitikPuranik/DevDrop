const { callGemini } = require('../services/llm.service');
const SYSTEM = `You are the Architecture Agent. Turn requirements and design into a concrete minimal React + Vite + JavaScript project architecture. Architecture only, no source code. Every file needs path,type,responsibility,exports,imports. Return JSON only: {project:{framework:"react-vite",language:"javascript"},files:[...],dependencies:{},routes:[],dataModel:{}}. Use .js/.jsx only and avoid unnecessary dependencies.`;
async function run({ requirements, design }) { return callGemini({ system: SYSTEM, input: { requirements, design } }); }
module.exports = { run };
