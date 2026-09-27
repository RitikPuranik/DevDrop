const { callGemini } = require('../services/llm.service');

const SYSTEM = `You are the Requirements + Media Understanding Agent in a multi-stage website generator. Normalize only the supplied website request. Do not write code or styling. Do not invent personal facts. Preserve supplied values. Missing optional values stay absent.

You receive uploaded media as actual multimodal inputs when available. YOU MUST INSPECT EACH UPLOADED IMAGE AND VIDEO, not merely read its filename. For every asset, determine:
- what is visibly/audibly useful about it and its likely subject/purpose
- whether it is a portrait, project screenshot, product photo, logo/brand asset, background, decorative visual, demonstration, reel, showcase video, etc.
- the strongest place to use it in the requested website
- recommended presentation: hero, profile/about, project card/detail, gallery, background, section visual, video showcase, inline media, CTA support, or omit
- crop/aspect-ratio guidance, focal point, approximate visual hierarchy, and whether it should be prominent or secondary
- for video, whether it works best as hero/background, project demo, case-study media, gallery item, or inline showcase; never invent facts about what happens in a video beyond what can be observed
- whether the asset should be reused in multiple places or used once
- an assetId/fileName mapping so downstream agents can use the correct asset.

Return JSON only with websiteType, goal, targetAudience, pages, sections, contentRequirements, features, userData, constraints, assets, and mediaPlan. mediaPlan must be an array containing one entry for every uploaded media asset. Do not create a generic media-gallery page merely because assets exist. Treat media as design material that should strengthen the information hierarchy.`;

async function run(input) {
  const result = await callGemini({ system: SYSTEM, input: {
    websiteType: input.websiteType || 'portfolio',
    userData: input.userData || {}, preferences: input.preferences || {},
    assets: input.assets || [], conversation: input.conversation || [],
  }});
  return result;
}
module.exports = { run };
