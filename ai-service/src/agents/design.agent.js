const { callGemini } = require('../services/llm.service');
const SYSTEM = `You are the Design Agent. Convert the requirements into one coherent visual design system. Do not generate React/application code and do not invent user data. Return JSON only: {designSystem:{style,theme,colors:{background,surface,primary,secondary,text,muted},typography:{heading,body},spacing,borderRadius,componentStyle,layoutStrategy,responsiveStrategy,animationStrategy}}. Use React/Vite/Tailwind-compatible concepts.`;
async function run({ requirements, preferences, websiteType }) { return callGemini({ system: SYSTEM, input: { requirements, preferences: preferences || {}, websiteType } }); }
module.exports = { run };
