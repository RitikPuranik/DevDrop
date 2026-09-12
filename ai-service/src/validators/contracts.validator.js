function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function validateRequirements(value) {
  object(value, 'requirements');
  for (const key of [
    'websiteType',
    'goal',
    'pages',
    'sections',
    'contentRequirements',
    'features',
    'userData',
    'constraints',
    'assets',
  ]) {
    if (!(key in value)) throw new Error(`requirements.${key} is missing`);
  }
  if (value.websiteType !== 'portfolio') {
    throw new Error(`Unsupported website type: ${value.websiteType}`);
  }
  return value;
}

function validateDesign(value) {
  object(value, 'design');
  object(value.designSystem, 'design.designSystem');
  for (const key of [
    'style',
    'theme',
    'colors',
    'typography',
    'spacing',
    'borderRadius',
    'componentStyle',
    'layoutStrategy',
    'responsiveStrategy',
    'animationStrategy',
  ]) {
    if (!(key in value.designSystem)) throw new Error(`designSystem.${key} is missing`);
  }
  return value;
}

function normalizeArchitecturePath(path) {
  if (typeof path !== 'string') return path;
  const normalized = `/${path.replace(/^\/+/, '')}`;

  // DevDrop's downstream pipeline uses /App.js as its canonical entry component.
  if (/^\/src\/App\.(jsx|js)$/i.test(normalized) || /^\/App\.jsx$/i.test(normalized)) {
    return '/App.js';
  }

  return normalized;
}

function validateArchitecture(value) {
  object(value, 'architecture');
  object(value.project, 'architecture.project');

  if (value.project.framework !== 'react-vite' || value.project.language !== 'javascript') {
    throw new Error('Architecture must use React + Vite + JavaScript');
  }

  if (!Array.isArray(value.files) || !value.files.length) {
    throw new Error('Architecture files are required');
  }

  const originalPaths = new Map();
  const paths = new Set();
  const files = [];

  for (const file of value.files) {
    if (!file || typeof file !== 'object') {
      throw new Error('Architecture contains an invalid file contract');
    }

    const originalPath = file.path;
    const path = normalizeArchitecturePath(originalPath);

    if (!path || typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error(`Invalid architecture path: ${originalPath}`);
    }

    if (/\.tsx?$/i.test(path)) {
      throw new Error(`TypeScript is not supported: ${path}`);
    }

    if (paths.has(path)) {
      // Gemini occasionally emits the same root file twice. Keep the first
      // contract instead of failing an otherwise usable architecture.
      console.warn(`[VALIDATOR] Ignoring duplicate architecture path: ${path}`);
      continue;
    }

    const normalizedFile = { ...file, path };
    paths.add(path);
    originalPaths.set(originalPath, path);
    files.push(normalizedFile);
  }

  // Keep architecture imports consistent if Gemini used a non-canonical App path.
  for (const file of files) {
    if (Array.isArray(file.imports)) {
      file.imports = file.imports.map((importPath) => originalPaths.get(importPath) || normalizeArchitecturePath(importPath));
    }
  }

  // The code-generation pipeline requires a canonical App entry. If Gemini
  // forgot it, add the contract rather than aborting the entire generation.
  if (!paths.has('/App.js')) {
    files.push({
      path: '/App.js',
      type: 'component',
      responsibility: 'Main portfolio application entry component.',
      exports: ['default'],
      imports: [],
    });
    paths.add('/App.js');
    console.warn('[VALIDATOR] Architecture omitted /App.js; added canonical App.js contract.');
  }

  return { ...value, files };
}

module.exports = { validateRequirements, validateDesign, validateArchitecture };
