const path = require('path');
const AdmZip = require('adm-zip');
const ignore = require('ignore');
const axios = require('axios');

const Website = require('../modules/website/website.model');
const AIStudioProject = require('../modules/ai-studio/aiStudioProject.model');
const { normalizeProjectFiles } = require('./ai-studio/aiStudioZip.service');
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

    // GitHub's repo-creation response can arrive before the repo is fully
    // provisioned on their backend; hitting the Git Data API immediately
    // can 409. A brief head start here reduces how often createBlob's own
    // retry-on-409 logic has to kick in.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 4. Upload blobs (bounded concurrency to stay friendly to GitHub's API).
    const blobEntries = await mapWithConcurrency(files, BLOB_UPLOAD_CONCURRENCY, async (file) => {
      const sha = await githubService.createBlob(accessToken, repo.owner, repo.name, file.buffer.toString('base64'));
      return { path: file.relativePath, mode: '100644', type: 'blob', sha };
    });

    // 5. Create tree -> commit -> ref. The repo already has an auto_init
    // README commit (needed so the Git Data API accepts writes at all —
    // see createRepository's comment), but our export commit is built as
    // its own orphan commit (no parents) and then force-pushed over the
    // branch via updateRef, so the exported project's history starts clean.
    const treeSha = await githubService.createTree(accessToken, repo.owner, repo.name, blobEntries);
    const commitSha = await githubService.createCommit(accessToken, repo.owner, repo.name, {
      message: `Initial commit — exported from DevDrop (${website.name})`,
      treeSha,
      parents: [],
    });
    await githubService.updateRef(accessToken, repo.owner, repo.name, repo.defaultBranch, commitSha);

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
    if (error?.response) {
      console.error(`GitHub export ${exportId} - GitHub response:`, {
        status: error.response.status,
        data: error.response.data,
      });
    }

    const friendlyMessages = {
      OWNERSHIP_LOST: 'We could no longer verify your purchase of this project.',
      SOURCE_MISSING: 'This project\'s source files are not available right now.',
      NOT_CONNECTED: 'Your GitHub connection is missing. Please reconnect and try again.',
      NO_FILES: 'No exportable files were found in this project after filtering out excluded paths.',
      NAME_TAKEN: 'A repository with this name already exists in your GitHub account. Please choose another name.',
      AUTH_EXPIRED: 'Your GitHub authorization has expired. Please reconnect GitHub and try again.',
    };

    let safeMessage = friendlyMessages[error.message];
    if (!safeMessage && error?.response?.status === 409) {
      safeMessage = 'GitHub was still setting up the new repository and kept rejecting the upload. Please try again in a minute.';
    }
    if (!safeMessage) {
      safeMessage = 'We hit an unexpected error while exporting this project to GitHub. Please try again.';
    }
    await markFailed(exportDoc, safeMessage);
  }
};

// ─────────────────────────────────────────
// AI STUDIO EXPORT
// ─────────────────────────────────────────
// Same GitHub pipeline as runExport, but the source is the persisted
// AIStudioProject.files map (the source of truth the project.zip is derived
// from) instead of a purchased ZIP -- so no Purchase/Website is involved.

const AI_STUDIO_DEFAULT_VITE_CONFIG = `import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    {
      name: 'treat-js-files-as-jsx',
      async transform(code, id) {
        if (!id.match(/\\.js$/)) return null;
        return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
      },
    },
    react(),
  ],
  optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
});
`;
const AI_STUDIO_DEFAULT_INDEX_HTML = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>__TITLE__</title>\n    <script src="https://cdn.tailwindcss.com"></script>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/main.jsx"></script>\n  </body>\n</html>\n';
const AI_STUDIO_DEFAULT_MAIN_JSX = [
  'import React from "react";',
  'import { createRoot } from "react-dom/client";',
  'import App from "./App.js";',
  '',
  '// A render error must never leave a black screen: show it, and log it.',
  'class RootErrorBoundary extends React.Component {',
  '  constructor(props) { super(props); this.state = { error: null }; }',
  '  static getDerivedStateFromError(error) { return { error }; }',
  '  componentDidCatch(error, info) { console.error("[site] render error:", error, info && info.componentStack); }',
  '  render() {',
  '    if (!this.state.error) return this.props.children;',
  '    return (',
  '      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111" }}>',
  '        <div style={{ maxWidth: 560 }}>',
  '          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>This page hit an error</h1>',
  '          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, opacity: 0.8 }}>{String(this.state.error && this.state.error.message || this.state.error)}</pre>',
  '        </div>',
  '      </div>',
  '    );',
  '  }',
  '}',
  '',
  'createRoot(document.getElementById("root")).render(<React.StrictMode><RootErrorBoundary><App /></RootErrorBoundary></React.StrictMode>);',
  '',
].join('\n');

// Same rule the in-browser preview installs with (--legacy-peer-deps). Without it
// Vercel's plain `npm install` aborts with ERESOLVE on peer-range mismatches that
// the preview silently tolerated: "works in preview, fails on Vercel".
const AI_STUDIO_NPMRC = 'legacy-peer-deps=true\n';
const AI_STUDIO_VERCEL_JSON = JSON.stringify({
  framework: 'vite',
  installCommand: 'npm install',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  rewrites: [{ source: '/(.*)', destination: '/index.html' }],
}, null, 2) + '\n';
// The scaffold's vite.config.js uses transformWithEsbuild (present up to Vite 7),
// so Vite / the React plugin must not be replaced by an older/newer range the
// model happened to write into its package.json.
const AI_STUDIO_PINNED_DEV_DEPS = { vite: '^7.0.0', '@vitejs/plugin-react': '^5.0.0' };

// AI Studio generations sometimes arrive wrapped in a single top-level folder
// such as `app/`. Preview can still render those files because it reads the
// persisted source map directly, but a GitHub/Vercel deployment can then point
// at the repository root and serve `/app/src/*.tsx` as raw source. Flatten only
// when that wrapper contains a real application root (package.json or
// index.html), so ordinary nested source layouts are left untouched.
const flattenAiStudioRootWrapper = (files) => {
  const entries = Object.entries(files || {});
  if (!entries.length) return files;

  const topLevel = new Set(entries.map(([key]) => key.replace(/^\/+/, '').split('/')[0]));
  if (topLevel.size !== 1) return files;

  const [wrapper] = topLevel;
  const prefix = `/${wrapper}/`;
  const hasAppRoot = Boolean(files[`${prefix}package.json`] || files[`${prefix}index.html`]);
  if (!hasAppRoot) return files;

  const flattened = {};
  for (const [key, value] of entries) {
    const clean = key.replace(/^\/+/, '');
    if (clean === wrapper) continue;
    if (!clean.startsWith(`${wrapper}/`)) {
      flattened[`/${clean}`] = value;
      continue;
    }
    flattened[`/${clean.slice(wrapper.length + 1)}`] = value;
  }
  return flattened;
};

/**
 * A generated index.html must contain the #root mount node and point at an entry
 * file that exists in the project; otherwise the build "succeeds" and the page is
 * blank. Falls back to the known-good default instead of shipping a dead shell.
 */
const entryIsUsable = (indexHtml, files) => {
  if (!/id=["']root["']/.test(indexHtml)) return false;
  const m = indexHtml.match(/<script[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/i)
    || indexHtml.match(/<script[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["']/i);
  if (!m) return false;
  const src = m[1].replace(/^\/+/, '').split('?')[0];
  return Object.prototype.hasOwnProperty.call(files, `/${src}`);
};

const fileToText = (value) => {
  if (typeof value === 'string') return value;
  if (value && typeof value.code === 'string') return value.code;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value, null, 2);
};

const escapeHtml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── Preview/Vercel parity ───────────────────────────────────────────────────────────────────────
// The AI Studio preview (Sandpack) always loads the Tailwind CDN, so generated sites that use Tailwind
// utility classes look right there. A model-written index.html usually omits the script, which left the
// deployed site unstyled. Mirrors ai-service/src/utils/productionParity.js.
const AI_STUDIO_TAILWIND_TAG = '<script src="https://cdn.tailwindcss.com"></script>';
const TAILWIND_UTILITY = /\b(?:flex|grid|items-(?:center|start|end)|justify-(?:center|between|end)|gap-\d+|px-\d+|py-\d+|p-\d+|m[xytb]?-\d+|text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-(?:medium|semibold|bold)|rounded(?:-[a-z0-9]+)?|bg-[a-z]+-\d{2,3}|text-[a-z]+-\d{2,3}|w-full|min-h-screen|max-w-[a-z0-9]+)\b/g;

const usesTailwindClasses = (files) => {
  const seen = new Set();
  for (const [p, code] of Object.entries(files || {})) {
    if (!/\.(js|jsx|mjs|cjs)$/i.test(p) || typeof code !== 'string') continue;
    for (const m of code.matchAll(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\})/g)) {
      for (const t of (m[1] || m[2] || m[3] || m[4] || m[5] || '').match(TAILWIND_UTILITY) || []) seen.add(t);
      if (seen.size >= 4) return true;
    }
  }
  return false;
};

const injectTailwindCdn = (html) => {
  if (/cdn\.tailwindcss\.com/i.test(html)) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `  ${AI_STUDIO_TAILWIND_TAG}\n  </head>`);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n  ${AI_STUDIO_TAILWIND_TAG}`);
  return html;
};

/**
 * Turns an AIStudioProject into a deployable Vite + React repo file list:
 * generated files + any missing scaffold (package.json, index.html, main.jsx,
 * vite.config.js), .gitignore and README. Never overrides a scaffold file the
 * pipeline already produced.
 */
const buildAiStudioRepoFiles = (project) => {
  const flat = {};
  for (const [filePath, value] of Object.entries(project.files || {})) {
    const safe = toSafeRelativePath(String(filePath).replace(/^\/+/, ''));
    if (!safe || isAlwaysExcluded(safe)) continue;
    flat[`/${safe}`] = fileToText(value);
  }
  const out = normalizeProjectFiles(flattenAiStudioRootWrapper(flat));
  const title = project.title || 'DevDrop Site';
  const slug = sanitizeRepoName(title);

  let pkg = null;
  try { pkg = out['/package.json'] ? JSON.parse(out['/package.json']) : null; } catch { pkg = null; }
  pkg = pkg || {};
  pkg.name = pkg.name || slug;
  pkg.private = true;
  pkg.version = pkg.version || '1.0.0';
  pkg.type = pkg.type || 'module';
  pkg.scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview', ...(pkg.scripts || {}) };
  pkg.dependencies = { react: '^19.0.0', 'react-dom': '^19.0.0', ...(pkg.dependencies || {}), ...(project.dependencies || {}) };
  const usesDefaultViteConfig = !out['/vite.config.js'] && !out['/vite.config.mjs'];
  pkg.devDependencies = { ...AI_STUDIO_PINNED_DEV_DEPS, ...(pkg.devDependencies || {}) };
  if (usesDefaultViteConfig) Object.assign(pkg.devDependencies, AI_STUDIO_PINNED_DEV_DEPS);
  // Vite 7 needs Node >= 20.19; pin a Node line Vercel supports so the build never runs on an older default.
  pkg.engines = { node: '22.x', ...(pkg.engines || {}) };
  out['/package.json'] = JSON.stringify(pkg, null, 2);

  const defaultIndex = AI_STUDIO_DEFAULT_INDEX_HTML.replace('__TITLE__', escapeHtml(title));
  if (!out['/main.jsx'] && !out['/main.js'] && !out['/src/main.jsx']) out['/main.jsx'] = AI_STUDIO_DEFAULT_MAIN_JSX;
  if (!out['/index.html'] || !entryIsUsable(out['/index.html'], out)) out['/index.html'] = defaultIndex;
  // A kept (model-written) index.html must still load Tailwind if the code relies on it, as the preview does.
  if (!pkg.dependencies.tailwindcss && !pkg.devDependencies.tailwindcss && !out['/tailwind.config.js'] && usesTailwindClasses(out)) {
    out['/index.html'] = injectTailwindCdn(out['/index.html']);
  }
  if (usesDefaultViteConfig) out['/vite.config.js'] = AI_STUDIO_DEFAULT_VITE_CONFIG;
  if (!out['/.npmrc']) out['/.npmrc'] = AI_STUDIO_NPMRC;
  if (!out['/vercel.json']) out['/vercel.json'] = AI_STUDIO_VERCEL_JSON;
  if (!out['/.gitignore']) out['/.gitignore'] = 'node_modules\ndist\n.env\n.env.*\n!.env.example\n.DS_Store\n';
  if (!Object.keys(out).some((k) => README_PATTERN.test(k.slice(1)))) {
    out['/README.md'] = `# ${title}\n\nGenerated with [DevDrop AI Studio](https://dev-drop-gamma.vercel.app).\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nBuild for production with \`npm run build\`.\n`;
  }

  return Object.entries(out).map(([filePath, content]) => ({
    relativePath: filePath.replace(/^\/+/, ''),
    buffer: Buffer.from(content, 'utf8'),
  }));
};

// ── Expiring asset URLs ─────────────────────────────────────────────────────────────────────────
// Uploaded images/videos/resumes are referenced in the generated code by signed storage URLs that expire
// (24h by default). The preview regenerates them, but a deployed site keeps the old ones, so media would
// break a day after deploying. Download each referenced asset into public/devdrop-assets and point the code
// at the local copy. Best effort: an asset that cannot be fetched keeps its original URL.
const SIGNED_ASSET_URL = /https?:\/\/[^\s"'`<>)\\]+?\/storage\/v1\/object\/sign\/([^/\s"'`<>)\\]+)\/([^?\s"'`<>)\\]+)\?[^\s"'`<>)\\]*/g;
const TEXT_FILE = /\.(?:jsx?|mjs|cjs|css|html?|json|md|svg)$/i;
const MAX_LOCALIZED_TOTAL_BYTES = 120 * 1024 * 1024;

const localAssetName = (storagePath) => {
  const m = /(?:^|\/)assets\/([^/]+)\/(.+)$/.exec(storagePath);
  const safe = (v) => String(v).replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
  return m ? `${safe(m[1])}-${safe(m[2])}` : safe(storagePath.split('/').slice(-2).join('-'));
};

const localizeSignedAssetUrls = async (repoFiles, { download, bucket } = {}) => {
  const result = { files: repoFiles, localized: 0, failed: [] };
  if (typeof download !== 'function') return result;

  const decoded = repoFiles.map((f) => ({ f, text: TEXT_FILE.test(f.relativePath) ? f.buffer.toString('utf8') : null }));
  const wanted = new Map(); // storagePath -> { urls:Set, local:string }
  for (const { text } of decoded) {
    if (text === null) continue;
    for (const m of text.matchAll(SIGNED_ASSET_URL)) {
      if (bucket && m[1] !== bucket) continue;
      let storagePath;
      try { storagePath = decodeURIComponent(m[2]); } catch { continue; }
      if (!wanted.has(storagePath)) wanted.set(storagePath, { urls: new Set(), local: `/devdrop-assets/${localAssetName(storagePath)}` });
      wanted.get(storagePath).urls.add(m[0]);
    }
  }
  if (!wanted.size) return result;

  const added = [];
  const replacements = new Map(); // full signed url -> local path
  let total = 0;
  for (const [storagePath, { urls, local }] of wanted) {
    try {
      const buffer = await download(storagePath);
      if (!buffer || buffer.length > MAX_FILE_SIZE_BYTES || total + buffer.length > MAX_LOCALIZED_TOTAL_BYTES) { result.failed.push(storagePath); continue; }
      total += buffer.length;
      added.push({ relativePath: `public${local}`, buffer });
      for (const url of urls) replacements.set(url, local);
    } catch (error) {
      result.failed.push(storagePath);
    }
  }
  if (!replacements.size) return result;

  const out = decoded.map(({ f, text }) => {
    if (text === null) return f;
    let next = text;
    // Longest first: the preview URL is a prefix of the same asset's "&download=" URL.
    for (const [url, local] of [...replacements].sort((a, b) => b[0].length - a[0].length)) if (next.includes(url)) next = next.split(url).join(local);
    return next === text ? f : { ...f, buffer: Buffer.from(next, 'utf8') };
  });
  result.files = [...out, ...added];
  result.localized = added.length;
  return result;
};

const runAiStudioExport = async (exportId) => {
  const exportDoc = await ProjectExport.findById(exportId);
  if (!exportDoc) return;

  try {
    exportDoc.status = EXPORT_STATUS.PROCESSING;
    await exportDoc.save();

    const [project, connection] = await Promise.all([
      AIStudioProject.findOne({ _id: exportDoc.aiStudioProjectId, userId: exportDoc.userId }),
      GithubConnection.findOne({ userId: exportDoc.userId }).select('+accessTokenEncrypted'),
    ]);
    if (!project) throw new Error('PROJECT_MISSING');
    if (!connection) throw new Error('NOT_CONNECTED');
    if (!project.files || Object.keys(project.files).length === 0) throw new Error('NO_FILES');

    const accessToken = cryptoUtil.decrypt(connection.accessTokenEncrypted);
    let files = buildAiStudioRepoFiles(project);
    try {
      // Lazy require: the AI Studio storage client needs Supabase env vars that unit tests do not set.
      const aiStudioStorage = require('./ai-studio/aiStudioStorage.service');
      const { AI_STUDIO_SUPABASE_BUCKET } = require('../shared/config/aiStudioSupabase');
      const localized = await localizeSignedAssetUrls(files, { download: aiStudioStorage.downloadAsset, bucket: AI_STUDIO_SUPABASE_BUCKET });
      files = localized.files;
      if (localized.localized || localized.failed.length) console.log(`AI Studio export ${exportId}: localized ${localized.localized} asset(s), ${localized.failed.length} could not be copied`);
    } catch (error) {
      console.warn(`AI Studio export ${exportId}: asset localization skipped:`, error.message);
    }
    if (files.length > MAX_EXPORT_FILES) throw new Error('NO_FILES');

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

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const blobEntries = await mapWithConcurrency(files, BLOB_UPLOAD_CONCURRENCY, async (file) => {
      const sha = await githubService.createBlob(accessToken, repo.owner, repo.name, file.buffer.toString('base64'));
      return { path: file.relativePath, mode: '100644', type: 'blob', sha };
    });

    const treeSha = await githubService.createTree(accessToken, repo.owner, repo.name, blobEntries);
    const commitSha = await githubService.createCommit(accessToken, repo.owner, repo.name, {
      message: `Initial commit — generated with DevDrop AI Studio (${project.title || 'site'})`,
      treeSha,
      parents: [],
    });
    await githubService.updateRef(accessToken, repo.owner, repo.name, repo.defaultBranch, commitSha);

    exportDoc.status = EXPORT_STATUS.SUCCESS;
    exportDoc.repositoryUrl = repo.htmlUrl;
    exportDoc.repositoryOwner = repo.owner;
    exportDoc.repositoryName = repo.name;
    exportDoc.defaultBranch = repo.defaultBranch;
    exportDoc.fileCount = files.length;
    exportDoc.errorMessage = undefined;
    await exportDoc.save();
  } catch (error) {
    console.error(`AI Studio GitHub export ${exportId} failed:`, error.message);
    const friendly = {
      PROJECT_MISSING: 'This AI Studio project is no longer available. Regenerate it and try again.',
      NOT_CONNECTED: 'Your GitHub connection is missing. Please reconnect and try again.',
      NO_FILES: 'This project has no generated files to push yet.',
      NAME_TAKEN: 'A repository with this name already exists in your GitHub account. Please choose another name.',
      AUTH_EXPIRED: 'Your GitHub authorization has expired. Please reconnect GitHub and try again.',
    };
    let safeMessage = friendly[error.message];
    if (!safeMessage && error?.response?.status === 409) {
      safeMessage = 'GitHub was still setting up the new repository and kept rejecting the upload. Please try again in a minute.';
    }
    await markFailed(exportDoc, safeMessage || 'We hit an unexpected error while pushing this project to GitHub. Please try again.');
  }
};

module.exports = {
  sanitizeRepoName,
  isValidRepoName,
  extractExportableFiles,
  generateReadmeContent,
  runExport,
  runAiStudioExport,
  buildAiStudioRepoFiles,
  localizeSignedAssetUrls,
};
