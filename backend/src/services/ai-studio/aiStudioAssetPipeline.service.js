const AIStudioAsset = require('../../modules/ai-studio/aiStudioAsset.model');
const storage = require('./aiStudioStorage.service');
const lifecycle = require('./aiStudioLifecycle.service');
const { assetError, classifyKind, normalizeAssetContract, idsOf } = require('./aiStudioAssetContract');

// Raw bytes (not base64) of image/video/PDF content that may be attached
// inline to a single generation request. The ai-service body limit is 15 MB
// and base64 adds ~33%, so stay well under it. Assets over budget are NOT
// dropped: they still get a signed previewUrl and appear in the manifest, they
// just aren't shown to the model as pixels (inlineStatus: 'skipped_size').
const INLINE_BUDGET_BYTES = Number.parseInt(process.env.AI_STUDIO_MEDIA_INLINE_BUDGET_BYTES || String(8 * 1024 * 1024), 10);
const MAX_EXTRACTED_TEXT_CHARS = 60000;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const log = (message, meta) => console.log(`[AI STUDIO ASSET] ${message}`, meta || '');

const emptyResult = () => ({
  assets: { resume: null, images: [], videos: [], other: [] },
  media: [],
});

function extractDocxText(buffer) {
  // DOCX is a zip; word/document.xml holds the text. Reuses adm-zip (already a
  // backend dependency) instead of adding a document-parsing package.
  const AdmZip = require('adm-zip');
  const entry = new AdmZip(buffer).getEntry('word/document.xml');
  if (!entry) throw new Error('word/document.xml not found');
  const xml = entry.getData().toString('utf8');
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Optional (non-fatal) document processing. Never throws: a document that
 * can't be read stays available as a stored asset with a clear status.
 *  - PDF  -> sent to the model natively as an inline part (no parser needed)
 *  - DOCX -> text extracted locally
 *  - TXT/MD -> decoded as UTF-8
 *  - legacy .doc / RTF / anything else -> status 'unsupported'
 */
async function processDocument(record, state) {
  const mime = String(record.mimeType || '').toLowerCase();
  const name = String(record.fileName || '').toLowerCase();
  try {
    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      if (record.size > state.remaining) return { status: 'skipped_size', error: 'Document too large to attach to the AI request; it is still available as a stored asset.' };
      const buffer = await storage.downloadAsset(record.storagePath);
      state.remaining -= buffer.length;
      state.media.push({ assetId: String(record._id), fileName: record.fileName, mimeType: 'application/pdf', data: buffer.toString('base64') });
      return { status: 'inline_pdf' };
    }
    if (mime === DOCX_MIME || name.endsWith('.docx')) {
      const text = extractDocxText(await storage.downloadAsset(record.storagePath));
      return text ? { status: 'extracted', text: text.slice(0, MAX_EXTRACTED_TEXT_CHARS), truncated: text.length > MAX_EXTRACTED_TEXT_CHARS } : { status: 'failed', error: 'Document contained no readable text.' };
    }
    if (mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
      const text = (await storage.downloadAsset(record.storagePath)).toString('utf8');
      return { status: 'extracted', text: text.slice(0, MAX_EXTRACTED_TEXT_CHARS), truncated: text.length > MAX_EXTRACTED_TEXT_CHARS };
    }
    return { status: 'unsupported', error: 'This document type cannot be read automatically; it is still available as a stored asset.' };
  } catch (error) {
    console.warn('[AI STUDIO ASSET] document extraction failed', { assetId: String(record._id), message: error.message });
    return { status: 'failed', error: 'Document extraction failed; it is still available as a stored asset.' };
  }
}

async function resolveOne(record, state, { attachMedia }) {
  const kind = classifyKind(record.mimeType, record.fileName);
  const assetId = String(record._id);
  const isDocument = kind === 'document';

  let previewUrl;
  let downloadUrl;
  try {
    previewUrl = await storage.createSignedAssetUrl(record.storagePath);
    if (isDocument) downloadUrl = await storage.createSignedAssetUrl(record.storagePath, undefined, { download: record.fileName });
  } catch (error) {
    throw assetError(502, 'Signed asset URL creation failed');
  }

  const entry = { assetId, fileName: record.fileName, mimeType: record.mimeType, size: record.size, kind, previewUrl };
  if (downloadUrl) entry.downloadUrl = downloadUrl;

  if (!attachMedia) return entry; // edit/debug: manifest only, no bytes

  if (kind === 'image' || kind === 'video') {
    if (record.size > state.remaining) {
      entry.inlineStatus = 'skipped_size';
    } else {
      let buffer;
      try {
        buffer = await storage.downloadAsset(record.storagePath);
      } catch (error) {
        throw assetError(502, 'Asset could not be read'); // critical: the site could not render it either
      }
      state.remaining -= buffer.length;
      state.media.push({ assetId, fileName: record.fileName, mimeType: record.mimeType, data: buffer.toString('base64') });
      entry.inlineStatus = 'attached';
    }
  } else if (isDocument) {
    const extraction = await processDocument(record, state); // optional: never throws
    entry.extraction = extraction;
  }
  return entry;
}

/**
 * Resolves the client's asset references into the canonical, fully-resolved
 * contract sent to the ai-service. Ownership is enforced here against the
 * database, never against what the client claims.
 *
 * @param {object}  p
 * @param {string}  p.projectId
 * @param {string}  p.userId        from auth middleware only
 * @param {*}       p.rawAssets     whatever the client sent (see normalizeAssetContract)
 * @param {boolean} p.hasExistingFiles  true for edit requests: manifest only, and all
 *                                  project assets are used when none are listed
 */
async function resolveGenerationAssets({ projectId, userId, rawAssets, hasExistingFiles = false }) {
  const contract = normalizeAssetContract(rawAssets);
  let requestedIds = idsOf(contract);
  log('normalized', { projectId: projectId ? String(projectId) : null, requested: requestedIds.length });

  if (!projectId) {
    if (requestedIds.length) throw assetError(400, 'projectId is required when assets are supplied');
    return emptyResult();
  }
  let records;
  if (requestedIds.length) {
    let project;
    try {
      project = await lifecycle.getOwnedProject(projectId, userId);
    } catch (error) {
      if (error?.name === 'CastError') throw assetError(400, 'Invalid projectId');
      throw error;
    }
    if (!project) throw assetError(404, 'Project not found');

    const found = await AIStudioAsset.find({ _id: { $in: requestedIds } }).lean();
    const byId = new Map(found.map((r) => [String(r._id), r]));
    for (const id of requestedIds) {
      const record = byId.get(id);
      if (!record) throw assetError(404, 'Asset not found');
      if (String(record.projectId) !== String(projectId) || String(record.userId) !== String(userId)) {
        throw assetError(403, 'Asset does not belong to this project');
      }
    }
    records = requestedIds.map((id) => byId.get(id));
  } else if (hasExistingFiles) {
    // Follow-up edits don't re-send assets. The server is the source of truth
    // for what this user's project owns, so edits keep their media manifest.
    try {
      records = (await AIStudioAsset.find({ projectId, userId }).lean()) || [];
    } catch (error) {
      if (error?.name === 'CastError') return emptyResult();
      throw error;
    }
    requestedIds = records.map((r) => String(r._id));
  } else {
    return emptyResult();
  }

  const state = { remaining: INLINE_BUDGET_BYTES, media: [] };
  const resumeId = contract.resume?.assetId;
  const resolved = [];
  for (const record of records) {
    resolved.push(await resolveOne(record, state, { attachMedia: !hasExistingFiles }));
  }
  log('loaded', { projectId: String(projectId), count: resolved.length, inlineMedia: state.media.length });

  const assets = { resume: null, images: [], videos: [], other: [] };
  for (const entry of resolved) {
    if (entry.assetId === resumeId && entry.kind === 'document') assets.resume = entry;
    else if (entry.kind === 'image') assets.images.push(entry);
    else if (entry.kind === 'video') assets.videos.push(entry);
    else assets.other.push(entry);
  }
  log('attached to generation', { projectId: String(projectId), images: assets.images.length, videos: assets.videos.length, documents: resolved.filter((e) => e.kind === 'document').length, other: assets.other.length });
  return { assets, media: state.media };
}

module.exports = { resolveGenerationAssets, extractDocxText, INLINE_BUDGET_BYTES };
