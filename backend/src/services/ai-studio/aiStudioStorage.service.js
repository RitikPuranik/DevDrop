const { aiStudioSupabase, AI_STUDIO_SUPABASE_BUCKET } = require('../../shared/config/aiStudioSupabase');

const storagePrefixFor = (projectId) => `ai-studio/${projectId}`;
const zipPathFor = (projectId) => `${storagePrefixFor(projectId)}/project.zip`;
// Strips directory components and anything outside a conservative charset so a
// hostile or odd file name can never escape the asset folder.
const sanitizeFileName = (fileName) => {
  const base = String(fileName || 'file').split(/[\\/]/).pop().normalize('NFKD');
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120);
  return cleaned || 'file';
};
// One folder per asset id, so two uploads with the same file name can never
// overwrite each other. Existing records keep the storagePath saved on them.
const assetPathFor = (projectId, assetId, fileName) =>
  `${storagePrefixFor(projectId)}/assets/${assetId}/${sanitizeFileName(fileName)}`;

/**
 * Uploads/replaces the project's zip. Uses upsert so re-running an edit
 * (or retrying after a transient failure) safely overwrites the previous
 * zip rather than erroring or leaving two copies around.
 */
const uploadProjectZip = async (projectId, zipBuffer) => {
  const path = zipPathFor(projectId);
  const { error } = await aiStudioSupabase.storage
    .from(AI_STUDIO_SUPABASE_BUCKET)
    .upload(path, zipBuffer, { contentType: 'application/zip', upsert: true });
  if (error) throw new Error(`AI Studio zip upload error: ${error.message}`);
  return path;
};

const downloadProjectZip = async (zipPath) => {
  const { data, error } = await aiStudioSupabase.storage.from(AI_STUDIO_SUPABASE_BUCKET).download(zipPath);
  if (error) throw new Error(`AI Studio zip download error: ${error.message}`);
  return data;
};

const createSignedZipUrl = async (zipPath, expiresIn = 300) => {
  const { data, error } = await aiStudioSupabase.storage
    .from(AI_STUDIO_SUPABASE_BUCKET)
    .createSignedUrl(zipPath, expiresIn);
  if (error) throw new Error(`AI Studio signed URL error: ${error.message}`);
  return data.signedUrl;
};

const uploadAsset = async (projectId, assetId, fileName, buffer, contentType) => {
  const path = assetPathFor(projectId, assetId, fileName);
  const { error } = await aiStudioSupabase.storage
    .from(AI_STUDIO_SUPABASE_BUCKET)
    .upload(path, buffer, { contentType: contentType || 'application/octet-stream', upsert: false });
  if (error) throw new Error(`AI Studio asset upload error: ${error.message}`);
  return path;
};

/**
 * Lists every object under a project's storage prefix, recursively.
 * Supabase's `list` is not recursive, so folders (like `assets/`) have to
 * be walked one level at a time.
 */
const listAllObjects = async (prefix) => {
  const results = [];
  const walk = async (currentPrefix) => {
    const { data, error } = await aiStudioSupabase.storage
      .from(AI_STUDIO_SUPABASE_BUCKET)
      .list(currentPrefix, { limit: 1000 });
    if (error) throw new Error(`AI Studio storage list error: ${error.message}`);
    for (const entry of data || []) {
      // Supabase returns folders as entries with `id === null` and no metadata.
      const isFolder = entry.id === null && !entry.metadata;
      const fullPath = `${currentPrefix}/${entry.name}`;
      if (isFolder) {
        await walk(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  };
  await walk(prefix);
  return results;
};

/**
 * Deletes every Supabase object belonging to a project. Idempotent: if
 * some or all objects are already gone, this is a no-op rather than an
 * error, so retrying a partially-failed cleanup is always safe.
 */
const deleteProjectStorage = async (projectId) => {
  const prefix = storagePrefixFor(projectId);
  const paths = await listAllObjects(prefix);
  if (paths.length === 0) return { deleted: 0 };
  const { error } = await aiStudioSupabase.storage.from(AI_STUDIO_SUPABASE_BUCKET).remove(paths);
  if (error) throw new Error(`AI Studio storage delete error: ${error.message}`);
  return { deleted: paths.length };
};

// Signed asset URLs are baked into generated code, so they must outlive the
// time a user keeps an AI Studio session open. Inactivity cleanup (default 20
// min) deletes the objects anyway, so 24h is a ceiling, not a retention period.
const ASSET_URL_TTL_SECONDS = Number.parseInt(process.env.AI_STUDIO_ASSET_URL_TTL_SECONDS || '86400', 10) || 86400;

const createSignedAssetUrl = async (storagePath, expiresIn = ASSET_URL_TTL_SECONDS, { download } = {}) => {
  const { data, error } = await aiStudioSupabase.storage
    .from(AI_STUDIO_SUPABASE_BUCKET)
    .createSignedUrl(storagePath, expiresIn, download ? { download } : undefined);
  if (error) throw new Error(`AI Studio asset signed URL error: ${error.message}`);
  return data.signedUrl;
};

const downloadAsset = async (storagePath) => {
  const { data, error } = await aiStudioSupabase.storage
    .from(AI_STUDIO_SUPABASE_BUCKET)
    .download(storagePath);
  if (error) throw new Error(`AI Studio asset download error: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const deleteAsset = async (storagePath) => {
  const { error } = await aiStudioSupabase.storage.from(AI_STUDIO_SUPABASE_BUCKET).remove([storagePath]);
  if (error) throw new Error(`AI Studio asset delete error: ${error.message}`);
  return true;
};

module.exports = {
  storagePrefixFor,
  zipPathFor,
  assetPathFor,
  sanitizeFileName,
  ASSET_URL_TTL_SECONDS,
  uploadProjectZip,
  downloadProjectZip,
  createSignedZipUrl,
  uploadAsset,
  downloadAsset,
  createSignedAssetUrl,
  listAllObjects,
  deleteProjectStorage,
  deleteAsset,
};
