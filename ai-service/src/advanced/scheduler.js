'use strict';
/**
 * Dependency-aware scheduling with controlled parallelism.
 * Files are grouped into waves: a file runs only after every file it imports (that is part of the plan) is written.
 * Inside a wave up to `parallelism` workers run at once, each owning exactly one path, so edits never conflict.
 * New work discovered while running (files a worker asks for) joins the queue and is scheduled the same way.
 */
function createScheduler({ contracts = [], parallelism = 3 } = {}) {
  const items = new Map(); // path -> { contract, state: pending|running|done|failed }
  const add = (c) => { if (!items.has(c.path)) { items.set(c.path, { contract: c, state: 'pending' }); return true; } return false; };
  contracts.forEach(add);

  const deps = (c) => (c.imports || []).filter((i) => items.has(i) && i !== c.path);
  const ready = () => [...items.values()].filter((x) => x.state === 'pending' && deps(x.contract).every((d) => items.get(d).state === 'done' || items.get(d).state === 'failed'));

  // Cycles: nothing is ready but work is pending. Release the pending file with the fewest unmet dependencies.
  const breakCycle = () => {
    const pending = [...items.values()].filter((x) => x.state === 'pending');
    if (!pending.length) return [];
    pending.sort((a, b) => deps(a.contract).filter((d) => items.get(d).state === 'pending').length - deps(b.contract).filter((d) => items.get(d).state === 'pending').length);
    return [pending[0]];
  };

  /** Runs worker(contract) for every item. worker may call scheduler.add() for new files. Stops early when shouldStop() is true. */
  async function run(worker, { shouldStop = () => false } = {}) {
    const running = new Set();
    const launch = (item) => {
      item.state = 'running';
      const p = Promise.resolve().then(() => worker(item.contract)).then(
        () => { item.state = 'done'; },
        (e) => { item.state = 'failed'; item.error = e; if (e?.fatal) fatal = e; },
      ).finally(() => running.delete(p));
      running.add(p);
    };
    let fatal = null;
    for (;;) {
      if (fatal || shouldStop()) break;
      let batch = ready();
      if (!batch.length && !running.size) batch = breakCycle();
      for (const item of batch) { if (running.size >= parallelism) break; launch(item); }
      if (!running.size) break;
      await Promise.race(running);
    }
    await Promise.allSettled([...running]);
    if (fatal) throw fatal;
  }

  return {
    add,
    run,
    get: (p) => items.get(p),
    all: () => [...items.values()].map((x) => ({ path: x.contract.path, category: x.contract.category, state: x.state })),
    contracts: () => [...items.values()].map((x) => x.contract),
    markDone: (p) => { const x = items.get(p); if (x) x.state = 'done'; },
    failed: () => [...items.values()].filter((x) => x.state === 'failed').map((x) => ({ path: x.contract.path, error: x.error })),
    /** Wave grouping for display/tests (does not execute anything). */
    waves() {
      const done = new Set(); const waves = []; let left = [...items.values()];
      while (left.length) {
        let wave = left.filter((x) => (x.contract.imports || []).filter((i) => items.has(i) && i !== x.contract.path).every((d) => done.has(d)));
        if (!wave.length) wave = [left[0]];
        waves.push(wave.map((x) => x.contract.path)); wave.forEach((x) => done.add(x.contract.path)); left = left.filter((x) => !wave.includes(x));
      }
      return waves;
    },
  };
}
module.exports = { createScheduler };
