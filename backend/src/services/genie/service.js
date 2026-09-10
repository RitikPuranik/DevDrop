const genieClient = require('./client');

/**
 * DevDrop <-> Genie adapter.
 *
 * DevDrop's AI Studio wizard collects a *structured* portfolio brief
 * (name, role, bio, skills, projects, social links, theme/style,
 * animations) — see backend/src/modules/ai/ai.validators.js. Genie's
 * `/api/generate` takes a single natural-language `prompt` plus a few
 * generation hints (targetLanguage, complexity, imageUrls). This module is
 * the "invented API contract adapter" called for in the integration spec
 * (Section 4): it never changes what the frontend sends, only how DevDrop's
 * backend translates that into a Genie-compatible request, and how it maps
 * Genie's response shape back into DevDrop's job model.
 */

// Genie's `generations.status` values (see services/genie/src/api/routes/generate.ts
// and the `generations` table) — used as-is as DevDrop's own job status so
// there's exactly one status vocabulary to keep in sync, instead of two.
const GENIE_STATUSES = ['pending', 'processing', 'completed', 'failed'];

const styleSentence = (preferences = {}) => {
  const parts = [];
  if (preferences.style) parts.push(`${preferences.style} design style`);
  if (preferences.theme && preferences.theme !== 'auto') parts.push(`${preferences.theme} theme`);
  if (preferences.animations === true) parts.push('subtle animations');
  if (preferences.animations === false) parts.push('no animations');
  return parts.length ? `Use a ${parts.join(', ')}.` : '';
};

/**
 * Builds Genie's natural-language `prompt` from DevDrop's structured
 * portfolio request. Kept deliberately deterministic (no LLM call here) so
 * generation is reproducible and easy to debug.
 */
const buildPortfolioPrompt = ({ userData = {}, preferences = {} }) => {
  const lines = [];
  lines.push(
    `Build a single-page personal portfolio website (React + TypeScript) for ${userData.name || 'the user'}, who works as a ${userData.role || 'professional'}.`
  );
  if (userData.bio) lines.push(`Bio / summary: ${userData.bio}`);
  if (Array.isArray(userData.skills) && userData.skills.length) {
    lines.push(`Skills to highlight: ${userData.skills.join(', ')}.`);
  }
  if (Array.isArray(userData.projects) && userData.projects.length) {
    lines.push('Feature these projects:');
    userData.projects.forEach((p, i) => {
      const bits = [p.title];
      if (p.description) bits.push(`- ${p.description}`);
      if (p.link) bits.push(`(link: ${p.link})`);
      lines.push(`  ${i + 1}. ${bits.join(' ')}`);
    });
  }
  const social = [];
  if (userData.socialLinks?.github) social.push(`GitHub: ${userData.socialLinks.github}`);
  if (userData.socialLinks?.linkedin) social.push(`LinkedIn: ${userData.socialLinks.linkedin}`);
  if (social.length) lines.push(`Link to: ${social.join(', ')}.`);

  const style = styleSentence(preferences);
  if (style) lines.push(style);

  lines.push('Include a hero/intro section, an about/skills section, a projects section, and a contact section.');

  return lines.join('\n');
};

/**
 * Collects asset URLs (already uploaded to Supabase by the existing
 * uploadAsset flow) to forward as Genie's `imageUrls`.
 */
const collectImageUrls = (assets = []) =>
  assets.filter((a) => a && a.url && ['profile-image', 'project-image'].includes(a.type)).map((a) => a.url);

/**
 * Starts a new Genie generation for a DevDrop portfolio request.
 * `requestPayload` is the same shape ai.controller.js already builds
 * (buildAiServicePayload output): { websiteType, userData, preferences, assets }.
 */
const startPortfolioGeneration = async (requestPayload, { ownerId } = {}) => {
  const prompt = buildPortfolioPrompt(requestPayload);
  const imageUrls = collectImageUrls(requestPayload.assets);

  const genieResponse = await genieClient.createGeneration(
    {
      prompt,
      targetLanguage: 'typescript',
      complexity: 'moderate',
      ...(imageUrls.length ? { imageUrls } : {}),
    },
    { ownerId }
  );

  // POST /api/generate returns { success, data: { id, status, message } }
  const data = genieResponse.data || {};
  return {
    genieGenerationId: data.id,
    status: data.status || 'pending',
    prompt,
  };
};

/**
 * Polls a Genie generation. Only requests full file contents when the
 * caller says it's needed (job just finished, or about to be used for a
 * follow-up chat edit) — mirrors DevDrop's existing "don't fetch files on
 * every poll" behavior from the old AI service integration.
 */
const getGenerationStatus = async (genieGenerationId, { ownerId, full = false } = {}) => {
  const genieResponse = await genieClient.getGeneration(genieGenerationId, { ownerId, full });
  const data = genieResponse.data || {};
  return {
    status: data.status,
    files: data.files || null,
    error: data.error || null,
    previewUrl: data.previewUrl || null,
    deploymentStatus: data.deploymentStatus || null,
    fileCount: data.fileCount || 0,
  };
};

/**
 * Sends an iterative modification message (Section 5 — "change the navbar
 * to dark blue"). `currentFiles` MUST be the project's current files
 * (fetched via getGenerationStatus(..., { full: true })) so Genie edits
 * the existing project instead of generating something unrelated.
 */
const sendModification = async ({ genieGenerationId, message, currentFiles, imageUrls }, { ownerId } = {}) => {
  const genieResponse = await genieClient.sendChatMessage(
    { generationId: genieGenerationId, message, currentFiles, imageUrls },
    { ownerId }
  );
  return genieResponse;
};

const isGenerationTerminal = (status) => status === 'completed' || status === 'failed';

module.exports = {
  GENIE_STATUSES,
  buildPortfolioPrompt,
  startPortfolioGeneration,
  getGenerationStatus,
  sendModification,
  isGenerationTerminal,
};
