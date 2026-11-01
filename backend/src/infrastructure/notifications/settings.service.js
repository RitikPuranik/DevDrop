'use strict';

const WhatsAppSettings = require('./whatsappSettings.model');
const { getWhatsAppConfig } = require('./config');

const CATEGORY_KEYS = ['subscription', 'renewal', 'websitePurchase', 'adminReport'];
const DEFAULTS = Object.freeze({ enabled: true, categories: { subscription: true, renewal: true, websitePurchase: true, adminReport: true } });

const normalize = (doc) => ({
  enabled: doc ? doc.enabled !== false : DEFAULTS.enabled,
  categories: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, doc?.categories?.[k] !== false])),
  updatedAt: doc?.updatedAt || null,
});

const getSettings = async () => normalize(await WhatsAppSettings.findOne({ key: 'whatsapp' }).lean());

const updateSettings = async ({ enabled, categories }, adminId) => {
  const $set = {};
  if (typeof enabled === 'boolean') $set.enabled = enabled;
  for (const k of CATEGORY_KEYS) {
    if (categories && typeof categories[k] === 'boolean') $set[`categories.${k}`] = categories[k];
  }
  if (adminId) $set.updatedBy = adminId;
  const doc = await WhatsAppSettings.findOneAndUpdate({ key: 'whatsapp' }, { $set }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  return normalize(doc);
};

/**
 * Can a notification of `category` go out right now?
 *   purpose 'event'  : automatic purchase alerts  -> master switch + admin toggle + category
 *   purpose 'report' : admin summary report       -> master switch + admin toggle + category + credentials
 *   purpose 'test'   : connectivity test          -> master switch + credentials only
 * Missing credentials do NOT block 'event' (the alert is recorded and fails visibly, so it can be retried
 * once the credentials are fixed) but do block manual actions, which can report the problem immediately.
 */
const evaluate = async (category, { purpose = 'event' } = {}) => {
  const cfg = getWhatsAppConfig();
  if (!cfg.masterEnabled) return { allowed: false, reason: 'master_disabled' };
  if (purpose !== 'event' && !cfg.configured) return { allowed: false, reason: 'not_configured' };
  if (purpose === 'test') return { allowed: true };
  const s = await getSettings();
  if (!s.enabled) return { allowed: false, reason: 'disabled' };
  if (CATEGORY_KEYS.includes(category) && !s.categories[category]) return { allowed: false, reason: 'category_disabled' };
  return { allowed: true };
};

const REASON_TEXT = {
  master_disabled: 'WhatsApp notifications are switched off on the server (WHATSAPP_NOTIFICATIONS_ENABLED).',
  not_configured: 'WhatsApp credentials are not fully configured on the server.',
  disabled: 'WhatsApp notifications are disabled in admin settings.',
  category_disabled: 'This notification category is disabled in admin settings.',
};

module.exports = { CATEGORY_KEYS, getSettings, updateSettings, evaluate, REASON_TEXT };
