'use strict';
// Loads skill text from the internal, pinned library only. No network, no child processes, no dynamic require,
// no environment access. Text files only (SKILL.md). Content is never executed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateSkillText, MAX_SKILL_BYTES } = require('./skillValidator');

const CONTENT_PATH_RE = /^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/SKILL\.md$/;

class SkillLoadError extends Error {
  constructor(code, skillId, detail) {
    super(`Skill "${skillId}" could not be loaded (${code})${detail ? `: ${detail}` : ''}`);
    this.name = 'SkillLoadError';
    this.code = code;
    this.skillId = skillId;
  }
}

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function resolveContentPath(libraryRoot, contentPath, skillId = '(unknown)') {
  if (typeof contentPath !== 'string' || !CONTENT_PATH_RE.test(contentPath) || contentPath.includes('..')) {
    throw new SkillLoadError('PATH_INVALID', skillId, 'content path is not an allowed library path');
  }
  const root = path.resolve(libraryRoot);
  const abs = path.resolve(root, contentPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new SkillLoadError('PATH_INVALID', skillId, 'path escapes the skill library');
  let stat;
  try { stat = fs.lstatSync(abs); } catch { throw new SkillLoadError('NOT_FOUND', skillId, 'file does not exist'); }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new SkillLoadError('PATH_INVALID', skillId, 'not a regular file');
  const realRoot = fs.realpathSync(root);
  const realAbs = fs.realpathSync(abs);
  if (!realAbs.startsWith(realRoot + path.sep)) throw new SkillLoadError('PATH_INVALID', skillId, 'resolved path escapes the skill library');
  return { abs: realAbs, size: stat.size };
}

function makeLoader({ libraryRoot, verifyHashes = true, logger = console } = {}) {
  const cache = new Map();
  const log = (code, skillId) => logger.warn?.(`[SKILLS] load failure id=${skillId} code=${code}`); // never log content

  function load(entry) {
    const id = entry?.id || '(unknown)';
    const key = `${id}@${entry?.version}:${entry?.contentHash}:${verifyHashes ? 1 : 0}`;
    if (cache.has(key)) return cache.get(key);
    try {
      const { abs, size } = resolveContentPath(libraryRoot, entry.contentPath, id);
      const limit = Math.min(entry.maxBytes || MAX_SKILL_BYTES, 160 * 1024);
      if (size > limit) throw new SkillLoadError('TOO_LARGE', id, `${size} bytes`);
      const buffer = fs.readFileSync(abs);
      if (verifyHashes && sha256(buffer) !== entry.contentHash) throw new SkillLoadError('HASH_MISMATCH', id, 'content does not match the pinned hash');
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { throw new SkillLoadError('NOT_TEXT', id, 'not valid UTF-8 text'); }
      const verdict = validateSkillText(text, { maxBytes: limit });
      if (!verdict.ok) throw new SkillLoadError('CONTENT_REJECTED', id, verdict.reasons.map((r) => r.split(':')[0]).join(', '));
      const loaded = Object.freeze({ id, text, bytes: buffer.length, hash: sha256(buffer) });
      cache.set(key, loaded);
      return loaded;
    } catch (error) {
      const wrapped = error instanceof SkillLoadError ? error : new SkillLoadError('READ_FAILED', id);
      log(wrapped.code, id);
      throw wrapped;
    }
  }
  return { load, clearCache: () => cache.clear() };
}

module.exports = { makeLoader, resolveContentPath, SkillLoadError, sha256, CONTENT_PATH_RE };
