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

describe('Router wrapper for generated sites', () => {
  const header = { code: `import { useLocation, Link } from 'react-router-dom'; export default function Header(){ const l = useLocation(); return <Link to="/">{l.pathname}</Link>; }` };

  it('wraps the app in BrowserRouter when components use router hooks but nothing renders a Router', () => {
    const files = withScaffold({
      '/App.js': { code: `import Header from './components/Header.jsx'; export default function App(){return <Header />}` },
      '/components/Header.jsx': header,
    }, {});

    expect(files['/main.jsx'].code).toContain('<BrowserRouter><App /></BrowserRouter>');
    expect(JSON.parse(files['/package.json'].code).dependencies['react-router-dom']).toBeTruthy();
  });

  it('does not add a second Router when the site already renders one', () => {
    const files = withScaffold({
      '/App.js': { code: `import { BrowserRouter } from 'react-router-dom'; import Header from './components/Header.jsx'; export default function App(){return <BrowserRouter><Header /></BrowserRouter>}` },
      '/components/Header.jsx': header,
    }, {});

    expect(files['/main.jsx'].code).not.toContain('BrowserRouter');
  });

  it('keeps the plain entry when the site does not use react-router', () => {
    const files = withScaffold({ '/App.js': { code: 'export default function App(){return null;}' } }, {});

    expect(files['/main.jsx'].code).not.toContain('BrowserRouter');
  });
});
