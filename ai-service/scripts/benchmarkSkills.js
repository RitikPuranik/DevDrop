#!/usr/bin/env node
'use strict';
// Offline, repeatable benchmark of the parts of the skill system that can be measured WITHOUT calling a model:
//   - prompt-size overhead per stage for conditions A-D
//   - design-spec validity/completeness and structural variety
//   - resolver determinism
// It does NOT measure build success, runtime success, repair attempts, latency, accessibility of generated output or
// dependency counts: those need live Gemini generations and are reported as "not run".
//   node scripts/benchmarkSkills.js [--write]
const fs = require('fs');
const path = require('path');
const skills = require('../src/skills');
const { buildDesignSpec } = require('../src/design/designIntelligence');
const { validateDesignSpec } = require('../src/design/designSpec');

const CASES = [
  ['portfolio', { websiteType: 'portfolio', requirements: { userData: { name: 'Ada' }, features: ['contact'] }, preferences: { style: 'minimal', theme: 'light' } }],
  ['saas', { websiteType: 'saas', requirements: { userData: { productName: 'Flow' }, features: ['pricing'] }, preferences: { style: 'modern', theme: 'dark' } }],
  ['restaurant', { websiteType: 'cafe', requirements: { userData: { venueName: 'Kiln' }, features: ['reservation'] }, preferences: { style: 'luxury', theme: 'warm' } }],
  ['ecommerce', { websiteType: 'ecommerce', requirements: { userData: { storeName: 'Loom' }, features: ['cart', 'filter'] }, preferences: { style: 'modern', theme: 'light' } }],
  ['dashboard (custom)', { websiteType: 'custom', requirements: { userData: { siteName: 'Ops' }, features: ['filter'] }, preferences: { style: 'corporate', theme: 'neutral' } }],
  ['blog', { websiteType: 'blog', requirements: { userData: { publicationName: 'Ledger' }, features: ['newsletter'] }, preferences: { style: 'editorial', theme: 'warm' } }],
];
const AGENTS = ['requirements', 'design', 'architecture', 'code', 'integration', 'debug', 'deployment'];
const ALL_IDS = skills.getDefaultRegistry({ reload: true, config: skills.readConfig({}) }).list().map((e) => e.id);
const OPT_IN = { AI_SKILLS_ALLOW_UNVERIFIED_LICENSES: process.env.AI_SKILLS_ALLOW_UNVERIFIED_LICENSES || 'false' };
const CONDITIONS = {
  'A baseline (no skills)': { AI_SKILLS_ENABLED: 'false' },
  'B + frontend-design only': { AI_SKILLS_DISABLED_IDS: ALL_IDS.filter((i) => i !== 'frontend-design').join(',') },
  'C + engineering skills only': { AI_SKILLS_DISABLED_IDS: ALL_IDS.filter((i) => !['react-best-practices', 'framework-compatibility', 'generated-code-safety'].includes(i)).join(',') },
  'D full skills + design intelligence': {},
};
for (const k of Object.keys(CONDITIONS)) CONDITIONS[k] = { ...OPT_IN, ...CONDITIONS[k] };
const CODE_FILES = 5; // assumed UI source files per site (config/markup/data files receive no skill text)

function measure(env, websiteType, terms) {
  const config = skills.readConfig(env);
  const session = skills.createSkillSession({ websiteType, terms, config, logger: {} });
  const perStage = {};
  for (const a of AGENTS) { const text = session.contextFor(a); perStage[a] = skills.estimateTokens(text); }
  const total = AGENTS.reduce((n, a) => n + perStage[a] * (a === 'code' ? CODE_FILES : 1), 0);
  return { perStage, total };
}

const lines = [];
const out = (s = '') => { lines.push(s); console.log(s); };
out(`# Skills benchmark (offline) - ${new Date().toISOString().slice(0, 10)}`);
out('');
out('Unverified-license skills (ui-ux-pro-max, vercel-react-best-practices) enabled: ' + (OPT_IN.AI_SKILLS_ALLOW_UNVERIFIED_LICENSES === 'true' ? 'yes' : 'no (default)') + '.');
out('');
out('Token figures are estimates (characters / 4) of the text appended to system prompts. The code stage is multiplied by ' + CODE_FILES + ' UI source files (an assumption, not a measurement). Measured with the real library; no model was called.');
out('');
out('| Case | Condition | requirements | design | architecture | code (per file) | integration | debug | deployment | total per site (est.) |');
out('|---|---|---|---|---|---|---|---|---|---|');
const totals = {};
for (const [name, c] of CASES) for (const [label, env] of Object.entries(CONDITIONS)) {
  const m = measure(env, c.websiteType, [name, ...(c.requirements.features || [])]);
  totals[label] = (totals[label] || 0) + m.total;
  out(`| ${name} | ${label} | ${AGENTS.map((a) => m.perStage[a]).join(' | ')} | ${m.total} |`);
}
out('');
out('Average estimated skill tokens added per generated site: ' + Object.entries(totals).map(([k, v]) => `${k}: ${Math.round(v / CASES.length)}`).join('; ') + '.');
out('');

out('## Design specification (condition D only)');
out('');
out('| Case | variant | composition | sections | components | valid | required fields present |');
out('|---|---|---|---|---|---|---|');
const REQUIRED = ['projectType', 'businessCategory', 'visualDirection', 'palette', 'typography', 'layout', 'components', 'interactions', 'contentRules', 'qualityRequirements'];
const shapes = new Set();
let determinism = true;
for (const [name, c] of CASES) {
  const spec = buildDesignSpec(c);
  determinism = determinism && JSON.stringify(spec) === JSON.stringify(buildDesignSpec(JSON.parse(JSON.stringify(c))));
  shapes.add(spec.layout.pageStructure.map((s) => s.component).join('>'));
  const present = REQUIRED.filter((k) => spec[k] !== undefined && spec[k] !== null).length;
  out(`| ${name} | ${spec.meta.variant} | ${spec.visualDirection.composition} | ${spec.layout.pageStructure.length} | ${spec.components.length} | ${validateDesignSpec(spec).ok ? 'yes' : 'NO'} | ${present}/${REQUIRED.length} |`);
}
out('');
out(`Distinct page structures across ${CASES.length} cases: ${shapes.size}. Spec generation deterministic: ${determinism ? 'yes' : 'NO'}.`);
const a = JSON.stringify(skills.resolveSkills(skills.getDefaultRegistry(), { agent: 'code', websiteType: 'hotel' }));
const b = JSON.stringify(skills.resolveSkills(skills.getDefaultRegistry(), { agent: 'code', websiteType: 'hotel' }));
out(`Resolver deterministic: ${a === b ? 'yes' : 'NO'}.`);
out('');
out('## Not measured (require live Gemini generations and a browser)');
out('');
for (const item of ['Build success rate', 'Runtime (Playwright) success rate', 'Visual consistency with requirements', 'Responsive behaviour of generated pages', 'Accessibility findings in generated pages', 'Number of repair attempts', 'Generation latency', 'Dependency count of generated projects', 'Real (provider-reported) token usage'])
  out(`- ${item}: not run. No claim is made that conditions B-D improve it.`);
if (process.argv.includes('--write')) fs.writeFileSync(path.join(__dirname, '..', 'docs', 'SKILLS_BENCHMARK.md'), lines.join('\n') + '\n');
