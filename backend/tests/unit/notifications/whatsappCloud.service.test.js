const { setWhatsAppEnv, clearWhatsAppEnv, WA_ENV } = require('../../helpers/whatsappFakes');
const cloud = require('../../../src/infrastructure/notifications/whatsappCloud.service');

const httpError = (status, error = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { error } } });
const netError = (code, message = code) => Object.assign(new Error(message), { code });
const send = (post, text = 'hello') => cloud.sendAdminText(text, { http: { post } });
const rejection = async (p) => { try { await p; return null; } catch (e) { return e; } };

beforeEach(() => setWhatsAppEnv());
afterAll(clearWhatsAppEnv);

describe('request construction', () => {
  it('posts a text message to the Graph API for the configured sender and the configured admin only', async () => {
    const post = jest.fn().mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.ABC' }] } });
    const out = await send(post, 'DevDrop alert');

    const [url, body, opts] = post.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/messages');
    expect(body).toEqual({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '919876543210', type: 'text', text: { preview_url: false, body: 'DevDrop alert' } });
    expect(opts.headers.Authorization).toBe(`Bearer ${WA_ENV.WHATSAPP_ACCESS_TOKEN}`);
    expect(opts.timeout).toBe(10000);
    expect(out.messageId).toBe('wamid.ABC');
    expect(out.recipient).toBe('+91******3210'); // masked, never the real number
  });

  it('has no way to address anyone but the admin: the recipient is not a parameter', () => {
    expect(cloud.sendAdminText.length).toBeLessThanOrEqual(2);
    expect(String(cloud.sendAdminText)).not.toMatch(/\(\s*to\b/);
  });

  it('honours the configured Graph API version and normalises the admin number to digits', async () => {
    setWhatsAppEnv({ WHATSAPP_GRAPH_API_VERSION: 'v21.0', WHATSAPP_ADMIN_PHONE_NUMBER: '+91 98765-43210' });
    const post = jest.fn().mockResolvedValue({ data: { messages: [{ id: 'x' }] } });
    await send(post);
    expect(post.mock.calls[0][0]).toContain('/v21.0/');
    expect(post.mock.calls[0][1].to).toBe('919876543210');
  });

  it('refuses to send when credentials are missing, without calling the network', async () => {
    setWhatsAppEnv({ WHATSAPP_ACCESS_TOKEN: '' });
    const post = jest.fn();
    const err = await rejection(send(post));
    expect(err.code).toBe('WHATSAPP_NOT_CONFIGURED');
    expect(err.retryable).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses an empty message and truncates an over-long one to the WhatsApp limit', async () => {
    const post = jest.fn().mockResolvedValue({ data: { messages: [{ id: 'x' }] } });
    expect((await rejection(send(post, '   '))).code).toBe('WHATSAPP_EMPTY_MESSAGE');
    await send(post, 'a'.repeat(9000));
    expect(post.mock.calls[0][1].text.body.length).toBe(4000);
  });
});

describe('failure classification (drives retry safety)', () => {
  const cases = [
    ['bad/expired token (401)', httpError(401, { code: 190, message: 'Invalid OAuth access token' }), { code: 'WHATSAPP_AUTH_FAILED', retryable: false, ambiguous: false }],
    ['rate limited (429)', httpError(429, { code: 130429 }), { code: 'WHATSAPP_RATE_LIMITED', retryable: true, ambiguous: false }],
    ['recipient not on test allow-list', httpError(400, { code: 131030 }), { code: 'WHATSAPP_RECIPIENT_NOT_ALLOWED', retryable: false, ambiguous: false }],
    ['24h window closed', httpError(400, { code: 131047 }), { code: 'WHATSAPP_WINDOW_CLOSED', retryable: false, ambiguous: false }],
    ['other 4xx', httpError(400, { code: 100, message: 'Invalid parameter' }), { code: 'WHATSAPP_REJECTED', retryable: false, ambiguous: false }],
    ['5xx response', httpError(503, { message: 'Service unavailable' }), { code: 'WHATSAPP_SERVER_ERROR', retryable: true, ambiguous: false }],
    ['gateway timeout (504) is ambiguous', httpError(504), { code: 'WHATSAPP_GATEWAY_TIMEOUT', retryable: true, ambiguous: true }],
    ['could not connect (DNS)', netError('ENOTFOUND'), { code: 'WHATSAPP_UNREACHABLE', retryable: true, ambiguous: false }],
    ['connection refused', netError('ECONNREFUSED'), { code: 'WHATSAPP_UNREACHABLE', retryable: true, ambiguous: false }],
    ['client timeout after request sent is ambiguous', netError('ECONNABORTED', 'timeout of 10000ms exceeded'), { code: 'WHATSAPP_NO_RESPONSE', retryable: true, ambiguous: true }],
    ['connection reset mid-request is ambiguous', netError('ECONNRESET'), { code: 'WHATSAPP_NO_RESPONSE', retryable: true, ambiguous: true }],
  ];
  it.each(cases)('%s', async (_name, error, expected) => {
    const err = await rejection(send(jest.fn().mockRejectedValue(error)));
    expect(err).toBeInstanceOf(cloud.WhatsAppSendError);
    expect(err).toMatchObject(expected);
  });

  it('treats a 2xx without a message id as ambiguous (cannot tell whether Meta queued it)', async () => {
    const err = await rejection(send(jest.fn().mockResolvedValue({ status: 200, data: {} })));
    expect(err).toMatchObject({ code: 'WHATSAPP_UNEXPECTED_RESPONSE', ambiguous: true, retryable: true });
  });
});

describe('secret hygiene', () => {
  it('never lets the access token or phone number reach an error message', async () => {
    const leaky = httpError(400, { code: 100, message: `Bad request for ${WA_ENV.WHATSAPP_ADMIN_PHONE_NUMBER} using ${WA_ENV.WHATSAPP_ACCESS_TOKEN} Bearer abc.def.ghi` });
    const err = await rejection(send(jest.fn().mockRejectedValue(leaky)));
    expect(err.message).not.toContain(WA_ENV.WHATSAPP_ACCESS_TOKEN);
    expect(err.message).not.toContain(WA_ENV.WHATSAPP_ADMIN_PHONE_NUMBER);
    expect(err.message).not.toContain('abc.def.ghi');
  });
  it('scrubs long digit runs and EAA-style tokens', () => {
    const out = cloud.scrub('call +14155550123 token EAAGm0PX4ZCpsBAKexample123');
    expect(out).not.toMatch(/\d{9,}/);
    expect(out).not.toContain('EAAGm0PX4ZCpsBAKexample123');
  });
});
