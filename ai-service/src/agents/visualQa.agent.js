const { callGemini } = require('../services/llm.service');
const { withSkillContext } = require('../skills');

const SYSTEM = `You are the Visual QA reviewer. You are shown real screenshots of the built website (each preceded by a label with page id and viewport). Judge typography, spacing, layout, image selection, component consistency and page-specific visual quality against the spec. Report only REAL, visible problems (clipped or overlapping content, unreadable contrast, broken or irrelevant images, empty areas, inconsistent components, pages that look identical). Do not nitpick taste. Return JSON only: {"issues":[{"pageId","viewport","severity":"high|medium|low","category":"typography|spacing|layout|image|consistency|contrast","message","likelyFiles":[]}]}. Return {"issues":[]} when the site looks professional.`;

async function run({ spec, manifest, screenshots, skillContext = '', thinking }) {
  return callGemini({ system: withSkillContext(SYSTEM, skillContext), input: { spec, pages: manifest.pages.map((p) => ({ id: p.id, title: p.title, path: p.path, purpose: p.purpose })), media: screenshots }, thinking });
}
module.exports = { run, SYSTEM };
