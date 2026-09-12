const { callGemini } = require('../services/llm.service');

const SYSTEM = `You are the Code Generation Agent. Generate exactly one complete JavaScript/JSX source file from its architecture contract. Return JSON only: {path,code}. Generate no other files. React functional components only, no TypeScript, no invented imports/components, no secrets. Preserve user content exactly. Imports must match the supplied related file contracts. Use Tailwind-compatible class names without requiring extra packages unless the architecture explicitly declares them.`;

async function run({ fileContract, relatedContracts, requirements, design, userData }) {
  return callGemini({ system: SYSTEM, input: { fileContract, relatedContracts, requirements, design, userData } });
}
module.exports = { run };
