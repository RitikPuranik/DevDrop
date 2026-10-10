const mongoose = require('mongoose');

/**
 * Canonical AI Studio asset contract (used by frontend -> backend -> ai-service):
 *
 *   {
 *     resume: AssetRef | null,
 *     images: AssetRef[],
 *     videos: AssetRef[],
 *     other:  AssetRef[],
 *   }
 *
 * On the way IN (client -> backend) an AssetRef only needs `assetId`; the
 * backend never trusts any other client-supplied field (kind, url, owner).
 * On the way OUT (backend -> ai-service) every entry is fully resolved:
 *   { assetId, fileName, mimeType, size, kind, previewUrl, downloadUrl?, extraction? }
 */

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'text/plain',
  'text/markdown',
]);
const DOCUMENT_EXTENSION = /\.(pdf|docx?|rtf|txt|md)$/i;

function assetError(statusCode, userMessage) {
  const err = new Error(userMessage);
  err.statusCode = statusCode;
  err.userMessage = userMessage;
  return err;
}

/** Server-side kind detection. The client-supplied `kind` is never trusted. */
function classifyKind(mimeType = '', fileName = '') {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (DOCUMENT_MIME_TYPES.has(mime)) return 'document';
  if ((!mime || mime === 'application/octet-stream') && DOCUMENT_EXTENSION.test(String(fileName || ''))) return 'document';
  return 'other';
}

function idOf(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') return entry;
  return entry.assetId || entry._id || entry.id || null;
}

function toRef(entry, slot) {
  if (entry == null) return null; // e.g. `profileImage: null`
  const id = idOf(entry);
  if (!id) throw assetError(400, `Asset reference in "${slot}" is missing an assetId`);
  const assetId = String(id);
  if (!mongoose.isValidObjectId(assetId)) throw assetError(400, `Invalid asset id in "${slot}"`);
  return { assetId };
}

const asList = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

/**
 * Converts whatever the client sent into the canonical id-only contract.
 * Accepted (for backwards compatibility only):
 *   - canonical: { resume, images, videos, other }
 *   - legacy object: { profileImage, resume, projectImages, mediaVideos }
 *   - legacy array of asset objects/ids
 * Duplicate ids are collapsed. Anything malformed throws a 400 instead of
 * being silently dropped.
 */
function normalizeAssetContract(raw) {
  const out = { resume: null, images: [], videos: [], other: [] };
  if (raw == null) return out;
  if (typeof raw !== 'object') throw assetError(400, 'assets must be an object');

  const seen = new Set();
  const push = (list, entry, slot) => {
    const ref = toRef(entry, slot);
    if (!ref || seen.has(ref.assetId)) return;
    seen.add(ref.assetId);
    list.push(ref);
  };

  if (Array.isArray(raw)) {
    raw.forEach((entry) => push(out.other, entry, 'assets'));
    return out;
  }

  const resume = toRef(raw.resume, 'resume');
  if (resume) {
    seen.add(resume.assetId);
    out.resume = resume;
  }
  asList(raw.images).forEach((e) => push(out.images, e, 'images'));
  asList(raw.profileImage).forEach((e) => push(out.images, e, 'profileImage'));
  asList(raw.projectImages).forEach((e) => push(out.images, e, 'projectImages'));
  asList(raw.videos).forEach((e) => push(out.videos, e, 'videos'));
  asList(raw.mediaVideos).forEach((e) => push(out.videos, e, 'mediaVideos'));
  asList(raw.other).forEach((e) => push(out.other, e, 'other'));
  asList(raw.documents).forEach((e) => push(out.other, e, 'documents'));
  return out;
}

const idsOf = (contract) => [
  ...(contract.resume ? [contract.resume.assetId] : []),
  ...contract.images.map((a) => a.assetId),
  ...contract.videos.map((a) => a.assetId),
  ...contract.other.map((a) => a.assetId),
];

/** Collapses a canonical contract into a flat list of fully-resolved entries. */
function flattenAssets(contract) {
  return [
    ...(contract?.resume ? [contract.resume] : []),
    ...(contract?.images || []),
    ...(contract?.videos || []),
    ...(contract?.other || []),
  ];
}

module.exports = { assetError, classifyKind, normalizeAssetContract, idsOf, flattenAssets, DOCUMENT_EXTENSION };
