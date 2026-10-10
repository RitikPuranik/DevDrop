const DEV_DROP_RESPONSIVE_PATH = '/__devdrop-responsive.css';

const DEV_DROP_RESPONSIVE_CSS = `/* DevDrop responsive runtime */
html, body {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar,
#root::-webkit-scrollbar,
*::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}

html { overflow-x: hidden; overflow-y: auto; }
body { overflow-x: hidden; overflow-y: auto; overflow-wrap: anywhere; }

*, *::before, *::after { box-sizing: border-box; }
img, picture, video, canvas, svg { max-width: 100%; }
img, video { height: auto; }
iframe { max-width: 100%; }
button, input, textarea, select { max-width: 100%; min-width: 0; }
#root { width: 100%; max-width: 100%; min-width: 0; overflow-x: hidden; }

table { width: 100%; max-width: 100%; display: block; overflow-x: auto; }
pre, code { max-width: 100%; overflow-x: auto; white-space: pre-wrap; overflow-wrap: anywhere; }

@media (max-width: 768px) {
  h1, h2, h3, h4, h5, h6 { max-width: 100%; overflow-wrap: anywhere; }
  nav, header, main, section, article, aside, footer { max-width: 100%; }
}
`;

const normalizeProjectFiles = (source = {}) => {
  const files = { ...(source || {}) };
  const app = files['/App.js'];
  const css = files[DEV_DROP_RESPONSIVE_PATH];
  const cssText = typeof css === 'string' ? css : '';

  if (!cssText.includes('DevDrop responsive runtime')) {
    files[DEV_DROP_RESPONSIVE_PATH] = cssText
      ? `${cssText}\n\n${DEV_DROP_RESPONSIVE_CSS}`
      : DEV_DROP_RESPONSIVE_CSS;
  }

  if (typeof app === 'string' && !app.includes('./__devdrop-responsive.css') && !app.includes('/__devdrop-responsive.css')) {
    files['/App.js'] = `import './__devdrop-responsive.css';\n${app}`;
  }

  return files;
};

const AdmZip = require('adm-zip');

/**
 * Builds a zip buffer from the CURRENT file map only. Because this always
 * starts from a fresh AdmZip and only ever iterates `files` as it exists
 * right now, a file removed by the latest generation is simply absent from
 * `files` and therefore absent from the zip — there is no stale state
 * carried over from a previous generation (Section 19).
 *
 * @param {Record<string,string>} files path -> file contents
 * @param {Record<string,string>} [dependencies] written out as part of package.json if present and not already in files
 */
const buildProjectZip = (files = {}) => {
  const zip = new AdmZip();
  const entries = Object.entries(normalizeProjectFiles(files));
  for (const [path, content] of entries) {
    if (!path) continue;
    const cleanPath = path.replace(/^\/+/, '');
    const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    zip.addFile(cleanPath, Buffer.from(body, 'utf8'));
  }
  return zip.toBuffer();
};

// A version zip is a normal, openable project zip PLUS an exact snapshot
// manifest. The manifest makes restore lossless (file values can be strings
// or { code } objects, which a plain zip of files would flatten).
const SNAPSHOT_ENTRY = '.devdrop/snapshot.json';

const buildVersionZip = ({ files = {}, dependencies = {}, title = null } = {}) => {
  const zip = new AdmZip(buildProjectZip(files));
  zip.addFile(SNAPSHOT_ENTRY, Buffer.from(JSON.stringify({ files, dependencies, title }), 'utf8'));
  return zip.toBuffer();
};

const readVersionZip = (buffer) => {
  const entry = new AdmZip(buffer).getEntry(SNAPSHOT_ENTRY);
  if (!entry) throw new Error('Version zip is missing its snapshot manifest');
  const parsed = JSON.parse(entry.getData().toString('utf8'));
  return { files: parsed.files || {}, dependencies: parsed.dependencies || {}, title: parsed.title || null };
};

module.exports = { buildProjectZip, normalizeProjectFiles, buildVersionZip, readVersionZip };
