const { identifyRelevantFiles } = require('../src/orchestrator/relevantFiles');

const FILES = {
  '/App.js': { code: 'import Navbar from "./components/Navbar.js"; import Hero from "./components/Hero.js"; export default function App(){ return <div><Navbar/><Hero/></div>; }' },
  '/components/Navbar.js': { code: 'export default function Navbar(){ return <nav>Nav</nav>; }' },
  '/components/Hero.js': { code: 'export default function Hero(){ return <section>Hero</section>; }' },
  '/components/Footer.js': { code: 'export default function Footer(){ return <footer>Footer</footer>; }' },
  '/components/Testimonials.js': { code: 'export default function Testimonials(){ return <section>Testimonials</section>; }' },
  '/index.css': { code: '.nav { padding: 4px; }' },
};

it('matches the navbar file for a navbar request, and not unrelated components', () => {
  const { relevantPaths, confident } = identifyRelevantFiles('Fix the navbar spacing please', FILES);
  expect(confident).toBe(true);
  expect(relevantPaths).toContain('/components/Navbar.js');
  expect(relevantPaths).not.toContain('/components/Testimonials.js');
  expect(relevantPaths).not.toContain('/components/Footer.js');
});

it('matches the hero file for a hero background request', () => {
  const { relevantPaths } = identifyRelevantFiles('Change the hero background to blue', FILES);
  expect(relevantPaths).toContain('/components/Hero.js');
});

it('picks up an explicitly named file/path from an error message', () => {
  const { relevantPaths, confident } = identifyRelevantFiles('TypeError in Footer.js: Cannot read properties of undefined', FILES);
  expect(confident).toBe(true);
  expect(relevantPaths[0]).toBe('/components/Footer.js');
});

it('falls back to a small structural set (never everything) when nothing matches', () => {
  const { relevantPaths, confident } = identifyRelevantFiles('make it better overall', FILES, 3);
  expect(confident).toBe(false);
  expect(relevantPaths.length).toBeLessThanOrEqual(3);
  expect(relevantPaths.length).toBeGreaterThan(0);
});
