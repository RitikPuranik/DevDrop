const path = require('path');
const AdmZip = require('adm-zip');
const ignore = require('ignore');
const axios = require('axios');

const Website = require('../modules/website/website.model');
const Purchase = require('../modules/payment/purchase.model');
const ProjectExport = require('../modules/github/projectExport.model');
const GithubConnection = require('../modules/github/githubConnection.model');
const supabaseService = require('./supabase.service');
const githubService = require('./github.service');
const cryptoUtil = require('../shared/utils/crypto');
const {
  PAYMENT_STATUS,
  EXPORT_STATUS,
  EXCLUDED_EXPORT_DIR_NAMES,
  EXCLUDED_EXPORT_FILE_NAMES,
} = require('../shared/utils/constants');

// Safety guards so one huge/odd project can't hang the server or blow past
// GitHub's practical API limits.
const MAX_EXPORT_FILES = 3000;
const MAX_FILE_SIZE_BYTES = 45 * 1024 * 1024; // GitHub's blob API caps a single blob at 100MB; stay well under it
const BLOB_UPLOAD_CONCURRENCY = 6;

const isPublicUrl = (value) => /^https?:\/\//.test(value || '');

// ─────────────────────────────────────────
// REPOSITORY NAME HANDLING
// ─────────────────────────────────────────

const sanitizeRepoName = (rawName) => {
  let name = String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
    .replace(/-{2,}/g, '-');

  if (!name) name = 'devdrop-project';
  return name.slice(0, 100);
};

// Defense in depth — express-validator already checks this shape at the
// route layer, but the service doesn't trust callers blindly.
const isValidRepoName = (name) => typeof name === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(name) && name !== '.' && name !== '..';

// ─────────────────────────────────────────
// FILE EXTRACTION + EXCLUSION
// ─────────────────────────────────────────

/**
 * True if any path segment matches an always-excluded directory name.
 */
const hasExcludedDirSegment = (posixPath) => {
  const segments = posixPath.split('/');
  return segments.some((segment) => EXCLUDED_EXPORT_DIR_NAMES.includes(segment));
};

/**
 * .env* files are excluded, EXCEPT .env.example (and similar .env.*.example
 * variants), which are safe, documentation-style files sellers include on
 * purpose.
 */
const isBlockedEnvFile = (fileName) => {
  if (!/^\.env(\..+)?$/.test(fileName)) return false;
  return !/\.example$/i.test(fileName);
};

const isAlwaysExcluded = (posixPath) => {
  const fileName = path.posix.basename(posixPath);
  if (EXCLUDED_EXPORT_FILE_NAMES.includes(fileName)) return true;
  if (isBlockedEnvFile(fileName)) return true;
  if (hasExcludedDirSegment(posixPath)) return true;
  return false;
};

/**
 * Normalizes a zip entry name into a safe, relative, forward-slash path.
 * Returns null for anything that looks like a zip-slip / path traversal
 * attempt or an absolute path, so it can be dropped rather than extracted.
 */
const toSafeRelativePath = (entryName) => {
  const posixName = entryName.replace(/\\/g, '/');
  const normalized = path.posix.normalize(posixName);

  if (!normalized || normalized === '.' || normalized.startsWith('..') || path.posix.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
};

const README_PATTERN = /^readme(\.md|\.txt)?$/i;

/**
 * Reads the purchased project's ZIP and returns the filtered file list
 * ready for upload, honoring the always-excluded list, the project's own
 * .gitignore (best effort), and basic safety limits.
 *
 * @returns {{ files: {relativePath: string, buffer: Buffer}[], skipped: string[], hasReadme: boolean }}
 */
const extractExportableFiles = (zipBuffer) => {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  // Best-effort respect for the project's own .gitignore, layered on top
  // of (never instead of) our hard-coded exclusion list.
  const rootGitignoreEntry = entries.find((e) => !e.isDirectory && toSafeRelativePath(e.entryName) === '.gitignore');
  const ig = ignore();
  if (rootGitignoreEntry) {
    try {
      ig.add(rootGitignoreEntry.getData().toString('utf8'));
    } catch {
      // Malformed .gitignore — fall back to just the hard-coded rules.
    }
  }

  const files = [];
  const skipped = [];
  let hasReadme = false;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const relativePath = toSafeRelativePath(entry.entryName);
    if (!relativePath) {
      skipped.push(`${entry.entryName} (unsafe path)`);
      continue;
    }

    if (isAlwaysExcluded(relativePath)) continue;

    try {
      if (ig.ignores(relativePath)) continue;
    } catch {
      // If the ignore matcher chokes on an unusual path, don't let that
      // block the export — just fall through and include the file.
    }

    if (README_PATTERN.test(path.posix.basename(relativePath)) && !relativePath.includes('/')) {
      hasReadme = true;
    }

    const buffer = entry.getData();
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      skipped.push(`${relativePath} (too large: ${(buffer.length / (1024 * 1024)).toFixed(1)}MB)`);
      continue;
    }

    files.push({ relativePath, buffer });

    if (files.length > MAX_EXPORT_FILES) {
      throw new Error(`This project has more than ${MAX_EXPORT_FILES} files, which is too many to export automatically.`);
    }
  }

  return { files, skipped, hasReadme };
};

const generateReadmeContent = (projectName) =>
  `# ${projectName}\n\nThis project was exported from [DevDrop](https://devdrop.app) after purchase.\n\n## Getting Started\n\nInstall dependencies:\n\n\`\`\`bash\nnpm install\n\`\`\`\n\nRun the project:\n\n\`\`\`bash\nnpm run dev\n\`\`\`\n`;

// ─────────────────────────────────────────
// CONCURRENCY-LIMITED BLOB UPLOAD
// ─────────────────────────────────────────

const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;

  const runNext = async () => {
    while (cursor < items.length) {
      const currentIndex = cursor++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(workers);
  return results;
};

// ─────────────────────────────────────────
// EXPORT ORCHESTRATION
// ─────────────────────────────────────────

const markFailed = async (exportDoc, safeMessage) => {
  exportDoc.status = EXPORT_STATUS.FAILED;
  exportDoc.errorMessage = safeMessage;
  await exportDoc.save();
};

/**
 * Runs the full export pipeline for a previously-created ProjectExport
 * record. Intended to be called fire-and-forget (e.g. via setImmediate)
 * right after the HTTP request that created the record has already
 * responded with the exportId — large exports must never block the
 * request/response cycle.
 */
const runExport = async (exportId) => {
  const exportDoc = await ProjectExport.findById(exportId);
  if (!exportDoc) return;

  try {
    exportDoc.status = EXPORT_STATUS.PROCESSING;
    await exportDoc.save();

    // Re-verify everything server-side — never trust that the state at
    // request time still holds by the time the background job runs.
    const [purchase, website, connection] = await Promise.all([
      Purchase.findOne({ _id: exportDoc.purchaseId, buyerId: exportDoc.userId, paymentStatus: PAYMENT_STATUS.COMPLETED }),
      Website.findById(exportDoc.websiteId),
      GithubConnection.findOne({ userId: exportDoc.userId }).select('+accessTokenEncrypted'),
    ]);

    if (!purchase) throw new Error('OWNERSHIP_LOST');
    if (!website || !website.sourceCodeUrl) throw new Error('SOURCE_MISSING');
    if (!connection) throw new Error('NOT_CONNECTED');

    const accessToken = cryptoUtil.decrypt(connection.accessTokenEncrypted);

    // 1. Retrieve source files (a signed URL scoped tightly to this job).
    const sourceUrl = isPublicUrl(website.sourceCodeUrl)
      ? website.sourceCodeUrl
      : await supabaseService.createSignedUrl(website.sourceCodeUrl, 300);
    const { data: zipBuffer } = await axios.get(sourceUrl, { responseType: 'arraybuffer', timeout: 60000 });

    // 2. Extract + filter files.
    const { files, hasReadme, skipped } = extractExportableFiles(Buffer.from(zipBuffer));
    if (files.length === 0) throw new Error('NO_FILES');
    if (skipped.length > 0) {
      console.warn(`GitHub export ${exportId}: skipped ${skipped.length} file(s):`, skipped.slice(0, 20));
    }

    if (!hasReadme) {
      files.push({
        relativePath: 'README.md',
        buffer: Buffer.from(generateReadmeContent(website.name), 'utf8'),
      });
    }

    // 3. Create the GitHub repository (never reuses/overwrites an existing one).
    let repo;
    try {
      repo = await githubService.createRepository(accessToken, {
        name: exportDoc.repositoryName,
        description: exportDoc.description,
        isPrivate: exportDoc.visibility === 'private',
      });
    } catch (err) {
      if (githubService.isRepoNameTakenError(err)) throw new Error('NAME_TAKEN');
      if (githubService.isAuthError(err)) throw new Error('AUTH_EXPIRED');
      throw err;
    }

    // 4. Upload blobs (bounded concurrency to stay friendly to GitHub's API).
    const blobEntries = await mapWithConcurrency(files, BLOB_UPLOAD_CONCURRENCY, async (file) => {
      const sha = await githubService.createBlob(accessToken, repo.owner, repo.name, file.buffer.toString('base64'));
      return { path: file.relativePath, mode: '100644', type: 'blob', sha };
    });

    // 5. Create tree -> commit -> ref (this is a brand-new repo, so no base tree/parents).
    const treeSha = await githubService.createTree(accessToken, repo.owner, repo.name, blobEntries);
    const commitSha = await githubService.createCommit(accessToken, repo.owner, repo.name, {
      message: `Initial commit — exported from DevDrop (${website.name})`,
      treeSha,
      parents: [],
    });
    await githubService.createRef(accessToken, repo.owner, repo.name, repo.defaultBranch, commitSha);

    // 6. Record success.
    exportDoc.status = EXPORT_STATUS.SUCCESS;
    exportDoc.repositoryUrl = repo.htmlUrl;
    exportDoc.repositoryOwner = repo.owner;
    exportDoc.repositoryName = repo.name;
    exportDoc.defaultBranch = repo.defaultBranch;
    exportDoc.fileCount = files.length;
    exportDoc.errorMessage = undefined;
    await exportDoc.save();
  } catch (error) {
    console.error(`GitHub export ${exportId} failed:`, error.message);

    const friendlyMessages = {
      OWNERSHIP_LOST: 'We could no longer verify your purchase of this project.',
      SOURCE_MISSING: 'This project\'s source files are not available right now.',
      NOT_CONNECTED: 'Your GitHub connection is missing. Please reconnect and try again.',
      NO_FILES: 'No exportable files were found in this project after filtering out excluded paths.',
      NAME_TAKEN: 'A repository with this name already exists in your GitHub account. Please choose another name.',
      AUTH_EXPIRED: 'Your GitHub authorization has expired. Please reconnect GitHub and try again.',
    };

    const safeMessage = friendlyMessages[error.message] || 'We hit an unexpected error while exporting this project to GitHub. Please try again.';
    await markFailed(exportDoc, safeMessage);
  }
};

module.exports = {
  sanitizeRepoName,
  isValidRepoName,
  extractExportableFiles,
  generateReadmeContent,
  runExport,
};
