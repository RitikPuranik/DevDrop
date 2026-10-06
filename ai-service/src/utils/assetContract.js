// Canonical AI Studio asset contract on the ai-service side. The backend sends
//   assets = { resume, images, videos, other }   (fully resolved entries)
//   media  = [{ assetId, fileName, mimeType, data }]  (inline bytes for the model only)
// Everything downstream (requirements, design, architecture, code, edit, debug)
// derives what it needs from these two via the helpers below, so there is one
// representation of an asset across the whole pipeline.

const MEDIA_KINDS = new Set(['image', 'video']);

function kindOf(entry) {
  if (entry?.kind) return entry.kind;
  const mime = String(entry?.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf' || /word|text\//.test(mime)) return 'document';
  return 'other';
}

/** Accepts the canonical object (or, defensively, a flat array) and returns the canonical object. */
function normalizeAssets(raw) {
  const out = { resume: null, images: [], videos: [], other: [] };
  if (!raw || typeof raw !== 'object') return out;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry?.assetId) continue;
      const kind = kindOf(entry);
      (kind === 'image' ? out.images : kind === 'video' ? out.videos : out.other).push({ ...entry, kind });
    }
    return out;
  }
  out.resume = raw.resume?.assetId ? { ...raw.resume, kind: kindOf(raw.resume) } : null;
  for (const slot of ['images', 'videos', 'other']) {
    out[slot] = (Array.isArray(raw[slot]) ? raw[slot] : []).filter((e) => e?.assetId).map((e) => ({ ...e, kind: kindOf(e) }));
  }
  return out;
}

const flattenAssets = (assets) => {
  const a = normalizeAssets(assets);
  return [...(a.resume ? [a.resume] : []), ...a.images, ...a.videos, ...a.other];
};

/** What code generation / edit / debug need: exact URLs, no extracted text, no bytes. */
function buildMediaManifest(assets) {
  return flattenAssets(assets).map((e) => {
    const item = { assetId: e.assetId, fileName: e.fileName, mimeType: e.mimeType, kind: e.kind, previewUrl: e.previewUrl };
    if (e.downloadUrl) item.downloadUrl = e.downloadUrl;
    if (assets?.resume?.assetId === e.assetId) item.isResume = true;
    return item;
  }).filter((item) => item.previewUrl);
}

/** What the requirements agent needs: metadata + extracted document text, but no URLs. */
function buildAssetSummaries(assets) {
  const resumeId = normalizeAssets(assets).resume?.assetId;
  return flattenAssets(assets).map((e) => ({
    assetId: e.assetId, fileName: e.fileName, mimeType: e.mimeType, kind: e.kind, size: e.size,
    ...(e.assetId === resumeId ? { isResume: true } : {}),
    ...(e.inlineStatus ? { inlineStatus: e.inlineStatus } : {}),
    ...(e.extraction ? { extraction: e.extraction } : {}),
  }));
}

/**
 * Guarantees exactly one mediaPlan entry per uploaded image/video, keyed by a
 * real assetId. Entries the model made up (unknown ids) are dropped; assets it
 * skipped get a neutral entry rather than invented observations.
 */
function normalizeMediaPlan(mediaPlan, assets) {
  const media = flattenAssets(assets).filter((e) => MEDIA_KINDS.has(e.kind));
  const byId = new Map();
  for (const item of Array.isArray(mediaPlan) ? mediaPlan : []) {
    if (item && typeof item === 'object' && item.assetId && !byId.has(String(item.assetId))) byId.set(String(item.assetId), item);
  }
  return media.map((asset) => {
    const planned = byId.get(String(asset.assetId));
    if (planned) return { ...planned, assetId: asset.assetId, fileName: asset.fileName, kind: asset.kind };
    return {
      assetId: asset.assetId, fileName: asset.fileName, kind: asset.kind,
      role: 'supporting', purpose: null, placement: null, presentation: 'inline',
      crop: null, focalPoint: null, aspectRatio: null, prominence: 'secondary', reuse: 'once',
      source: 'fallback',
    };
  });
}

module.exports = { normalizeAssets, flattenAssets, buildMediaManifest, buildAssetSummaries, normalizeMediaPlan };
