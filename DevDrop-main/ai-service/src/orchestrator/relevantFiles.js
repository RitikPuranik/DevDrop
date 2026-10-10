// Cheap, deterministic pass that narrows an edit request down to a small set
// of existing files *before* any Gemini call is made. This is what lets the
// edit pipeline avoid sending the whole project (or worse, regenerating it)
// for a one-line request like "fix the navbar spacing".
//
// It is intentionally a heuristic, not a full understanding of the request:
// when it can't find a confident match it falls back to a small structural
// set (entry point + the biggest components) plus the full file tree, and
// lets the edit agent itself pick from there. It never needs to be perfect,
// only good enough to avoid the common case of loading/rewriting every file.

const KEYWORD_GROUPS = [
  { keywords: ['navbar', 'nav bar', 'navigation', 'menu bar', 'header nav'], pattern: /nav|header/i },
  { keywords: ['hero', 'banner', 'landing section'], pattern: /hero|banner/i },
  { keywords: ['footer'], pattern: /footer/i },
  { keywords: ['testimonial', 'testimonials', 'review section'], pattern: /testimonial/i },
  { keywords: ['sidebar'], pattern: /sidebar/i },
  { keywords: ['button', 'cta', 'call to action'], pattern: /button|cta/i },
  { keywords: ['contact form', 'contact section'], pattern: /contact/i },
  { keywords: ['project', 'portfolio grid', 'work section'], pattern: /project|work|gallery/i },
  { keywords: ['about section', 'about me', 'bio section'], pattern: /about/i },
  { keywords: ['skill', 'skills section'], pattern: /skill/i },
  { keywords: ['experience', 'timeline'], pattern: /experience|timeline/i },
  { keywords: ['footer', 'social link'], pattern: /footer|social/i },
  { keywords: ['color', 'theme', 'palette', 'dark mode', 'background'], pattern: /theme|color|palette|style|css|App\.js|App\.jsx/i },
  { keywords: ['spacing', 'padding', 'margin', 'layout', 'align', 'responsive'], pattern: /css|style/i },
  { keywords: ['font', 'typography', 'text size'], pattern: /css|style|App\.js|App\.jsx/i },
  { keywords: ['route', 'routing', 'page', 'link to'], pattern: /App\.js|App\.jsx|route/i },
  { keywords: ['dependency', 'package', 'install'], pattern: /package\.json/i },
  { keywords: ['build', 'vite', 'bundler'], pattern: /vite\.config|package\.json/i },
];

const STRUCTURAL_FALLBACK_PATTERN = /^\/(App\.jsx?|main\.jsx?|index\.html)$/i;

function basename(filePath) {
  const parts = filePath.split('/').filter(Boolean);
  return (parts[parts.length - 1] || '').replace(/\.[^.]+$/, '');
}

// Pulls any file path that looks like it came from a stack trace or build
// error (e.g. "/components/Navbar.jsx:42:10" or "src/App.js") straight out
// of the instruction/error text -- the single strongest signal available.
function extractExplicitPaths(text, filePaths) {
  const hits = new Set();
  const lower = String(text || '').toLowerCase();
  for (const filePath of filePaths) {
    const base = basename(filePath).toLowerCase();
    if (base.length >= 3 && lower.includes(base)) hits.add(filePath);
  }
  return hits;
}

function scoreFiles(instruction, filePaths, fileContents) {
  const text = String(instruction || '').toLowerCase();
  const scores = new Map();
  const bump = (filePath, amount) => scores.set(filePath, (scores.get(filePath) || 0) + amount);

  for (const filePath of extractExplicitPaths(text, filePaths)) bump(filePath, 5);

  for (const group of KEYWORD_GROUPS) {
    if (!group.keywords.some((kw) => text.includes(kw))) continue;
    for (const filePath of filePaths) {
      if (group.pattern.test(filePath)) bump(filePath, 3);
    }
  }

  // Light content-level match: if the instruction names something like
  // "hero" and a component file's source defines/exports a Hero-ish
  // identifier, that's a further signal even when the filename itself
  // didn't match a keyword group above.
  for (const group of KEYWORD_GROUPS) {
    if (!group.keywords.some((kw) => text.includes(kw))) continue;
    for (const filePath of filePaths) {
      const code = fileContents[filePath] || '';
      if (group.pattern.test(code)) bump(filePath, 1);
    }
  }

  return scores;
}

/**
 * @param {string} instruction - the user's edit request (plus any error text).
 * @param {Record<string, {code: string}>} files - existing project files.
 * @param {number} maxFiles - cap on how many files' full content we send to the edit agent.
 * @returns {{ relevantPaths: string[], confident: boolean }}
 */
function identifyRelevantFiles(instruction, files, maxFiles = 6) {
  const filePaths = Object.keys(files || {});
  const fileContents = {};
  for (const filePath of filePaths) fileContents[filePath] = files[filePath]?.code || '';

  const scores = scoreFiles(instruction, filePaths, fileContents);
  const scored = filePaths.filter((p) => scores.get(p) > 0).sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0));

  if (scored.length > 0) {
    return { relevantPaths: scored.slice(0, maxFiles), confident: true };
  }

  // No confident keyword/content match -- fall back to a small structural
  // set (entry point + a few of the largest components) rather than
  // guessing wrong or sending everything. The edit agent still gets the
  // full file tree, so it can still name a file itself.
  const entry = filePaths.filter((p) => STRUCTURAL_FALLBACK_PATTERN.test(p));
  const components = filePaths
    .filter((p) => !STRUCTURAL_FALLBACK_PATTERN.test(p) && /\.(jsx?|css)$/i.test(p))
    .sort((a, b) => (fileContents[b] || '').length - (fileContents[a] || '').length)
    .slice(0, Math.max(0, maxFiles - entry.length));

  return { relevantPaths: [...entry, ...components].slice(0, maxFiles), confident: false };
}

module.exports = { identifyRelevantFiles };
