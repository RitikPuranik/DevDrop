'use strict';
/**
 * Live, truthful progress for the advanced pipeline. The snapshot is computed from real orchestrator state
 * (what has actually been written, validated, repaired). Nothing here is timer-driven.
 */
const PHASES = [
  ['requirements', 'Understanding requirements'],
  ['planning', 'Planning website architecture'],
  ['design', 'Creating design system'],
  ['shared', 'Building shared components'],
  ['pages', 'Generating pages'],
  ['modules', 'Creating supporting modules'],
  ['functionality', 'Implementing functionality'],
  ['quality', 'Running quality checks'],
  ['repair', 'Repairing detected issues'],
  ['preview', 'Preparing preview'],
];
// scheduler category -> phase
const CATEGORY_PHASE = { 'design-system': 'design', shared: 'shared', entry: 'shared', page: 'pages', module: 'modules', config: 'modules' };

function createProgress({ onChange = () => {} } = {}) {
  const phase = Object.fromEntries(PHASES.map(([id]) => [id, 'pending'])); // pending | running | done | skipped
  const state = { pages: [], files: { planned: 0, written: 0, created: 0 }, task: null, validation: {}, repair: { attempts: 0, max: 0, fixed: 0, open: 0 }, notes: [], level: null, complexity: null, architecture: { folders: [] } };
  const queued = { total: {}, done: {} };

  const snapshot = () => ({
    version: 1,
    phases: PHASES.map(([id, label]) => ({ id, label, status: phase[id] })),
    pages: state.pages.map((p) => ({ ...p })),
    pagesDone: state.pages.filter((p) => p.status === 'done').length,
    pagesTotal: state.pages.length,
    files: { ...state.files },
    folders: state.architecture.folders,
    level: state.level,
    complexity: state.complexity,
    currentTask: state.task,
    validation: { ...state.validation },
    repair: { ...state.repair },
    notes: state.notes.slice(-6),
  });
  const emit = () => onChange(snapshot());

  const api = {
    snapshot,
    start(id, task) { if (phase[id] === 'pending' || phase[id] === 'done') phase[id] = 'running'; if (task) state.task = task; emit(); },
    done(id) { phase[id] = 'done'; emit(); },
    skip(id) { phase[id] = 'skipped'; emit(); },
    task(text) { state.task = text; emit(); },
    setPages(pages) { state.pages = pages.map((p) => ({ id: p.id, title: p.title, path: p.path, status: 'planned', recommended: Boolean(p.recommended) })); emit(); },
    setPageStatus(id, status) { const p = state.pages.find((x) => x.id === id); if (p) { p.status = status; emit(); } },
    setLevel(level) { state.level = level || null; emit(); },
    setArchitecture({ folders, complexity }) { state.architecture.folders = folders; state.complexity = complexity || state.complexity; emit(); },
    planFiles(contracts) { queued.total = {}; for (const c of contracts) { const ph = CATEGORY_PHASE[c.category] || 'shared'; queued.total[ph] = (queued.total[ph] || 0) + 1; } state.files.planned = contracts.length; emit(); },
    addFile(contract) { const ph = CATEGORY_PHASE[contract.category] || 'shared'; queued.total[ph] = (queued.total[ph] || 0) + 1; state.files.planned += 1; state.files.created += 1; if (phase[ph] === 'done') phase[ph] = 'running'; emit(); },
    fileStarted(contract) { const ph = CATEGORY_PHASE[contract.category] || 'shared'; if (phase[ph] === 'pending') phase[ph] = 'running'; if (contract.pageId) api.setPageStatus(contract.pageId, 'building'); state.task = `Writing ${contract.path}`; emit(); },
    fileFinished(contract) {
      const ph = CATEGORY_PHASE[contract.category] || 'shared';
      queued.done[ph] = (queued.done[ph] || 0) + 1; state.files.written += 1;
      if ((queued.done[ph] || 0) >= (queued.total[ph] || 0)) phase[ph] = 'done';
      if (contract.pageId) api.setPageStatus(contract.pageId, 'done');
      emit();
    },
    closeEmptyGeneratingPhases() { for (const id of ['design', 'shared', 'pages', 'modules']) if (phase[id] === 'pending' || phase[id] === 'running') phase[id] = 'done'; emit(); },
    validation(layer, status) { state.validation[layer] = status; emit(); },
    repairState(patch) { Object.assign(state.repair, patch); emit(); },
    note(text) { state.notes.push(String(text).slice(0, 200)); emit(); },
  };
  return api;
}
module.exports = { createProgress, PHASES };
