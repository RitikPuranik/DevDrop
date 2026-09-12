const { validateGeneratedFiles } = require('../src/validators/generatedFiles.validator');
const { validateRequirements, validateDesign, validateArchitecture } = require('../src/validators/contracts.validator');

describe('multi-agent contracts', () => {
  test('accepts the portfolio contracts', () => {
    expect(() => validateRequirements({ websiteType:'portfolio', goal:'portfolio', targetAudience:'recruiters', pages:[], sections:[], contentRequirements:{}, features:[], userData:{}, constraints:[], assets:[] })).not.toThrow();
    expect(() => validateDesign({ designSystem:{style:'modern',theme:'dark',colors:{},typography:{},spacing:'normal',borderRadius:'medium',componentStyle:'clean',layoutStrategy:'grid',responsiveStrategy:'mobile-first',animationStrategy:'subtle'} })).not.toThrow();
    expect(() => validateArchitecture({ project:{framework:'react-vite',language:'javascript'}, files:[{path:'/App.js',type:'entry',responsibility:'entry',exports:['default'],imports:[]}], dependencies:{}, routes:[], dataModel:{} })).not.toThrow();
  });

  test('catches undefined JSX components with AST parsing', () => {
    const errors = validateGeneratedFiles({ '/App.js': { code: 'export default function App(){ return <Hero />; }' } });
    expect(errors.some((e) => e.includes('Hero') && e.includes('undefined'))).toBe(true);
  });

  test('catches broken default and named imports', () => {
    const errors = validateGeneratedFiles({
      '/App.js': { code: 'import Header, { Missing } from "./Header"; export default function App(){ return <Header/>; }' },
      '/Header.js': { code: 'export const Present = () => null;' },
    });
    expect(errors.some((e) => e.includes('default export'))).toBe(true);
    expect(errors.some((e) => e.includes('Missing'))).toBe(true);
  });

  test('accepts valid component imports', () => {
    const errors = validateGeneratedFiles({
      '/App.js': { code: 'import Hero from "./components/Hero"; export default function App(){ return <Hero/>; }' },
      '/components/Hero.js': { code: 'export default function Hero(){ return <section>Hi</section>; }' },
    });
    expect(errors).toEqual([]);
  });
});
