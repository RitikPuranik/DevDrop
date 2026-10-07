const { withScaffold } = require('../src/validators/build.validator');

it('injects a default vite.config.js that transforms .js files as jsx', () => {
  const files = withScaffold({ '/App.js': { code: 'export default function App(){return null;}' } }, {});

  expect(files['/vite.config.js']).toBeTruthy();
  expect(files['/vite.config.js'].code).toMatch(/transformWithEsbuild/);
  expect(files['/vite.config.js'].code).toMatch(/loader:\s*'jsx'/);
  expect(files['/vite.config.js'].code).toMatch(/'\.js':\s*'jsx'/);
});

it('does not override a vite.config.js the pipeline already produced', () => {
  const custom = { code: 'export default { plugins: [] } // custom' };
  const files = withScaffold({ '/vite.config.js': custom }, {});

  expect(files['/vite.config.js']).toBe(custom);
});

it('still fills in package.json, index.html and main.jsx when missing', () => {
  const files = withScaffold({}, { lodash: '^4.17.0' });

  expect(JSON.parse(files['/package.json'].code).dependencies.lodash).toBe('^4.17.0');
  expect(files['/index.html'].code).toContain('<div id="root">');
  expect(files['/main.jsx'].code).toContain('createRoot');
});

it('does not mutate the files object it was given', () => {
  const input = { '/App.js': { code: 'export default function App(){return null;}' } };
  withScaffold(input, {});

  expect(Object.keys(input)).toEqual(['/App.js']);
});

it('ships an .npmrc so Vercel installs with the same peer-dependency rule as the preview', () => {
  const files = withScaffold({ '/App.js': { code: 'export default function App(){return null;}' } }, {});

  expect(files['/.npmrc'].code).toMatch(/legacy-peer-deps=true/);
});

it('does not override an .npmrc the pipeline already produced', () => {
  const custom = { code: 'registry=https://example.invalid/\n' };
  expect(withScaffold({ '/.npmrc': custom }, {})['/.npmrc']).toBe(custom);
});


const { validateGeneratedFiles } = require('../src/validators/generatedFiles.validator');

test('static validation rejects an undefined JSX component before deployment', () => {
  const files = {
    '/App.js': { code: `import Home from './src/pages/marketing/Home.jsx'; export default function App(){return <Home />}` },
    '/src/pages/marketing/Home.jsx': { code: `export default function Home(){return <main><TestimonialsSection /></main>}` },
  };
  expect(validateGeneratedFiles(files)).toEqual(expect.arrayContaining([expect.stringContaining('TestimonialsSection') ]));
});
