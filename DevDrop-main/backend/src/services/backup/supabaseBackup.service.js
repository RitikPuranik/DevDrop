const { createClient } = require('@supabase/supabase-js');

/**
 * Mirrors every file in a Supabase Storage bucket from one project to
 * another. Used for both directions:
 *   - main   -> backup  (regular backup)
 *   - backup -> main    (restore)
 */

const buildClient = (url, serviceRoleKey, label) => {
  if (!url || !serviceRoleKey) {
    throw new Error(`${label} Supabase credentials are not configured`);
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
};

/**
 * Recursively list every file path inside a bucket (Supabase's `list`
 * only returns one folder level at a time).
 */
const listAllFiles = async (client, bucket, prefix = '') => {
  const { data, error } = await client.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) throw new Error(`Supabase list error (${prefix || '/'}): ${error.message}`);

  let files = [];

  for (const entry of data || []) {
    // Folders come back with id === null and no metadata
    const isFolder = entry.id === null && !entry.metadata;
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (isFolder) {
      const nested = await listAllFiles(client, bucket, entryPath);
      files = files.concat(nested);
    } else {
      files.push({ path: entryPath, size: entry.metadata?.size ?? null });
    }
  }

  return files;
};

const buildFileIndex = (entries) => {
  const index = new Map();
  for (const entry of entries) index.set(entry.path, entry);
  return index;
};

/**
 * Copy every file from the source bucket/project to the target
 * bucket/project. Files are streamed through memory one at a time
 * (download -> upload) rather than buffered all at once, since
 * source code zips/videos can be large.
 *
 * Files whose size hasn't changed since the last run are skipped
 * entirely (no download/upload), so a daily backup only transfers
 * what actually changed instead of re-uploading everything every time.
 *
 * mode:
 *  - 'mirror' (default): target ends up EXACTLY matching source —
 *    files that exist on target but not on source are deleted.
 *    This is what stops the backup bucket from growing forever with
 *    stale copies of files that were deleted on main.
 *  - 'add-only': only uploads/updates files, never deletes anything
 *    from target. Use this if you intentionally want backup to keep
 *    files even after they're removed from main.
 */
const mirrorBucket = async ({
  sourceUrl,
  sourceKey,
  sourceBucket,
  targetUrl,
  targetKey,
  targetBucket,
  mode = 'mirror',
  onProgress,
}) => {
  const sourceClient = buildClient(sourceUrl, sourceKey, 'Source');
  const targetClient = buildClient(targetUrl, targetKey, 'Target');

  const [sourceFiles, targetFiles] = await Promise.all([
    listAllFiles(sourceClient, sourceBucket),
    listAllFiles(targetClient, targetBucket),
  ]);

  const sourcePaths = new Set(sourceFiles.map((f) => f.path));
  const targetIndex = buildFileIndex(targetFiles);

  const result = { mode, total: sourceFiles.length, copied: 0, skipped: 0, deleted: 0, failed: [] };

  for (const file of sourceFiles) {
    try {
      const existing = targetIndex.get(file.path);

      // Skip files that already exist on target with the same size —
      // nothing changed, no need to re-download/re-upload.
      if (existing && existing.size != null && file.size != null && existing.size === file.size) {
        result.skipped += 1;
        if (onProgress) onProgress({ ...result, currentPath: file.path, action: 'skipped' });
        continue;
      }

      const { data: blob, error: downloadError } = await sourceClient.storage
        .from(sourceBucket)
        .download(file.path);

      if (downloadError) throw new Error(downloadError.message);

      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await targetClient.storage
        .from(targetBucket)
        .upload(file.path, buffer, { upsert: true, contentType: blob.type || 'application/octet-stream' });

      if (uploadError) throw new Error(uploadError.message);

      result.copied += 1;
    } catch (err) {
      result.failed.push({ path: file.path, error: err.message });
    }

    if (onProgress) onProgress({ ...result, currentPath: file.path });
  }

  // Remove anything on target that no longer exists on source, so the
  // backup bucket doesn't just accumulate old/deleted files forever.
  if (mode === 'mirror') {
    const stalePaths = targetFiles.map((f) => f.path).filter((path) => !sourcePaths.has(path));

    if (stalePaths.length > 0) {
      // Supabase remove() accepts a batch of paths at once
      const BATCH = 100;
      for (let i = 0; i < stalePaths.length; i += BATCH) {
        const batch = stalePaths.slice(i, i + BATCH);
        const { error: removeError } = await targetClient.storage.from(targetBucket).remove(batch);
        if (removeError) {
          batch.forEach((path) => result.failed.push({ path, error: `Cleanup failed: ${removeError.message}` }));
        } else {
          result.deleted += batch.length;
        }
      }
    }
  }

  return result;
};

/** Quick reachability + bucket existence check used by the "test connection" endpoint. */
const testConnection = async (url, serviceRoleKey, bucket) => {
  const client = buildClient(url, serviceRoleKey, 'Supabase');
  const { data, error } = await client.storage.from(bucket).list('', { limit: 1 });
  if (error) throw new Error(`Supabase connection failed: ${error.message}`);
  return { ok: true, bucket, sampleEntryCount: data?.length ?? 0 };
};

module.exports = { mirrorBucket, listAllFiles, testConnection };
