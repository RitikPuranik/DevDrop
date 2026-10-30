'use strict';
// Compact single-line log formatting. Never pass credentials or prompts in `fields`.
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function fmt(fields = {}, { drop = [] } = {}) {
  const skip = new Set(drop);
  const parts = [];
  for (const [key, value] of Object.entries(fields)) {
    if (skip.has(key) || value === null || value === undefined || value === false || value === '' || value === 0) continue;
    const text = typeof value === 'object' ? clip(JSON.stringify(value), 80) : clip(String(value), 120);
    parts.push(`${key}=${text.includes(' ') ? JSON.stringify(text) : text}`);
  }
  return parts.join(' ');
}

const verbose = () => /^(1|true|yes|on)$/i.test(String(process.env.AI_LOG_VERBOSE || ''));

module.exports = { fmt, verbose };
