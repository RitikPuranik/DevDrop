const { callGemini } = require('../services/llm.service');
const SYSTEM = `You are the Integration Agent. Verify a generated React project against its requirements, design and architecture. Repair only files implicated by the supplied integration errors. Return JSON only: {files:{"/path.js":{code:"complete source"}},changes:[{path,reason}],integrationStatus:"valid"|"repaired"}. Do not rewrite valid files unnecessarily. Never invent user data. Never use TypeScript.`;
async function run({ requirements, design, architecture, files, errors = [] }) { return callGemini({ system: SYSTEM, input: { requirements, design, architecture, files, errors } }); }
module.exports = { run };
