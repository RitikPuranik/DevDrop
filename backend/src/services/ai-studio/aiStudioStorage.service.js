const { aiStudioSupabase, AI_STUDIO_SUPABASE_BUCKET } = require('../../shared/config/aiStudioSupabase');

const storagePrefixFor = (projectId) => `ai-studio/${projectId}`;
const zipPathFor = (projectId) => `${storagePrefixFor(projectId)}/project.zip`;
const assetPathFor = (projectId, fileName) => `${storagePrefixFor(projectId)}/assets/${fileName}`;

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

const uploadAsset = async (projectId, fileName, buffer, contentType) => {
  const path = assetPathFor(projectId, fileName);
  const { error } = await aiStudioSupabase.storage
    .from(AI_STUDIO_SUPABASE_BUCKET)
    .upload(path, buffer, { contentType: contentType || 'application/octet-stream', upsert: true });
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

const deleteAsset = async (storagePath) => {
  const { error } = await aiStudioSupabase.storage.from(AI_STUDIO_SUPABASE_BUCKET).remove([storagePath]);
  if (error) throw new Error(`AI Studio asset delete error: ${error.message}`);
  return true;
};

module.exports = {
  storagePrefixFor,
  zipPathFor,
  assetPathFor,
  uploadProjectZip,
  downloadProjectZip,
  createSignedZipUrl,
  uploadAsset,
  listAllObjects,
  deleteProjectStorage,
  deleteAsset,
};
