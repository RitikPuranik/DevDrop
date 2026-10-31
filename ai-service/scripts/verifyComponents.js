#!/usr/bin/env node
'use strict';
// Release gate for the catalog: integrity (sha256) of every stored file, then a REAL production build (npm install +
// vite build, via the same build validator generation uses) of every eligible component mounted in one project.
const { getDefaultStore } = require('../src/components/store');
const { createSearch } = require('../src/components/search');
const { resolve } = require('../src/components/dependencyResolver');
const { CN_SOURCE } = require('../src/components/composition');
const buildValidator = require('../src/validators/build.validator');
(async () => {
  const store = getDefaultStore();
  const bad = store.verifyAll(); if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
  const modes = (process.argv.find((a) => a.startsWith('--modes=')) || '--modes=deployedWebsites,sourceCodeExport').split('=')[1].split(',');
  const search = createSearch(store, { requiredModes: modes });
  const ids = store.all().filter((r) => !search.excluded.find((e) => e.componentId === r.componentId)).map((r) => r.componentId);
  const records = ids.map((id) => store.get(id));
  const dep = resolve(records.filter((r) => !/slider|accordion/.test(r.componentId) || true), {}, { maxHeavy: 9, maxNewDependencies: 99 });
  const files = { '/lib/utils.js': { code: CN_SOURCE } }; const imports = []; const uses = [];
  for (const id of dep.accepted) {
    const s = store.source(id); const r = s.record;
    files[r.storage.target] = { code: s.code }; if (s.css) files[r.storage.targetCss] = { code: s.css };
    const names = [...s.code.matchAll(/export\s+(?:default\s+)?(?:function|const)\s+([A-Z]\w*)|export\s*\{([^}]+)\}/g)].flatMap((m) => m[1] ? [m[1]] : m[2].split(',').map((x) => x.trim().split(/\s+as\s+/).pop())).filter((n) => /^[A-Z]/.test(n));
    const local = `C${imports.length}`; imports.push(`import * as ${local} from '.${r.storage.target}';`); uses.push(`${local}:${JSON.stringify(names)}`);
  }
  files['/App.js'] = { code: `${imports.join('\n')}\nconst all = [${dep.accepted.map((_, i) => `C${i}`).join(',')}];\nexport default function App(){ return <main>{all.length} components loaded</main>; }\n` };
  console.log(`[verify] building ${dep.accepted.length} components; skipped by dependency policy:`, dep.rejected.map((r) => `${r.componentId} (${r.reason})`));
  const res = await buildValidator.run({ files, dependencies: dep.added });
  console.log(res.success ? '[verify] BUILD OK' : `[verify] BUILD FAILED\n${(res.errors || []).join('\n').slice(0, 3000)}`);
  process.exit(res.success ? 0 : 1);
})();
