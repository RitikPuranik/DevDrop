'use strict';

// WhatsApp Cloud API configuration. Everything is read from the server environment on every call
// (no caching) so tests and runtime changes behave predictably. Credentials never leave the server.
const flag = (v) => /^(1|true|yes|on)$/i.test(String(v || '').trim());
const int = (key, fallback, { min = 0 } = {}) => {
  const n = Number.parseInt(process.env[key], 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

/** "919876543210" -> "+91******3210". Used for logs, history and API responses. */
const maskPhone = (phone) => {
  const d = digitsOnly(phone);
  if (!d) return null;
  if (d.length <= 6) return `+${'*'.repeat(d.length)}`;
  return `+${d.slice(0, 2)}${'*'.repeat(d.length - 6)}${d.slice(-4)}`;
};

const getWhatsAppConfig = () => {
  const version = String(process.env.WHATSAPP_GRAPH_API_VERSION || '').trim();
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const adminPhone = digitsOnly(process.env.WHATSAPP_ADMIN_PHONE_NUMBER);
  return {
    // Master switch. false (default) => nothing is ever sent, and business flows are unaffected.
    masterEnabled: flag(process.env.WHATSAPP_NOTIFICATIONS_ENABLED),
    accessToken,
    phoneNumberId,
    adminPhone, // the ONLY recipient this system can ever message
    graphApiVersion: /^v\d+\.\d+$/.test(version) ? version : 'v23.0',
    configured: Boolean(accessToken && phoneNumberId && adminPhone.length >= 8),
    recipientMasked: maskPhone(adminPhone),
    timeoutMs: int('WHATSAPP_REQUEST_TIMEOUT_MS', 10000, { min: 1000 }),
    // Bounded retries (BullMQ, exponential backoff). Attempts include the first one.
    attempts: int('WHATSAPP_JOB_ATTEMPTS', 4, { min: 1 }),
    backoffMs: int('WHATSAPP_JOB_BACKOFF_MS', 5000, { min: 100 }),
    // An ambiguous outcome (request sent, no response) may mean the message WAS delivered.
    // Automatic re-sends after such outcomes are capped; after that the notification is parked as "unconfirmed".
    maxAmbiguousRetries: int('WHATSAPP_MAX_AMBIGUOUS_RETRIES', 1),
    notifyFreeClaims: flag(process.env.WHATSAPP_NOTIFY_FREE_CLAIMS),
    timezone: String(process.env.WHATSAPP_TIMEZONE || 'Asia/Kolkata'),
    historyDays: int('WHATSAPP_HISTORY_DAYS', 90, { min: 1 }),
    maxBodyChars: 4000, // WhatsApp text limit is 4096
  };
};

module.exports = { getWhatsAppConfig, maskPhone, digitsOnly };
