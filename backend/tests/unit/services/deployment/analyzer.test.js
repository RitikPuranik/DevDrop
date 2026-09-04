const { scanForEnvVarNames, parseEnvExampleKeys, classifyEnvVar } = require('../../../../src/services/deployment/analyzer/envScan');
const { FRAMEWORK_RULES, STATIC_SITE_RULE } = require('../../../../src/services/deployment/analyzer/frameworkRules');
const { resolveVariableValue, buildVariableList } = require('../../../../src/services/deployment/envSync');

describe('envScan.scanForEnvVarNames', () => {
  it('finds process.env.X, process.env["X"], and import.meta.env.X references', () => {
    const files = [
      { path: 'server.js', content: `const url = process.env.DATABASE_URL;\nconst key = process.env['JWT_SECRET'];` },
      { path: 'src/main.jsx', content: `const api = import.meta.env.VITE_API_URL;` },
    ];
    expect(scanForEnvVarNames(files)).toEqual(expect.arrayContaining(['DATABASE_URL', 'JWT_SECRET', 'VITE_API_URL']));
  });

  it('dedupes repeated references across files and ignores runtime noise names', () => {
    const files = [
      { path: 'a.js', content: 'process.env.NODE_OPTIONS; process.env.STRIPE_KEY;' },
      { path: 'b.js', content: 'process.env.STRIPE_KEY;' },
    ];
    const found = scanForEnvVarNames(files);
    expect(found).toEqual(['STRIPE_KEY']);
  });

  it('returns an empty array for files with no env references', () => {
    expect(scanForEnvVarNames([{ path: 'a.js', content: 'const x = 1;' }])).toEqual([]);
  });
});

describe('envScan.parseEnvExampleKeys', () => {
  it('extracts key names, skipping comments and blank lines', () => {
    const content = '# comment\n\nDATABASE_URL=postgres://...\nJWT_SECRET=\nPORT=3000\n';
    expect(parseEnvExampleKeys(content)).toEqual(['DATABASE_URL', 'JWT_SECRET', 'PORT']);
  });

  it('returns an empty array for empty/undefined input', () => {
    expect(parseEnvExampleKeys('')).toEqual([]);
    expect(parseEnvExampleKeys(undefined)).toEqual([]);
  });
});

describe('envScan.classifyEnvVar', () => {
  it('always classifies NODE_ENV as auto/static', () => {
    expect(classifyEnvVar('NODE_ENV', 'backend')).toEqual({ source: 'auto', autoRole: 'static' });
  });

  it('classifies known backend URL var names as auto/frontend-url', () => {
    expect(classifyEnvVar('FRONTEND_URL', 'backend')).toEqual({ source: 'auto', autoRole: 'frontend-url' });
    expect(classifyEnvVar('CORS_ORIGIN', 'backend')).toEqual({ source: 'auto', autoRole: 'frontend-url' });
  });

  it('classifies *_API_URL-shaped frontend vars as auto/backend-url regardless of prefix', () => {
    expect(classifyEnvVar('VITE_API_URL', 'frontend')).toEqual({ source: 'auto', autoRole: 'backend-url' });
    expect(classifyEnvVar('NEXT_PUBLIC_API_URL', 'frontend')).toEqual({ source: 'auto', autoRole: 'backend-url' });
    expect(classifyEnvVar('REACT_APP_BACKEND_URL', 'frontend')).toEqual({ source: 'auto', autoRole: 'backend-url' });
  });

  it('falls back to user-supplied for anything unrecognized', () => {
    expect(classifyEnvVar('DATABASE_URL', 'backend')).toEqual({ source: 'user' });
    expect(classifyEnvVar('STRIPE_SECRET_KEY', 'backend')).toEqual({ source: 'user' });
  });
});

describe('frameworkRules.FRAMEWORK_RULES', () => {
  const find = (input) => FRAMEWORK_RULES.find((r) => r.match(input));

  it('matches Next.js before React+Vite when a project depends on both', () => {
    const rule = find({ deps: { next: '^14.0.0', react: '^18.0.0', vite: '^5.0.0' }, filesAtRoot: [] });
    expect(rule.id).toBe('nextjs');
  });

  it('matches React+Vite for a vite+react project', () => {
    const rule = find({ deps: { vite: '^5.0.0', react: '^18.0.0' }, filesAtRoot: ['vite.config.js'] });
    expect(rule.id).toBe('react-vite');
    expect(rule.provider).toBe('vercel');
  });

  it('matches NestJS before plain Express for a Nest project', () => {
    const rule = find({ deps: { '@nestjs/core': '^10.0.0', express: '^4.0.0' }, filesAtRoot: [] });
    expect(rule.id).toBe('nestjs');
  });

  it('matches Express for a plain express dependency', () => {
    const rule = find({ deps: { express: '^4.18.0' }, filesAtRoot: [] });
    expect(rule.id).toBe('express');
    expect(rule.provider).toBe('render');
  });

  it('matches nothing for an unrelated package.json', () => {
    expect(find({ deps: { lodash: '^4.0.0' }, filesAtRoot: [] })).toBeUndefined();
  });

  it('resolves a sane build command for Express when no build script exists', () => {
    const rule = FRAMEWORK_RULES.find((r) => r.id === 'express');
    const resolved = rule.resolve({ scripts: { start: 'node server.js' }, pkg: {}, filesAtRoot: ['server.js'] });
    expect(resolved.buildCommand).toBe('npm install');
    expect(resolved.startCommand).toBe('npm start');
  });

  it('static site rule needs no build step', () => {
    const resolved = STATIC_SITE_RULE.resolve();
    expect(resolved.buildCommand).toBeNull();
    expect(resolved.outputDirectory).toBe('.');
  });
});

describe('envSync.resolveVariableValue', () => {
  it('resolves NODE_ENV to production regardless of context', () => {
    expect(resolveVariableValue({ key: 'NODE_ENV', target: 'backend', source: 'auto' }, { userSecrets: new Map() })).toBe('production');
  });

  it('resolves a frontend-url-role backend var to the known frontend URL', () => {
    const entry = { key: 'FRONTEND_URL', target: 'backend', source: 'auto', autoRole: 'frontend-url' };
    expect(resolveVariableValue(entry, { frontendUrl: 'https://app.vercel.app', userSecrets: new Map() })).toBe('https://app.vercel.app');
  });

  it('returns null for a frontend-url-role var when the frontend has not deployed yet', () => {
    const entry = { key: 'FRONTEND_URL', target: 'backend', source: 'auto', autoRole: 'frontend-url' };
    expect(resolveVariableValue(entry, { frontendUrl: null, userSecrets: new Map() })).toBeNull();
  });

  it('resolves a user-supplied var from the secrets map, or null if missing', () => {
    const entry = { key: 'DATABASE_URL', target: 'backend', source: 'user' };
    const secrets = new Map([['DATABASE_URL', 'postgres://example']]);
    expect(resolveVariableValue(entry, { userSecrets: secrets })).toBe('postgres://example');
    expect(resolveVariableValue(entry, { userSecrets: new Map() })).toBeNull();
  });
});

describe('envSync.buildVariableList', () => {
  it('builds only the resolvable entries for the requested target', () => {
    const envPlan = [
      { key: 'NODE_ENV', target: 'backend', source: 'auto', autoRole: 'static' },
      { key: 'FRONTEND_URL', target: 'backend', source: 'auto', autoRole: 'frontend-url' },
      { key: 'DATABASE_URL', target: 'backend', source: 'user' },
      { key: 'VITE_API_URL', target: 'frontend', source: 'auto', autoRole: 'backend-url' },
    ];
    const context = { frontendUrl: null, backendUrl: null, userSecrets: new Map() }; // frontend not deployed yet
    const result = buildVariableList(envPlan, 'backend', context);
    // FRONTEND_URL and DATABASE_URL aren't resolvable yet — only NODE_ENV should be sent.
    expect(result).toEqual([{ key: 'NODE_ENV', value: 'production' }]);
  });

  it('includes a resolved user secret once supplied', () => {
    const envPlan = [{ key: 'DATABASE_URL', target: 'backend', source: 'user' }];
    const context = { userSecrets: new Map([['DATABASE_URL', 'postgres://x']]) };
    expect(buildVariableList(envPlan, 'backend', context)).toEqual([{ key: 'DATABASE_URL', value: 'postgres://x' }]);
  });
});
