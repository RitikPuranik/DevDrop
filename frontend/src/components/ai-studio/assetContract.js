// Canonical AI Studio asset contract sent to POST /ai-generate:
//   { resume: ref|null, images: ref[], videos: ref[], other: ref[] }
// A ref is just the identity of an already-uploaded asset. The backend
// re-resolves everything else (ownership, kind, URLs) from its own records.
const toRef = (asset) => {
  if (!asset) return null;
  const assetId = asset.assetId || asset._id || asset.id;
  if (!assetId) return null;
  return { assetId: String(assetId), fileName: asset.fileName || asset.originalName, mimeType: asset.mimeType };
};

const toRefs = (list) => (Array.isArray(list) ? list : []).map(toRef).filter(Boolean);

export function buildAssetContract({ resume = null, images = [], videos = [], other = [] } = {}) {
  return { resume: toRef(resume), images: toRefs(images), videos: toRefs(videos), other: toRefs(other) };
}
