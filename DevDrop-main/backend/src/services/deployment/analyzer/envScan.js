// Patterns for how a project might reference an environment variable.
// Kept broad on purpose — false positives just mean one extra row in the
// "configure your environment" form, which is cheap; false negatives mean a
// deployment fails at runtime with a missing variable, which is expensive.
const ENV_REFERENCE_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g, // process.env.DATABASE_URL
  /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g, // process.env['DATABASE_URL']
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g, // Vite: import.meta.env.VITE_API_URL
  /os\.environ(?:\.get)?\(['"]([A-Z][A-Z0-9_]*)['"]/g, // Python: os.environ.get("DATABASE_URL")
  /os\.environ\[['"]([A-Z][A-Z0-9_]*)['"]\]/g, // Python: os.environ["DATABASE_URL"]
];

/** Names that are runtime/framework plumbing, not something a buyer should
 * ever be asked to fill in — filtered out entirely rather than surfaced. */
const IGNORED_VAR_NAMES = new Set(['NODE_OPTIONS', 'npm_package_version', 'PATH', 'HOME', 'PWD']);

/**
 * Scans a set of already-fetched files for environment-variable references.
 * Pure function — no I/O — so the fetching/budgeting policy (which files,
 * how many) lives in analyzer/index.js and this just does text extraction.
 *
 * @param {{ path: string, content: string }[]} files
 * @returns {string[]} unique variable names, in first-seen order
 */
const scanForEnvVarNames = (files) => {
  const found = new Set();

  for (const file of files) {
    if (!file.content) continue;
    for (const pattern of ENV_REFERENCE_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(file.content);
      while (match) {
        const name = match[1];
        if (name && !IGNORED_VAR_NAMES.has(name)) found.add(name);
        match = pattern.exec(file.content);
      }
    }
  }

  return Array.from(found);
};

/**
 * Parses a .env.example / .env.sample file's KEY=... lines. More reliable
 * than source scanning when present, since the project's own author already
 * enumerated exactly what's needed.
 */
const parseEnvExampleKeys = (content) => {
  if (!content) return [];
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      return match ? match[1].toUpperCase() : null;
    })
    .filter(Boolean);
};

// Backend variable names DevDrop fills in automatically once the frontend's
// URL is known — never shown to the buyer as something to type in.
const AUTO_BACKEND_URL_VAR_NAMES = new Set(['FRONTEND_URL', 'FRONTEND_ORIGIN', 'CORS_ORIGIN', 'ALLOWED_ORIGIN', 'CLIENT_URL']);

// Frontend variable *name shapes* that mean "the deployed backend's URL" —
// matched by pattern rather than an exact list, since projects prefix these
// differently (VITE_, NEXT_PUBLIC_, REACT_APP_, ...).
const AUTO_FRONTEND_URL_VAR_PATTERN = /^(VITE_|NEXT_PUBLIC_|REACT_APP_)?(API_URL|BACKEND_URL|SERVER_URL)$/;

const ALWAYS_AUTO_VAR_NAMES = new Set(['NODE_ENV', 'PORT']);

/**
 * Classifies one detected variable name for a given side of the app into
 * { source: 'auto' | 'user', autoRole?: 'frontend-url' | 'backend-url' | 'static' }.
 */
const classifyEnvVar = (name, target) => {
  if (ALWAYS_AUTO_VAR_NAMES.has(name)) return { source: 'auto', autoRole: 'static' };
  if (target === 'backend' && AUTO_BACKEND_URL_VAR_NAMES.has(name)) return { source: 'auto', autoRole: 'frontend-url' };
  if (target === 'frontend' && AUTO_FRONTEND_URL_VAR_PATTERN.test(name)) return { source: 'auto', autoRole: 'backend-url' };
  return { source: 'user' };
};

module.exports = {
  scanForEnvVarNames,
  parseEnvExampleKeys,
  classifyEnvVar,
  AUTO_BACKEND_URL_VAR_NAMES,
  AUTO_FRONTEND_URL_VAR_PATTERN,
};
