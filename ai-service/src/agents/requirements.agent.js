const { callGemini } = require('../services/llm.service');

const SYSTEM = `You are the Requirements Agent in a multi-stage website generator. Normalize only the supplied website request. Do not write code or styling. Do not invent personal facts. Preserve supplied values. Missing optional values stay absent. Return JSON only with websiteType, goal, targetAudience, pages, sections, contentRequirements, features, userData, constraints, assets.`;

async function run(input) {
  const result = await callGemini({ system: SYSTEM, input: {
    websiteType: input.websiteType || 'portfolio',
    userData: input.userData || {}, preferences: input.preferences || {},
    assets: input.assets || [], conversation: input.conversation || [],
  }});
  return result;
}
module.exports = { run };
