'use strict';

const axios = require('axios');
const { getWhatsAppConfig, maskPhone } = require('./config');

/**
 * Thin client for the Meta WhatsApp Business Cloud API (POST /{phone-number-id}/messages).
 *
 * Safety properties:
 *  - The recipient is NOT a parameter. It always comes from WHATSAPP_ADMIN_PHONE_NUMBER, so no caller can
 *    message a customer or seller.
 *  - The access token and phone numbers never appear in logs, errors or thrown messages.
 *  - Every failure is classified so the worker can decide how to retry:
 *      retryable + !ambiguous : the API definitely did not accept the message (safe to retry)
 *      retryable +  ambiguous : request may have reached Meta (timeout / reset): the message MAY have been delivered
 *      !retryable             : retrying cannot help (bad token, recipient not allowed, ...)
 */
class WhatsAppSendError extends Error {
  constructor(message, { code = 'WHATSAPP_SEND_FAILED', retryable = false, ambiguous = false, httpStatus, providerCode } = {}) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.code = code;
    this.retryable = retryable;
    this.ambiguous = ambiguous;
    this.httpStatus = httpStatus;
    this.providerCode = providerCode;
  }
}

// Graph API error codes worth naming. https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80007, 130429, 131048, 131056]);
const AUTH_CODES = new Set([0, 190, 102]);
const PERMANENT_HINTS = {
  131030: ['WHATSAPP_RECIPIENT_NOT_ALLOWED', 'The recipient number is not on the allowed list for this (test) sender. Add and verify it in the Meta developer console.'],
  131047: ['WHATSAPP_WINDOW_CLOSED', 'The 24-hour customer-service window is closed. Send any message from the admin WhatsApp to the business number, then retry.'],
  131026: ['WHATSAPP_UNDELIVERABLE', 'The message could not be delivered to the recipient (number not on WhatsApp or not reachable).'],
  131031: ['WHATSAPP_ACCOUNT_LOCKED', 'The WhatsApp Business account is locked or restricted.'],
  133010: ['WHATSAPP_NUMBER_NOT_REGISTERED', 'The sending phone number is not registered with the Cloud API.'],
};

// Strips anything that could carry a secret or a phone number before text is stored or logged.
const scrub = (text, cfg = getWhatsAppConfig()) => {
  let out = String(text || '');
  if (cfg.accessToken) out = out.split(cfg.accessToken).join('[redacted]');
  if (cfg.adminPhone) out = out.split(cfg.adminPhone).join('[recipient]');
  return out
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/\b(EAA[A-Za-z0-9]{10,})\b/g, '[redacted]')
    .replace(/\+?\d{9,}/g, '[number]')
    .slice(0, 300);
};

const classifyHttpError = (error, cfg) => {
  const status = error.response.status;
  const fb = error.response.data?.error || {};
  const providerCode = Number.isFinite(Number(fb.code)) ? Number(fb.code) : undefined;
  const detail = scrub(fb.error_data?.details || fb.message || `HTTP ${status}`, cfg);

  if (status === 401 || AUTH_CODES.has(providerCode)) {
    return new WhatsAppSendError(`WhatsApp access token was rejected (${detail}). Temporary Meta tokens expire after ~24h; use a System User token.`, { code: 'WHATSAPP_AUTH_FAILED', retryable: false, httpStatus: status, providerCode });
  }
  if (status === 429 || RATE_LIMIT_CODES.has(providerCode)) {
    return new WhatsAppSendError(`WhatsApp rate limit reached: ${detail}`, { code: 'WHATSAPP_RATE_LIMITED', retryable: true, httpStatus: status, providerCode });
  }
  if (providerCode && PERMANENT_HINTS[providerCode]) {
    const [code, hint] = PERMANENT_HINTS[providerCode];
    return new WhatsAppSendError(hint, { code, retryable: false, httpStatus: status, providerCode });
  }
  if (status === 504 || status === 408) {
    // A gateway timeout does not prove the message was not accepted.
    return new WhatsAppSendError(`WhatsApp gateway timeout (HTTP ${status})`, { code: 'WHATSAPP_GATEWAY_TIMEOUT', retryable: true, ambiguous: true, httpStatus: status, providerCode });
  }
  if (status >= 500) {
    return new WhatsAppSendError(`WhatsApp API server error (HTTP ${status}): ${detail}`, { code: 'WHATSAPP_SERVER_ERROR', retryable: true, httpStatus: status, providerCode });
  }
  return new WhatsAppSendError(`WhatsApp rejected the message (HTTP ${status}): ${detail}`, { code: 'WHATSAPP_REJECTED', retryable: false, httpStatus: status, providerCode });
};

const NEVER_SENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']);

const classifyError = (error, cfg = getWhatsAppConfig()) => {
  if (error instanceof WhatsAppSendError) return error;
  if (error?.response) return classifyHttpError(error, cfg);
  const code = error?.code;
  // Could not even connect (DNS / refused / TLS): the request never reached Meta, so a retry cannot duplicate.
  if (NEVER_SENT_CODES.has(code)) {
    return new WhatsAppSendError(`Could not reach the WhatsApp API (${code})`, { code: 'WHATSAPP_UNREACHABLE', retryable: true, ambiguous: false });
  }
  // Timeout / reset after the request went out: Meta may have accepted it. Ambiguous.
  return new WhatsAppSendError(`No response from the WhatsApp API (${scrub(code || error?.message || 'network error', cfg)})`, { code: 'WHATSAPP_NO_RESPONSE', retryable: true, ambiguous: true });
};

/** Sends one plain-text message to the configured admin number. Resolves with { messageId }. */
const sendAdminText = async (body, { http = axios } = {}) => {
  const cfg = getWhatsAppConfig();
  if (!cfg.configured) {
    throw new WhatsAppSendError('WhatsApp credentials are not configured on the server.', { code: 'WHATSAPP_NOT_CONFIGURED', retryable: false });
  }
  const text = String(body || '').slice(0, cfg.maxBodyChars);
  if (!text.trim()) throw new WhatsAppSendError('Refusing to send an empty WhatsApp message.', { code: 'WHATSAPP_EMPTY_MESSAGE', retryable: false });

  const url = `https://graph.facebook.com/${cfg.graphApiVersion}/${encodeURIComponent(cfg.phoneNumberId)}/messages`;
  try {
    const res = await http.post(
      url,
      { messaging_product: 'whatsapp', recipient_type: 'individual', to: cfg.adminPhone, type: 'text', text: { preview_url: false, body: text } },
      { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' }, timeout: cfg.timeoutMs }
    );
    const messageId = res?.data?.messages?.[0]?.id;
    if (!messageId) {
      // 2xx without a message id: we cannot tell whether it was queued by Meta.
      throw new WhatsAppSendError('WhatsApp returned an unexpected response without a message id.', { code: 'WHATSAPP_UNEXPECTED_RESPONSE', retryable: true, ambiguous: true, httpStatus: res?.status });
    }
    return { messageId: String(messageId), recipient: maskPhone(cfg.adminPhone) };
  } catch (error) {
    throw classifyError(error, cfg);
  }
};

module.exports = { sendAdminText, WhatsAppSendError, classifyError, scrub };
