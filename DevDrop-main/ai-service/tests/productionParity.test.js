const { applyProductionParity, pinDependencies, scanProductionRisks, usesTailwindClasses } = require('../src/utils/productionParity');
const { withScaffold } = require('../src/validators/build.validator');

const tw = { code: 'export default function App(){return <div className="flex items-center gap-4 px-6 py-3 text-lg rounded-xl bg-gray-900"><p className="text-sm font-bold">Hi</p></div>}' };
const html = '<!doctype html><html><head><title>x</title></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>';

describe('Tailwind parity (preview always loads the CDN)', () => {
  test('detects tailwind utility usage', () => {
    expect(usesTailwindClasses({ '/App.js': tw })).toBe(true);
    expect(usesTailwindClasses({ '/App.js': { code: 'export default ()=> <div className="hero">x</div>' } })).toBe(false);
  });
  test('injects the CDN into a model-written index.html, once', () => {
    const first = applyProductionParity({ '/App.js': tw, '/index.html': { code: html } });
    expect(first.files['/index.html'].code).toContain('cdn.tailwindcss.com');
    expect(first.applied).toHaveLength(1);
    const second = applyProductionParity(first.files);
    expect(second.applied).toHaveLength(0);
    expect(second.files['/index.html'].code.match(/cdn\.tailwindcss\.com/g)).toHaveLength(1);
  });
  test('does nothing when tailwind is installed as a dependency or classes are absent', () => {
    expect(applyProductionParity({ '/App.js': tw, '/index.html': { code: html } }, { tailwindcss: '^3.4.0' }).applied).toHaveLength(0);
    expect(applyProductionParity({ '/App.js': { code: 'export default ()=>null' }, '/index.html': { code: html } }).applied).toHaveLength(0);
  });
});

describe('pinDependencies', () => {
  const pkg = (deps) => ({ '/package.json': { code: JSON.stringify({ name: 'x', dependencies: deps, devDependencies: { vite: '^7.0.0' } }) } });
  test('freezes runtime deps to the validated versions and leaves devDependencies alone', () => {
    const { files, pinned } = pinDependencies(pkg({ react: '^19.0.0', 'lucide-react': 'latest' }), { react: '19.1.2', 'lucide-react': '0.468.0' });
    const out = JSON.parse(files['/package.json'].code);
    expect(pinned).toBe(2);
    expect(out.dependencies).toEqual({ react: '19.1.2', 'lucide-react': '0.468.0' });
    expect(out.devDependencies.vite).toBe('^7.0.0');
  });
  test('is a no-op without resolved versions or when nothing changes', () => {
    const input = pkg({ react: '^19.0.0' });
    expect(pinDependencies(input, null).files).toBe(input);
    expect(pinDependencies(pkg({ react: '19.1.2' }), { react: '19.1.2' }).pinned).toBe(0);
  });
});

describe('scanProductionRisks', () => {
  const ids = (files) => scanProductionRisks(files).map((f) => f.id);
  test('flags process.env, import.meta.env, localhost and missing assets', () => {
    const files = {
      '/App.js': { code: [
        'const k = process.env.REACT_APP_KEY;',
        'const v = import.meta.env.VITE_API;',
        'fetch("http://localhost:5000/api/items");',
        'export default function App(){return <img src="/images/hero.png" />}',
      ].join('\n') },
    };
    expect(ids(files)).toEqual(expect.arrayContaining(['process-env', 'import-meta-env', 'localhost-url', 'missing-asset']));
  });
  test('ignores NODE_ENV, MODE/DEV/PROD, real project assets, favicon and remote URLs', () => {
    const files = {
      '/App.js': { code: 'if (process.env.NODE_ENV === "production" && import.meta.env.PROD) {}\nexport default ()=> <div><img src="/logo.svg"/><img src="https://x.com/a.png"/><link href="/favicon.svg"/></div>' },
      '/public/logo.svg': { code: '<svg/>' },
    };
    expect(ids(files)).toEqual([]);
  });
  test('reports signed storage URLs as an export concern, not an agent task', () => {
    const f = scanProductionRisks({ '/App.js': { code: 'const u="https://x.supabase.co/storage/v1/object/sign/b/assets/1/a.png?token=t"' } });
    expect(f).toEqual([expect.objectContaining({ id: 'signed-asset-url', fixBy: 'export' })]);
  });
});

describe('build scaffold matches what the export ships to Vercel', () => {
  const files = withScaffold({ '/App.js': { code: 'export default ()=>null' }, '/package.json': { code: JSON.stringify({ name: 'x', dependencies: {}, devDependencies: { vite: '^5.0.0' } }) } }, {});
  test('vercel.json, engines and forced vite pins', () => {
    expect(JSON.parse(files['/vercel.json'].code).rewrites[0].destination).toBe('/index.html');
    const pkg = JSON.parse(files['/package.json'].code);
    expect(pkg.engines.node).toBe('22.x');
    expect(pkg.devDependencies.vite).toBe('^7.0.0');
  });
  test('default index.html loads the Tailwind CDN like the preview', () => {
    expect(withScaffold({}, {})['/index.html'].code).toContain('cdn.tailwindcss.com');
  });
});
