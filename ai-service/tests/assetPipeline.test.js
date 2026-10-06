jest.mock('../src/services/llm.service', () => ({ callGemini: jest.fn() }));
jest.mock('../src/agents/requirements.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/design.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/architecture.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/codeGeneration.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/integration.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/debug.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/edit.agent', () => ({ run: jest.fn() }));
jest.mock('../src/validators/build.validator', () => ({ run: jest.fn() }));

const requirementsAgent = require('../src/agents/requirements.agent');
const designAgent = require('../src/agents/design.agent');
const architectureAgent = require('../src/agents/architecture.agent');
const codeAgent = require('../src/agents/codeGeneration.agent');
const integrationAgent = require('../src/agents/integration.agent');
const debugAgent = require('../src/agents/debug.agent');
const editAgent = require('../src/agents/edit.agent');
const buildValidator = require('../src/validators/build.validator');
const { generateWebsite, debugWebsite } = require('../src/orchestrator/websiteGeneration.orchestrator');
const { editWebsite } = require('../src/orchestrator/websiteEditing.orchestrator');
const { normalizeMediaPlan, buildMediaManifest } = require('../src/utils/assetContract');

const assets = {
  resume: { assetId: 'r1', fileName: 'resume.pdf', mimeType: 'application/pdf', size: 10, kind: 'document', previewUrl: 'https://s/r1', downloadUrl: 'https://s/r1?dl', extraction: { status: 'inline_pdf' } },
  images: [
    { assetId: 'i1', fileName: 'profile.jpg', mimeType: 'image/jpeg', size: 10, kind: 'image', previewUrl: 'https://s/i1' },
    { assetId: 'i2', fileName: 'project-1.png', mimeType: 'image/png', size: 10, kind: 'image', previewUrl: 'https://s/i2' },
  ],
  videos: [{ assetId: 'v1', fileName: 'demo.mp4', mimeType: 'video/mp4', size: 10, kind: 'video', previewUrl: 'https://s/v1' }],
  other: [{ assetId: 'd1', fileName: 'cv.docx', mimeType: 'x', size: 5, kind: 'document', previewUrl: 'https://s/d1', extraction: { status: 'extracted', text: 'Jane Doe' } }],
};
const media = [{ assetId: 'i1', fileName: 'profile.jpg', mimeType: 'image/jpeg', data: 'AAAA' }];

const requirementsValue = (extra = {}) => ({
  websiteType: 'portfolio', goal: 'g', pages: [], sections: [], contentRequirements: {}, features: [], userData: { name: 'Jane' }, constraints: [], assets: [],
  mediaPlan: [
    { assetId: 'i1', role: 'profile', purpose: 'portrait', placement: 'hero', presentation: 'circle', crop: 'center', focalPoint: 'face', aspectRatio: '1:1', prominence: 'primary', reuse: 'once' },
    { assetId: 'made-up', role: 'hero' },
  ],
  ...extra,
});
const designValue = { designSystem: { style: 's', theme: 't', colors: {}, typography: {}, spacing: 'n', borderRadius: 'm', componentStyle: 'c', layoutStrategy: 'l', responsiveStrategy: 'r', animationStrategy: 'a' } };
const archValue = { project: { framework: 'react-vite', language: 'javascript' }, files: [{ path: '/App.js', type: 'entry', responsibility: 'e', exports: ['default'], imports: [] }, { path: '/package.json', type: 'config', responsibility: 'p', exports: [], imports: [] }], dependencies: {} };

function primeAgents() {
  requirementsAgent.run.mockResolvedValue({ value: requirementsValue(), model: 't', attempt: 1 });
  designAgent.run.mockResolvedValue({ value: designValue });
  architectureAgent.run.mockResolvedValue({ value: archValue });
  codeAgent.run.mockImplementation(async ({ fileContract }) => ({ value: { path: fileContract.path, code: fileContract.path === '/package.json' ? '{"dependencies":{}}' : 'export default function App(){ return <img src="https://s/i1"/>; }' } }));
  integrationAgent.run.mockResolvedValue({ value: { files: {} } });
  buildValidator.run.mockResolvedValue({ success: true });
}

beforeEach(() => { jest.clearAllMocks(); primeAgents(); });

describe('generation pipeline carries uploaded media end to end', () => {
  test('Requirements Agent receives inline media and asset summaries (documents as text, no URLs)', async () => {
    await generateWebsite({ messages: [{ role: 'user', content: 'x' }], assets, media });
    const arg = requirementsAgent.run.mock.calls[0][0];
    expect(arg.media).toEqual(media);
    expect(arg.assetSummaries.map((a) => a.assetId).sort()).toEqual(['d1', 'i1', 'i2', 'r1', 'v1']);
    expect(arg.assetSummaries.find((a) => a.assetId === 'd1').extraction.text).toBe('Jane Doe');
    expect(arg.assetSummaries.find((a) => a.assetId === 'r1').isResume).toBe(true);
    expect(JSON.stringify(arg.assetSummaries)).not.toContain('https://');
  });

  test('Design Agent receives a normalized mediaPlan (one entry per image/video, unknown ids dropped)', async () => {
    await generateWebsite({ messages: [{ role: 'user', content: 'x' }], assets, media });
    const arg = designAgent.run.mock.calls[0][0];
    expect(Object.keys(arg)).toEqual(expect.arrayContaining(['requirements', 'mediaPlan', 'preferences', 'websiteType']));
    expect(arg.mediaPlan.map((m) => m.assetId).sort()).toEqual(['i1', 'i2', 'v1']);
    expect(arg.mediaPlan.find((m) => m.assetId === 'i1')).toMatchObject({ role: 'profile', placement: 'hero', prominence: 'primary' });
    expect(arg.mediaPlan.find((m) => m.assetId === 'v1').source).toBe('fallback'); // not invented
    expect(architectureAgent.run.mock.calls[0][0].mediaPlan).toEqual(arg.mediaPlan);
  });

  test('Code Agent gets the exact previewUrls for every file call, plus the mediaPlan', async () => {
    await generateWebsite({ messages: [{ role: 'user', content: 'x' }], assets, media });
    expect(codeAgent.run).toHaveBeenCalledTimes(2);
    for (const [arg] of codeAgent.run.mock.calls) {
      const byId = Object.fromEntries(arg.mediaManifest.map((m) => [m.assetId, m]));
      expect(byId.i1).toMatchObject({ kind: 'image', previewUrl: 'https://s/i1', fileName: 'profile.jpg', mimeType: 'image/jpeg' });
      expect(byId.v1).toMatchObject({ kind: 'video', previewUrl: 'https://s/v1' });
      expect(byId.r1).toMatchObject({ kind: 'document', previewUrl: 'https://s/r1', downloadUrl: 'https://s/r1?dl', isResume: true });
      expect(arg.mediaManifest.every((m) => !('data' in m))).toBe(true);
      expect(arg.mediaPlan).toHaveLength(3);
    }
  });

  test('no assets: pipeline runs normally with empty media plan/manifest', async () => {
    requirementsAgent.run.mockResolvedValue({ value: requirementsValue({ mediaPlan: undefined }) });
    const result = await generateWebsite({ messages: [{ role: 'user', content: 'x' }] });
    expect(Object.keys(result.files)).toEqual(expect.arrayContaining(['/App.js']));
    expect(designAgent.run.mock.calls[0][0].mediaPlan).toEqual([]);
    expect(codeAgent.run.mock.calls[0][0].mediaManifest).toEqual([]);
  });

  test('legacy array assets from an older caller are not discarded', () => {
    expect(buildMediaManifest([{ assetId: 'a', fileName: 'a.png', mimeType: 'image/png', previewUrl: 'u' }])).toHaveLength(1);
    expect(normalizeMediaPlan([], [{ assetId: 'a', mimeType: 'image/png', kind: 'image' }])).toHaveLength(1);
  });
});

describe('edit and debug keep media', () => {
  const files = { '/App.js': { code: 'export default function App(){ return <img src="https://s/i1"/>; }' }, '/Other.js': { code: 'export default function O(){ return null; }' } };

  test('edit passes the manifest to the edit agent and leaves untouched files (and their media URLs) alone', async () => {
    editAgent.run.mockResolvedValue({ value: { assistantMessage: 'ok', changes: [{ path: '/Other.js', code: 'export default function O(){ return <p>hi</p>; }' }], newFiles: [] } });
    const result = await editWebsite({ messages: [{ role: 'user', content: 'change other' }], existingFiles: files, existingDependencies: {}, assets });
    expect(editAgent.run.mock.calls[0][0].mediaManifest.find((m) => m.assetId === 'i1').previewUrl).toBe('https://s/i1');
    expect(result.files['/App.js'].code).toContain('https://s/i1');
    expect(requirementsAgent.run).not.toHaveBeenCalled(); // no full regeneration
    expect(codeAgent.run).not.toHaveBeenCalled();
  });

  test('debug-only retry passes the manifest to the debug agent and keeps existing files', async () => {
    const broken = { ...files, '/App.js': { code: 'export default function App(){ return <Missing src="https://s/i1"/>; }' } };
    debugAgent.run.mockResolvedValue({ value: { changes: [{ path: '/App.js', code: 'export default function App(){ return <img src="https://s/i1"/>; }' }] } });
    const result = await debugWebsite({ files: broken, dependencies: {}, mediaManifest: buildMediaManifest(assets) });
    expect(debugAgent.run.mock.calls[0][0].mediaManifest.length).toBe(5);
    expect(result.files['/App.js'].code).toContain('https://s/i1');
    expect(result.files['/Other.js']).toEqual(files['/Other.js']);
  });

  test('a failed generation stores the manifest in debugContext so debug-retry keeps media', async () => {
    buildValidator.run.mockResolvedValue({ success: false, errors: ['boom'] });
    debugAgent.run.mockResolvedValue({ value: { changes: [] } });
    const err = await generateWebsite({ messages: [{ role: 'user', content: 'x' }], assets, media }).catch((e) => e);
    expect(err.debugContext.mediaManifest.map((m) => m.assetId).sort()).toEqual(['d1', 'i1', 'i2', 'r1', 'v1']);
    expect(err.debugContext.mediaPlan).toHaveLength(3);
  });
});
