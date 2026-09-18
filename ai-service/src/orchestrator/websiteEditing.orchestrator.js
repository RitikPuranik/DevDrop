const editAgent = require('../agents/edit.agent');
const debugAgent = require('../agents/debug.agent');
const { validateGeneratedFiles } = require('../validators/generatedFiles.validator');
const { identifyRelevantFiles } = require('./relevantFiles');
const { withTimeout, stage: runStage } = require('./stageRunner');

// Single overall timeout for the entire incremental-edit pipeline
// (relevant-files detection -> edit agent -> validation/debug repair loop).
// Replaces the old per-agent/per-stage timeouts.
const EDIT_TIMEOUT_MS = Number.parseInt(process.env.WEBSITE_EDIT_TIMEOUT_MS || '300000', 10);
const MAX_EDIT_REPAIR_RETRIES = Math.max(0, Number.parseInt(process.env.MAX_EDIT_REPAIR_RETRIES || '1', 10) || 0);
const MAX_RELEVANT_FILES = Math.max(1, Number.parseInt(process.env.EDIT_MAX_RELEVANT_FILES || '6', 10) || 6);

function stage(name, fn, meta, onStage) {
  return runStage(name, fn, meta, onStage);
}

function lastUserInstruction(messages) {
  return [...(messages || [])].reverse().find((m) => m?.role === 'user')?.content || '';
}

function normalizeInput(input) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const conversation = input.conversation || messages;
  const existingFiles = input.existingFiles || input.fileData?.files || {};
  const existingDependencies = input.existingDependencies || input.fileData?.dependencies || {};
  return {
    instruction: lastUserInstruction(messages) || lastUserInstruction(conversation),
    conversation,
    files: existingFiles,
    dependencies: existingDependencies,
  };
}

function dependenciesFromPackageJson(files, fallback) {
  const code = files['/package.json']?.code;
  if (!code) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(code).dependencies || {}) };
  } catch {
    return fallback;
  }
}

async function editWebsite(input, options = {}) {
  return withTimeout(runEdit(input, options), EDIT_TIMEOUT_MS, 'website-edit');
}

async function runEdit(input, { onStage } = {}) {
  const meta = [];
  console.log('[EDIT-ORCHESTRATOR] Starting incremental edit');
  const normalized = normalizeInput(input);
  const existingPaths = Object.keys(normalized.files);

  if (existingPaths.length === 0) {
    throw Object.assign(new Error('editWebsite called with no existing project files'), {
      userMessage: 'No existing project was found to edit.',
    });
  }

  // Step 1: figure out which files are actually implicated, without calling
  // Gemini. This is the step that keeps a "fix the navbar spacing" request
  // from ever looking at, let alone regenerating, unrelated files.
  const detection = await stage(
    'relevant-files',
    async () => {
      const { relevantPaths, confident } = identifyRelevantFiles(normalized.instruction, normalized.files, MAX_RELEVANT_FILES);
      return { value: { relevantPaths, confident } };
    },
    meta,
    onStage
  );
  const relevantPaths = detection.value.relevantPaths;

  const relevantFiles = {};
  for (const p of relevantPaths) relevantFiles[p] = normalized.files[p]?.code || '';

  // Step 2: a single editing agent call -- not the full requirements/design
  // /architecture/code-gen/integration pipeline -- authoring targeted patches.
  const editResult = await stage(
    'edit',
    () => editAgent.run({
      instruction: normalized.instruction,
      conversation: normalized.conversation,
      fileTree: existingPaths,
      relevantFiles,
      dependencies: normalized.dependencies,
    }),
    meta,
    onStage
  );

  const changedPaths = new Set();
  let files = { ...normalized.files };

  for (const change of editResult.value?.changes || []) {
    if (!change?.path || typeof change.code !== 'string') continue;
    if (!Object.prototype.hasOwnProperty.call(files, change.path)) continue; // not a real edit target
    files[change.path] = { code: change.code };
    changedPaths.add(change.path);
  }
  for (const created of editResult.value?.newFiles || []) {
    if (!created?.path || typeof created.code !== 'string') continue;
    if (Object.prototype.hasOwnProperty.call(files, created.path)) {
      // Agent labeled an existing file as "new" -- treat it as a change
      // instead of silently ignoring the intent.
      files[created.path] = { code: created.code };
    } else {
      files[created.path] = { code: created.code };
    }
    changedPaths.add(created.path);
  }

  if (changedPaths.size === 0) {
    return {
      assistantMessage: editResult.value?.assistantMessage || 'No changes were necessary for that request.',
      files,
      dependencies: normalized.dependencies,
      generationMeta: { agents: meta, mode: 'edit', changedFiles: [], newFiles: [] },
    };
  }

  // Step 3: fast, local (no-LLM, no npm-install) static validation. Only if
  // that fails do we spend an extra Gemini call -- scoped to just the
  // affected files, never the whole project -- to repair it.
  for (let attempt = 0; attempt <= MAX_EDIT_REPAIR_RETRIES; attempt += 1) {
    const staticErrors = validateGeneratedFiles(files);
    if (staticErrors.length === 0) break;

    console.warn('[EDIT-VALIDATOR] static validation failed', { attempt, errors: staticErrors });
    if (attempt === MAX_EDIT_REPAIR_RETRIES) {
      throw Object.assign(new Error(staticErrors.join(' | ')), {
        userMessage: `That edit produced invalid code and could not be automatically repaired: ${staticErrors.join(' | ').slice(0, 1200)}`,
      });
    }

    const debug = await stage(
      `edit-debug:${attempt + 1}`,
      () => debugAgent.run({
        errors: staticErrors,
        affectedFiles: [...changedPaths],
        files,
        architecture: { files: existingPaths.map((path) => ({ path })) },
        requirements: {},
        design: {},
        dependencies: normalized.dependencies,
      }),
      meta,
      onStage
    );
    for (const change of debug.value?.changes || []) {
      if (change?.path && typeof change.code === 'string') {
        files[change.path] = { code: change.code };
        changedPaths.add(change.path);
      }
    }
  }

  const dependencies = dependenciesFromPackageJson(files, normalized.dependencies);

  console.log('[EDIT-ORCHESTRATOR] edit completed', { changedFiles: [...changedPaths] });
  return {
    assistantMessage: editResult.value?.assistantMessage || 'Updated the project.',
    files,
    dependencies,
    generationMeta: {
      agents: meta,
      mode: 'edit',
      changedFiles: [...changedPaths],
      relevantFilesConsidered: relevantPaths,
      relevantFilesConfident: detection.value.confident,
    },
  };
}

module.exports = { editWebsite };
