'use strict';
const { getPlan, ENTITLEMENTS } = require('../../../src/modules/billing/plans.config');
const { resolveGenerationTier, hasEntitlement } = require('../../../src/modules/billing/entitlement.service');

const ent = (id) => ({ plan: getPlan(id), status: id === 'free' ? 'free' : 'active', plans: { [id]: getPlan(id), plus: getPlan('plus') } });
const on = { ADVANCED_GENERATION_ENABLED: 'true' };

describe('advanced generation tier (server-side entitlement)', () => {
  test('plans: only plus and pro carry the entitlement and limits', () => {
    expect(hasEntitlement(ent('free'), ENTITLEMENTS.ADVANCED_WEBSITE_GENERATION)).toBe(false);
    expect(hasEntitlement(ent('pro'), ENTITLEMENTS.ADVANCED_WEBSITE_GENERATION)).toBe(true);
    expect(hasEntitlement(ent('plus'), ENTITLEMENTS.ADVANCED_WEBSITE_GENERATION)).toBe(true);
    expect(getPlan('free').advancedLimits).toBeNull();
    expect(getPlan('plus').advancedLimits).toBeTruthy();
  });
  test('free stays on the standard pipeline', () => {
    expect(resolveGenerationTier({ ent: ent('free'), env: on }).tier).toBe('standard');
  });
  test('free asking for advanced through a hand-crafted request is refused', () => {
    expect(() => resolveGenerationTier({ ent: ent('free'), requested: 'advanced', env: on })).toThrow(expect.objectContaining({ code: 'FEATURE_NOT_IN_PLAN' }));
  });
  test('plus and pro get advanced for generation, standard for edits or when opting down', () => {
    for (const id of ['pro', 'plus']) {
      expect(resolveGenerationTier({ ent: ent(id), env: on }).tier).toBe('advanced');
      expect(resolveGenerationTier({ ent: ent(id), usageKind: 'edit', env: on }).tier).toBe('standard');
      expect(resolveGenerationTier({ ent: ent(id), requested: 'standard', env: on }).tier).toBe('standard');
    }
  });
  test('kill switch falls back to standard', () => {
    expect(resolveGenerationTier({ ent: ent('plus'), env: { ADVANCED_GENERATION_ENABLED: 'false' } }).tier).toBe('standard');
  });
});
