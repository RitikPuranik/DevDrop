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
