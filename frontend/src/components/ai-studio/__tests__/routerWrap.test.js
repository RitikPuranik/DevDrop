import { describe, it, expect } from 'vitest';
import { applyPreviewRouter, neutralizeRouterComponents, siteNeedsRouterWrapper } from '../routerWrap';

const header = { code: `import { useLocation, Link } from 'react-router-dom';\nexport default function Header(){ const l = useLocation(); return <Link to="/">{l.pathname}</Link>; }` };

describe('preview Router handling', () => {
  it('adds an entry that supplies the Router when nothing renders one', () => {
    const files = applyPreviewRouter({ '/App.js': { code: `import Header from './components/Header.jsx'; export default function App(){return <Header />}` }, '/components/Header.jsx': header });
    expect(files['/index.js'].code).toContain('<BrowserRouter><App /></BrowserRouter>');
  });

  it('turns an App-level BrowserRouter into a pass-through so Header outside it still has a Router', () => {
    const app = `import { BrowserRouter, Routes, Route } from 'react-router-dom';\nimport Header from './components/Header.jsx';\nexport default function App(){return <><Header /><BrowserRouter><Routes><Route path="/" element={<div/>} /></Routes></BrowserRouter></>}`;
    const files = applyPreviewRouter({ '/App.js': { code: app }, '/components/Header.jsx': header });
    expect(files['/App.js'].code).toContain("import { Routes, Route } from 'react-router-dom';");
    expect(files['/App.js'].code).toContain('const BrowserRouter = ({ children }) => <>{children}</>;');
    expect(files['/index.js'].code).toContain('<BrowserRouter><App /></BrowserRouter>');
  });

  it('handles aliased imports and drops an import that becomes empty', () => {
    const out = neutralizeRouterComponents(`import { BrowserRouter as Router } from "react-router-dom";\nexport default () => <Router />;`);
    expect(out).not.toContain('import {');
    expect(out).toContain('const Router = ({ children }) => <>{children}</>;');
  });

  it('leaves data-router sites and sites without react-router alone', () => {
    const data = { '/App.js': { code: `import { createBrowserRouter, RouterProvider } from 'react-router-dom'; export default () => <RouterProvider router={createBrowserRouter([])} />;` } };
    expect(siteNeedsRouterWrapper(data)).toBe(false);
    expect(applyPreviewRouter(data)['/index.js']).toBeUndefined();
    expect(applyPreviewRouter({ '/App.js': { code: 'export default () => null;' } })['/index.js']).toBeUndefined();
  });
});
