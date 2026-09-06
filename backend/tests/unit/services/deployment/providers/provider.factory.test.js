const { getProvider } = require('../../../../../src/services/deployment/providers/provider.factory');

describe('provider.factory', () => {
  it('returns the vercel provider module for "vercel"', () => {
    expect(getProvider('vercel')).toBe(require('../../../../../src/services/deployment/providers/vercel.provider'));
  });

  it('returns the render provider module for "render"', () => {
    expect(getProvider('render')).toBe(require('../../../../../src/services/deployment/providers/render.provider'));
  });

  it('throws a clear error for an unregistered provider name', () => {
    expect(() => getProvider('netlify')).toThrow('Unknown deployment provider "netlify".');
  });
});
