jest.mock('../../../src/modules/ai-studio/aiStudioProject.model', () => require('../../mocks/models/aiStudioProject.model.mock'));
jest.mock('../../../src/modules/ai-studio/aiStudioAsset.model', () => require('../../mocks/models/aiStudioAsset.model.mock'));
jest.mock('../../../src/services/ai-studio/aiStudioStorage.service', () => require('../../mocks/services/aiStudioStorage.service.mock'));
jest.mock('../../../src/services/ai-studio/aiStudioZip.service', () => ({ buildProjectZip: jest.fn(() => Buffer.from('zip')) }));

const AdmZip = require('adm-zip');
const AIStudioProject = require('../../../src/modules/ai-studio/aiStudioProject.model');
const AIStudioAsset = require('../../../src/modules/ai-studio/aiStudioAsset.model');
const storage = require('../../../src/services/ai-studio/aiStudioStorage.service');
const lifecycle = require('../../../src/services/ai-studio/aiStudioLifecycle.service');
const { resolveGenerationAssets } = require('../../../src/services/ai-studio/aiStudioAssetPipeline.service');
const { normalizeAssetContract, classifyKind } = require('../../../src/services/ai-studio/aiStudioAssetContract');
const realStorage = jest.requireActual('../../../src/services/ai-studio/aiStudioStorage.service');

const USER = '64b000000000000000000001';
const OTHER_USER = '64b000000000000000000002';

async function setup() {
  AIStudioProject.__reset();
  AIStudioAsset.__reset();
  const project = await lifecycle.openSession({ userId: USER, sessionId: 's1', websiteType: 'portfolio' });
  const upload = (name, mime, userId = USER, projectId = project._id) =>
    lifecycle.addAsset({ projectId, userId, buffer: Buffer.from('x'), fileName: name, mimeType: mime, size: 1 });
  return { project, upload };
}

const docxBuffer = (text) => {
  const zip = new AdmZip();
  zip.addFile('word/document.xml', Buffer.from(`<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`));
  return zip.toBuffer();
};

beforeEach(() => jest.clearAllMocks());

describe('asset contract normalization', () => {
  const ID1 = '64b0000000000000000000a1';
  const ID2 = '64b0000000000000000000a2';
  const ID3 = '64b0000000000000000000a3';

  test('frontend-style legacy object -> canonical list', () => {
    const c = normalizeAssetContract({
      profileImage: null,
      resume: { _id: ID1 },
      projectImages: [{ _id: ID2 }],
      mediaVideos: [{ assetId: ID3 }],
    });
    expect(c).toEqual({ resume: { assetId: ID1 }, images: [{ assetId: ID2 }], videos: [{ assetId: ID3 }], other: [] });
  });
  test('canonical object passes through; duplicates collapse', () => {
    const c = normalizeAssetContract({ resume: null, images: [{ assetId: ID1 }, { assetId: ID1 }], videos: [], other: [{ assetId: ID2 }] });
    expect(c.images).toHaveLength(1);
    expect(c.other).toEqual([{ assetId: ID2 }]);
  });
  test('legacy array is accepted, never silently discarded', () => {
    expect(normalizeAssetContract([{ _id: ID1 }, { id: ID2 }]).other).toHaveLength(2);
  });
  test('malformed references are rejected, not dropped', () => {
    expect(() => normalizeAssetContract({ images: [{ fileName: 'x.png' }] })).toThrow(/missing an assetId/);
    expect(() => normalizeAssetContract({ images: [{ assetId: 'nope' }] })).toThrow(/Invalid asset id/);
    expect(() => normalizeAssetContract('x')).toThrow();
  });
  test('kind is derived server-side', () => {
    expect(classifyKind('image/png', 'a.png')).toBe('image');
    expect(classifyKind('video/mp4', 'a.mp4')).toBe('video');
    expect(classifyKind('application/pdf', 'r.pdf')).toBe('document');
    expect(classifyKind('application/octet-stream', 'r.docx')).toBe('document');
    expect(classifyKind('application/zip', 'a.zip')).toBe('other');
  });
});

describe('ownership', () => {
  test('correct user + project + asset is allowed', async () => {
    const { project, upload } = await setup();
    const a = await upload('profile.jpg', 'image/jpeg');
    const r = await resolveGenerationAssets({ projectId: String(project._id), userId: USER, rawAssets: { images: [{ _id: a._id }] } });
    expect(r.assets.images[0]).toMatchObject({ assetId: String(a._id), kind: 'image', fileName: 'profile.jpg' });
    expect(r.assets.images[0].previewUrl).toMatch(/^https:\/\//);
  });
  test('wrong user is rejected', async () => {
    const { project, upload } = await setup();
    const a = await upload('profile.jpg', 'image/jpeg');
    await expect(resolveGenerationAssets({ projectId: String(project._id), userId: OTHER_USER, rawAssets: { images: [{ _id: a._id }] } }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
  test('asset from a different project is rejected', async () => {
    const { project, upload } = await setup();
    const second = await lifecycle.openSession({ userId: USER, sessionId: 's2', websiteType: 'portfolio' });
    const foreign = await upload('x.png', 'image/png', USER, second._id);
    await expect(resolveGenerationAssets({ projectId: String(project._id), userId: USER, rawAssets: { images: [{ _id: foreign._id }] } }))
      .rejects.toMatchObject({ statusCode: 403, userMessage: 'Asset does not belong to this project' });
  });
  test('unknown asset -> Asset not found; assets without projectId -> 400', async () => {
    const { project } = await setup();
    await expect(resolveGenerationAssets({ projectId: String(project._id), userId: USER, rawAssets: { images: [{ assetId: '64b0000000000000000000ff' }] } }))
      .rejects.toMatchObject({ statusCode: 404, userMessage: 'Asset not found' });
    await expect(resolveGenerationAssets({ userId: USER, rawAssets: { images: [{ assetId: '64b0000000000000000000ff' }] } }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('multimodal handoff', () => {
  test('image, video, PDF resume and DOCX are all handed over with metadata', async () => {
    const { project, upload } = await setup();
    const img = await upload('profile.jpg', 'image/jpeg');
    const vid = await upload('demo.mp4', 'video/mp4');
    const pdf = await upload('resume.pdf', 'application/pdf');
    const docx = await upload('cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    storage.downloadAsset.mockImplementation(async (path) => (path.endsWith('cv.docx') ? docxBuffer('Jane Doe, Engineer') : Buffer.from('bytes')));

    const r = await resolveGenerationAssets({
      projectId: String(project._id), userId: USER,
      rawAssets: { resume: { _id: pdf._id }, images: [{ _id: img._id }], videos: [{ _id: vid._id }], other: [{ _id: docx._id }] },
    });

    expect(r.assets.resume).toMatchObject({ kind: 'document', extraction: { status: 'inline_pdf' } });
    expect(r.assets.resume.downloadUrl).toContain('download');
    expect(r.assets.images[0]).toMatchObject({ kind: 'image', mimeType: 'image/jpeg', size: 1, inlineStatus: 'attached' });
    expect(r.assets.videos[0]).toMatchObject({ kind: 'video', mimeType: 'video/mp4' });
    expect(r.assets.other[0].extraction).toMatchObject({ status: 'extracted', text: 'Jane Doe, Engineer' });
    // bytes travel once, in `media`, never inside the asset entries
    expect(JSON.stringify(r.assets)).not.toContain(Buffer.from('bytes').toString('base64'));
    expect(r.media.map((m) => m.assetId).sort()).toEqual([String(img._id), String(vid._id), String(pdf._id)].sort());
    expect(r.media.every((m) => m.data && m.mimeType && m.fileName)).toBe(true);
  });
  test('document extraction failure is non-fatal and the file stays a stored asset', async () => {
    const { project, upload } = await setup();
    const doc = await upload('old.doc', 'application/msword');
    const bad = await upload('broken.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    storage.downloadAsset.mockResolvedValue(Buffer.from('not a zip'));
    const r = await resolveGenerationAssets({ projectId: String(project._id), userId: USER, rawAssets: { other: [{ _id: doc._id }, { _id: bad._id }] } });
    expect(r.assets.other.map((a) => a.extraction.status)).toEqual(['unsupported', 'failed']);
    expect(r.assets.other.every((a) => a.previewUrl)).toBe(true);
  });
  test('critical failures surface: unreadable image, signed URL failure', async () => {
    const { project, upload } = await setup();
    const img = await upload('a.png', 'image/png');
    const raw = { images: [{ _id: img._id }] };
    storage.downloadAsset.mockRejectedValueOnce(new Error('boom'));
    await expect(resolveGenerationAssets({ projectId: String(project._id), userId: USER, rawAssets: raw })).rejects.toMatchObject({ userMessage: 'Asset could not be read' });
    storage.createSignedAssetUrl.mockRejectedValueOnce(new Error('boom'));
    await expect(resolveGenerationAssets({ projectId: String(project._id), userId: USER, rawAssets: raw })).rejects.toMatchObject({ userMessage: 'Signed asset URL creation failed' });
  });
  test('over-budget media is kept in the manifest but not attached inline', async () => {
    const { project } = await setup();
    const big = await lifecycle.addAsset({ projectId: project._id, userId: USER, buffer: Buffer.from('x'), fileName: 'big.mp4', mimeType: 'video/mp4', size: 50 * 1024 * 1024 });
    const r = await resolveGenerationAssets({ projectId: String(project._id), userId: USER, rawAssets: { videos: [{ _id: big._id }] } });
    expect(r.media).toHaveLength(0);
    expect(r.assets.videos[0]).toMatchObject({ inlineStatus: 'skipped_size' });
    expect(r.assets.videos[0].previewUrl).toBeDefined();
  });
});

describe('no assets / edits', () => {
  test('no assets -> empty canonical result, no storage access', async () => {
    const { project } = await setup();
    const r = await resolveGenerationAssets({ projectId: String(project._id), userId: USER, rawAssets: undefined });
    expect(r).toEqual({ assets: { resume: null, images: [], videos: [], other: [] }, media: [] });
    expect(storage.downloadAsset).not.toHaveBeenCalled();
    expect(await resolveGenerationAssets({ userId: USER })).toEqual(r);
  });
  test('edit without re-sent assets keeps the project manifest (no bytes, no duplicate records)', async () => {
    const { project, upload } = await setup();
    const img = await upload('profile.jpg', 'image/jpeg');
    const before = (await AIStudioAsset.find({ projectId: project._id })).length;
    const r = await resolveGenerationAssets({ projectId: String(project._id), userId: USER, rawAssets: undefined, hasExistingFiles: true });
    expect(r.assets.images.map((a) => a.assetId)).toEqual([String(img._id)]);
    expect(r.media).toHaveLength(0);
    expect(storage.downloadAsset).not.toHaveBeenCalled();
    expect((await AIStudioAsset.find({ projectId: project._id })).length).toBe(before);
  });
  test("edit fallback never returns another user's assets", async () => {
    const { project, upload } = await setup();
    await upload('profile.jpg', 'image/jpeg');
    const r = await resolveGenerationAssets({ projectId: String(project._id), userId: OTHER_USER, rawAssets: undefined, hasExistingFiles: true });
    expect(r.assets.images).toHaveLength(0);
  });
});

describe('persistence and filename collisions', () => {
  test('syncGeneratedFiles keeps assets associated with the project', async () => {
    const { project, upload } = await setup();
    await upload('profile.jpg', 'image/jpeg');
    await lifecycle.syncGeneratedFiles({ projectId: project._id, userId: USER, files: { '/App.js': { code: 'x' } }, dependencies: {}, title: 'T' });
    await lifecycle.syncGeneratedFiles({ projectId: project._id, userId: USER, files: { '/App.js': { code: 'y' } }, dependencies: {}, title: 'T' });
    expect(await AIStudioAsset.find({ projectId: project._id })).toHaveLength(1);
  });
  test('two uploads with the same file name get distinct storage paths and records', async () => {
    const { project, upload } = await setup();
    const a = await upload('photo.png', 'image/png');
    const b = await upload('photo.png', 'image/png');
    expect(a.storagePath).not.toBe(b.storagePath);
    expect(a.storagePath).toContain(String(a._id));
    expect(b.storagePath).toContain(String(b._id));
    expect(await AIStudioAsset.find({ projectId: project._id })).toHaveLength(2);
  });
  test('real asset path is unique per asset id and cannot escape its folder', () => {
    const p1 = realStorage.assetPathFor('p', 'a1', 'photo.png');
    const p2 = realStorage.assetPathFor('p', 'a2', 'photo.png');
    expect(p1).not.toBe(p2);
    expect(realStorage.assetPathFor('p', 'a1', '../../evil name?.png')).toBe('ai-studio/p/assets/a1/evil_name_.png');
  });
});
