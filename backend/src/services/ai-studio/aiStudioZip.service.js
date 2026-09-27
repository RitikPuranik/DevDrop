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
  const entries = Object.entries(files || {});
  for (const [path, content] of entries) {
    if (!path) continue;
    const cleanPath = path.replace(/^\/+/, '');
    const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    zip.addFile(cleanPath, Buffer.from(body, 'utf8'));
  }
  return zip.toBuffer();
};

module.exports = { buildProjectZip };
