const { resolveSelection, scoreCandidate } = require('../../../../../src/services/deployment/analyzer/candidateSelection');

describe('deployment candidate selection', () => {
  const make = (root, overrides = {}) => ({
    root,
    kind: 'frontend',
    framework: 'React',
    signals: {
      frameworkEvidence: true,
      hasBuildScript: true,
      hasEntryPoint: true,
      hasFrameworkConfig: true,
      hasIndexHtml: true,
      hasAppOrPagesDir: false,
      hasStartScript: false,
      hasServerEntryPoint: false,
      hasSourceDir: true,
      hasTypeScriptEntry: false,
      ...overrides,
    },
  });

  it('prefers stronger deterministic evidence', () => {
    const strong = make('store');
    const weak = make('docs', {
      hasBuildScript: false,
      hasEntryPoint: false,
      hasFrameworkConfig: false,
      hasIndexHtml: false,
    });
    expect(scoreCandidate(strong)).toBeGreaterThan(scoreCandidate(weak));
    const result = resolveSelection([weak, strong], null, 0, '');
    expect(result.candidate.root).toBe('store');
    expect(result.method).toBe('deterministic-override');
  });

  it('accepts an AI candidate when it remains within the deterministic safety margin', () => {
    const a = make('app-a');
    const b = make('app-b', { hasBuildScript: false });
    const result = resolveSelection([a, b], 'app-b', 0.91, 'AI found the intended storefront.');
    expect(result.candidate.root).toBe('app-b');
    expect(result.method).toBe('ai-assisted');
    expect(result.confidence).toBe(0.91);
  });

  it('overrides an AI choice that is materially weaker', () => {
    const strong = make('store');
    const weak = make('docs', {
      hasBuildScript: false,
      hasEntryPoint: false,
      hasFrameworkConfig: false,
      hasIndexHtml: false,
    });
    const result = resolveSelection([strong, weak], 'docs', 0.99, 'AI guessed docs.');
    expect(result.candidate.root).toBe('store');
    expect(result.method).toBe('deterministic-override');
  });
});
