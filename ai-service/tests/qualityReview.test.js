const { reviewGeneratedSite } = require('../src/validators/quality.review');
const { buildDesignSpec } = require('../src/design/designIntelligence');

const files = (code, extra = {}) => ({ '/index.html': { code: '<!doctype html><meta name="viewport" content="width=device-width"><script src="https://cdn.tailwindcss.com"></script><div id="root"></div>' }, '/App.js': { code }, ...extra });
const rules = (r) => r.findings.map((f) => f.rule);
const GOOD = 'export default function App(){return <div><header><nav>n</nav></header><main><h1>Hi</h1><img src="a.jpg" alt="A"/><label htmlFor="e">Email</label><input id="e"/><button aria-label="Close" onClick={close}><svg/></button><a href="https://x" target="_blank" rel="noopener noreferrer">x</a></main><footer>f</footer></div>}';

describe('accessibility and semantics', () => {
  it('passes a well-formed site', () => {
    const r = reviewGeneratedSite({ files: files(GOOD) });
    expect(r.summary).toEqual({ errors: 0, warnings: 0, infos: 0, total: 0, functional: 0 });
  });
  it.each([
    ['img-alt', '<main><h1>x</h1><img src="a"/></main>'],
    ['icon-button-name', '<main><h1>x</h1><button onClick={go}><svg/></button></main>'],
    ['non-semantic-click', '<main><h1>x</h1><div onClick={go}>go</div></main>'],
    ['form-control-label', '<main><h1>x</h1><input type="text"/></main>'],
    ['blank-target-rel', '<main><h1>x</h1><a href="https://x" target="_blank">x</a></main>'],
    ['landmark-main', '<div><h1>x</h1></div>'],
    ['heading-h1', '<main><h2>x</h2></main>'],
  ])('flags %s', (rule, jsx) => expect(rules(reviewGeneratedSite({ files: files(`export default function App(){return ${jsx}}`) }))).toContain(rule));
  it('treats an input wrapped in a label as labelled', () => {
    expect(rules(reviewGeneratedSite({ files: files('export default function App(){return <main><h1>x</h1><label>Name <input/></label></main>}') }))).not.toContain('form-control-label');
  });
  it('flags a missing viewport meta and fixed widths', () => {
    const r = reviewGeneratedSite({ files: { '/index.html': { code: '<div id="root"></div>' }, '/App.js': { code: GOOD }, '/index.css': { code: '.hero{width:1200px}' } } });
    expect(rules(r)).toEqual(expect.arrayContaining(['viewport-meta', 'fixed-width']));
  });
});

describe('motion and focus', () => {
  it('requires reduced-motion handling when animating', () => {
    expect(rules(reviewGeneratedSite({ files: files(GOOD, { '/index.css': { code: '@keyframes spin{to{transform:rotate(1turn)}}' } }) }))).toContain('reduced-motion');
    expect(rules(reviewGeneratedSite({ files: files(GOOD, { '/index.css': { code: '@keyframes spin{to{transform:rotate(1turn)}} @media (prefers-reduced-motion: reduce){*{animation:none}}' } }) }))).not.toContain('reduced-motion');
  });
  it('flags removed focus outlines without a replacement, and transition: all', () => {
    expect(rules(reviewGeneratedSite({ files: files(GOOD, { '/a.css': { code: 'button{outline:none}' } }) }))).toContain('focus-outline-removed');
    expect(rules(reviewGeneratedSite({ files: files(GOOD, { '/a.css': { code: 'button{outline:none} button:focus-visible{outline:2px solid red}' } }) }))).not.toContain('focus-outline-removed');
    expect(rules(reviewGeneratedSite({ files: files(GOOD, { '/a.css': { code: 'a{transition:all .2s}' } }) }))).toContain('transition-all');
  });
});

describe('generated-code safety', () => {
  const errs = (code, extra) => reviewGeneratedSite({ files: files(code, extra) }).findings.filter((f) => f.severity === 'error').map((f) => f.rule);
  it('flags eval, new Function, document.write and string timers', () => {
    expect(errs('export default function App(){eval("1");return <main><h1>x</h1></main>}')).toEqual(['unsafe-api']);
    expect(errs('export default function App(){new Function("return 1");return <main><h1>x</h1></main>}')).toEqual(['unsafe-api']);
    expect(errs('export default function App(){document.write("x");return <main><h1>x</h1></main>}')).toEqual(['unsafe-api']);
    expect(errs('export default function App(){setTimeout("x()",5);return <main><h1>x</h1></main>}')).toEqual(['unsafe-api']);
  });
  it('flags dynamic HTML injection but only notes literals', () => {
    expect(errs('export default function App({h}){return <main><h1>x</h1><div dangerouslySetInnerHTML={{__html:h}}/></main>}')).toEqual(['dangerous-html']);
    const lit = reviewGeneratedSite({ files: files('export default function App(){return <main><h1>x</h1><div dangerouslySetInnerHTML={{__html:"<b>x</b>"}}/></main>}') });
    expect(rules(lit)).toContain('dangerous-html-static');
    expect(lit.summary.errors).toBe(0);
  });
  it('blocks external scripts but allows the scaffold Tailwind CDN', () => {
    expect(errs(GOOD, { '/index.html': { code: '<meta name="viewport" content="x"><script src="https://evil.example/t.js"></script>' } })).toEqual(['external-script']);
    expect(errs(GOOD)).toEqual([]);
    expect(errs('export default function App(){const s=document.createElement("script");return <main><h1>x</h1></main>}')).toEqual(['external-script']);
    expect(errs('export default function App(){return <main><h1>x</h1><script src="https://evil.example/a.js"/></main>}')).toEqual(['external-script']);
  });
  it('warns on external network calls and iframes', () => {
    const r = reviewGeneratedSite({ files: files('export default function App(){fetch("https://api.evil.example/x");new WebSocket("wss://x.example");return <main><h1>x</h1><iframe src="https://x.example"/></main>}') });
    expect(rules(r)).toEqual(expect.arrayContaining(['external-network', 'external-iframe']));
    expect(r.summary.errors).toBe(0);
  });
  it('does not flag same-origin fetches', () => {
    expect(rules(reviewGeneratedSite({ files: files('export default function App(){fetch("/data.json");return <main><h1>x</h1></main>}') }))).not.toContain('external-network');
  });
  it('produces blocking strings only for errors and ignores unparsable files', () => {
    const r = reviewGeneratedSite({ files: files('export default function App(){eval("x");return <main><h1>x</h1></main>}', { '/Broken.js': { code: 'export default (' } }) });
    expect(r.blocking).toHaveLength(1);
    expect(r.blocking[0]).toMatch(/^SAFETY REVIEW \[unsafe-api\] \/App\.js:1/);
  });
});

describe('design spec consistency', () => {
  const spec = buildDesignSpec({ websiteType: 'cafe', preferences: { theme: 'warm', primaryColor: '#9c684a' } });
  it('warns when none of the spec palette reaches the code', () => {
    expect(rules(reviewGeneratedSite({ files: files(GOOD), designSpec: spec }))).toContain('spec-palette-unused');
  });
  it('is satisfied when tokens carry the spec palette', () => {
    const css = `:root{--accent:${spec.palette.accent};--bg:${spec.palette.background}}`;
    const r = reviewGeneratedSite({ files: files(GOOD, { '/index.css': { code: css } }), designSpec: spec });
    expect(rules(r)).not.toContain('spec-palette-unused');
    expect(rules(r)).not.toContain('spec-tokens-missing');
  });
});

describe('dead controls (buttons and links that do nothing)', () => {
  const run = (jsx, extra) => reviewGeneratedSite({ files: files(`export default function App(){return <main><h1>x</h1>${jsx}</main>}`, extra) });
  const functional = (r) => r.findings.filter((f) => f.category === 'functional').map((f) => f.rule);
  it('flags a button with no handler and names its label for the repair agent', () => {
    const r = run('<button>Book a table</button>');
    expect(functional(r)).toEqual(['dead-button']);
    expect(r.functional[0]).toMatch(/^DEAD CONTROL \[dead-button\] \/App\.js:1: <button> "Book a table"/);
    expect(r.summary.functional).toBe(1);
  });
  it('flags empty handlers, but accepts real handlers, submit buttons in forms, disabled buttons and spread props', () => {
    expect(functional(run('<button onClick={() => {}}>x</button>'))).toEqual(['dead-button']);
    expect(functional(run('<button onClick={go}>x</button>'))).toEqual([]);
    expect(functional(run('<form onSubmit={s}><button>Send</button></form>'))).toEqual([]);
    expect(functional(run('<button disabled>x</button>'))).toEqual([]);
    expect(functional(run('<button {...rest}>x</button>'))).toEqual([]);
  });
  it('flags custom Button components used without any behaviour', () => {
    expect(functional(run('<PrimaryButton>Go</PrimaryButton>'))).toEqual(['dead-button']);
    expect(functional(run('<PrimaryButton onClick={go}>Go</PrimaryButton>'))).toEqual([]);
    expect(functional(run('<Button href="#menu">Go</Button><section id="menu"/>'))).toEqual([]);
  });
  it('flags dead links and anchors that point at missing sections', () => {
    expect(functional(run('<a href="#">x</a>'))).toEqual(['dead-link']);
    expect(functional(run('<a>x</a>'))).toEqual(['dead-link']);
    expect(functional(run('<a href="#menu">Menu</a>'))).toEqual(['broken-anchor']);
    expect(functional(run('<a href="#menu">Menu</a><section id="menu"/>'))).toEqual([]);
    expect(functional(run('<a href="#menu">Menu</a>', { '/Menu.js': { code: 'export default ()=> <section id="menu"/>' } }))).toEqual([]);
    expect(functional(run('<button onClick={() => document.getElementById("gone").scrollIntoView()}>Go</button>'))).toEqual(['broken-anchor']);
  });
  it('flags forms with no submit handler', () => expect(functional(run('<form><input aria-label="e"/></form>'))).toEqual(['form-no-handler']));
  it('does not treat accessibility or safety findings as functional', () => {
    expect(functional(run('<img src="a"/><a href="https://x" target="_blank">x</a>'))).toEqual([]);
  });
});

describe('motion and interactivity vs the design spec', () => {
  const spec = (animations) => buildDesignSpec({ websiteType: 'cafe', preferences: { animations } });
  const body = 'export default function App(){return <main><h1>x</h1></main>}';
  it('warns when motion is requested but the site is static', () => {
    const r = reviewGeneratedSite({ files: files(body), designSpec: spec('scroll') });
    expect(r.findings.map((f) => f.rule)).toEqual(expect.arrayContaining(['no-motion', 'no-interactivity']));
  });
  it('is satisfied by transitions/observers and state', () => {
    const code = 'import {useState} from "react"; export default function App(){const [o,setO]=useState(false);return <main><h1>x</h1><button className="transition hover:scale-105" onClick={()=>setO(!o)}>t</button></main>}';
    const r = reviewGeneratedSite({ files: files(code, { '/a.css': { code: '@media (prefers-reduced-motion: reduce){*{animation:none}}' } }), designSpec: spec('scroll') });
    expect(r.findings.map((f) => f.rule)).not.toEqual(expect.arrayContaining(['no-motion']));
    expect(r.findings.map((f) => f.rule)).not.toContain('no-interactivity');
  });
  it('does not demand motion when the user chose none', () => {
    expect(reviewGeneratedSite({ files: files(body), designSpec: spec('none') }).findings.map((f) => f.rule)).not.toContain('no-motion');
  });
});
