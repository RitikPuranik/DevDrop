const { evaluateEligibility } = require('../../../../../src/services/deployment/rollbackEligibility');
const { classifyVercelError } = require('../../../../../src/services/deployment/vercelErrors');

describe('evaluateEligibility', () => {
  const base = { environment: 'production', state: 'READY', readySubstate: 'PROMOTED', projectId: 'prj_1' };
  it('production READY promoted deployment -> rollback', () => {
    expect(evaluateEligibility(base, { expectedProjectId: 'prj_1' })).toMatchObject({ eligible: true, kind: 'rollback' });
  });
  it('STAGED production deployment -> promote (no rebuild)', () => {
    expect(evaluateEligibility({ ...base, readySubstate: 'STAGED' })).toMatchObject({ eligible: true, kind: 'promote' });
  });
  it.each([
    ['already live', base, { isCurrentProduction: true }, 'ALREADY_LIVE'],
    ['preview', { ...base, environment: 'preview' }, {}, 'PREVIEW_NOT_ELIGIBLE'],
    ['failed build', { ...base, state: 'ERROR' }, {}, 'NOT_READY'],
    ['building', { ...base, state: 'BUILDING' }, {}, 'NOT_READY'],
    ['canceled', { ...base, state: 'CANCELED' }, {}, 'NOT_READY'],
    ['unavailable', { ...base, availability: 'unavailable' }, {}, 'UNAVAILABLE'],
    ['other project', { ...base, projectId: 'prj_other' }, { expectedProjectId: 'prj_1' }, 'PROJECT_MISMATCH'],
  ])('%s is ineligible', (_n, d, ctx, code) => {
    const r = evaluateEligibility(d, ctx);
    expect(r.eligible).toBe(false);
    expect(r.reason.code).toBe(code);
  });
});

describe('classifyVercelError', () => {
  const http = (status, data) => ({ response: { status, data } });
  it('maps 402 to a plan restriction', () => expect(classifyVercelError(http(402), 'rollback').code).toBe('PLAN_RESTRICTION'));
  it('maps 403/404/410/409/422/429', () => {
    expect(classifyVercelError(http(403)).code).toBe('PERMISSION_DENIED');
    expect(classifyVercelError(http(404)).code).toBe('NOT_FOUND');
    expect(classifyVercelError(http(410)).code).toBe('GONE');
    expect(classifyVercelError(http(409), 'rollback').code).toBe('CONFLICT');
    expect(classifyVercelError(http(422), 'rollback').code).toBe('NOT_ELIGIBLE');
    expect(classifyVercelError(http(429)).retryable).toBe(true);
  });
  it('flags 5xx / timeouts on mutating calls as outcome-unknown (never blind-retried)', () => {
    expect(classifyVercelError(http(502), 'rollback').outcomeUnknown).toBe(true);
    expect(classifyVercelError({ code: 'ECONNABORTED', message: 'timeout' }, 'promote').outcomeUnknown).toBe(true);
    expect(classifyVercelError(http(502), 'read').outcomeUnknown).toBe(false);
  });
  it('never includes tokens from the response in the message', () => {
    const msg = classifyVercelError(http(409, { error: { message: 'x' } }), 'rollback').message;
    expect(msg).not.toMatch(/Bearer/);
  });
});
