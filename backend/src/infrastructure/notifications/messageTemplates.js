'use strict';

const { getWhatsAppConfig } = require('./config');

// Exact message layouts requested for DevDrop. Placeholders use {{snake_case}}.
const RULE = '━━━━━━━━━━━━━━━━━━';

const TEMPLATES = Object.freeze({
  SUBSCRIPTION_PURCHASED: [
    '🔔 *DevDrop | New Subscription*',
    '',
    'A user has subscribed to a plan.',
    '',
    RULE,
    '📦 *Plan:* {{plan_name}}',
    '👤 *User:* {{user_name}}',
    '📧 *Email:* {{user_email}}',
    '💰 *Amount:* {{amount}}',
    '💳 *Payment:* {{payment_status}}',
    '🆔 *Subscription ID:* {{subscription_id}}',
    '📅 *Date:* {{date_time}}',
    RULE,
    '',
    'DevDrop Admin Notification',
  ].join('\n'),

  // Renewals are a distinct event type with their own wording (same fields).
  SUBSCRIPTION_RENEWED: [
    '🔄 *DevDrop | Subscription Renewed*',
    '',
    'A user has renewed their plan.',
    '',
    RULE,
    '📦 *Plan:* {{plan_name}}',
    '👤 *User:* {{user_name}}',
    '📧 *Email:* {{user_email}}',
    '💰 *Amount:* {{amount}}',
    '💳 *Payment:* {{payment_status}}',
    '🆔 *Subscription ID:* {{subscription_id}}',
    '📅 *Date:* {{date_time}}',
    RULE,
    '',
    'DevDrop Admin Notification',
  ].join('\n'),

  WEBSITE_PURCHASED: [
    '🛍️ *DevDrop | New Website Purchase*',
    '',
    'A website has been purchased!',
    '',
    RULE,
    '🌐 *Website:* {{website_name}}',
    '👤 *Buyer:* {{buyer_name}}',
    '📧 *Buyer Email:* {{buyer_email}}',
    '👨‍💻 *Seller:* {{seller_name}}',
    '💰 *Purchase Amount:* {{purchase_amount}}',
    '💳 *Payment:* {{payment_status}}',
    '🆔 *Order ID:* {{order_id}}',
    '📅 *Date:* {{date_time}}',
    RULE,
    '',
    'DevDrop Admin Notification',
  ].join('\n'),

  WHATSAPP_TEST: [
    '🧪 *DevDrop | Test Notification*',
    '',
    'WhatsApp admin notifications are working.',
    '',
    RULE,
    '📅 *Sent:* {{date_time}}',
    RULE,
    '',
    'DevDrop Admin Notification',
  ].join('\n'),
});

const UNAVAILABLE = 'Unavailable';

// WhatsApp has no escape syntax for *bold*, _italic_, ~strike~ and `code`, so a name containing those
// characters could mangle the layout (or inject formatting). Dynamic values are flattened to plain text.
// Underscores inside a word (john_doe@example.com) cannot trigger italics, so they are preserved.
const sanitizeValue = (value, max = 120) => {
  if (value === undefined || value === null) return UNAVAILABLE;
  const clean = String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[*~`]/g, '')
    .replace(/(^|\s)_+|_+(?=\s|$)/g, '$1')
    .replace(/\{\{|\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return clean || UNAVAILABLE;
};

const render = (type, vars = {}) => {
  const template = TEMPLATES[type];
  if (!template) throw new Error(`No WhatsApp template for ${type}`);
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => sanitizeValue(vars[key]));
};

/** Minor units (paise) + ISO currency -> "₹799.00". Never throws on an odd currency. */
const formatMoneyMinor = (minor, currency = 'INR') => {
  const n = Number(minor);
  if (!Number.isFinite(n)) return UNAVAILABLE;
  const cur = String(currency || 'INR').toUpperCase();
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur }).format(n / 100);
  } catch {
    return `${cur} ${(n / 100).toFixed(2)}`;
  }
};

/** Whole-rupee amounts as stored on Purchase/Payout documents. */
const formatMoneyMajor = (amount, currency = 'INR') => (Number.isFinite(Number(amount)) ? formatMoneyMinor(Math.round(Number(amount) * 100), currency) : UNAVAILABLE);

const formatDateTime = (date, tz = getWhatsAppConfig().timezone) => {
  const d = date ? new Date(date) : null;
  if (!d || Number.isNaN(d.getTime())) return UNAVAILABLE;
  try {
    const text = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h12', timeZone: tz }).format(d);
    return `${text} ${tz === 'Asia/Kolkata' ? 'IST' : tz}`;
  } catch {
    return d.toISOString();
  }
};

// ---------------------------------------------------------------- admin report

const METRICS = Object.freeze({
  PENDING_VERIFICATIONS: 'pending_verifications',
  PENDING_PAYOUTS: 'pending_payouts',
  SUBSCRIPTIONS: 'subscriptions',
  BOUGHT_WEBSITES: 'bought_websites',
});
const METRIC_ORDER = [METRICS.PENDING_VERIFICATIONS, METRICS.PENDING_PAYOUTS, METRICS.SUBSCRIPTIONS, METRICS.BOUGHT_WEBSITES];

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const reportLines = {
  [METRICS.PENDING_VERIFICATIONS]: (s) => [`⏳ *Pending Website Verifications:* ${s.count}`],
  [METRICS.PENDING_PAYOUTS]: (s) => [`💸 *Pending Payouts:* ${plural(s.count, 'request')} · ${formatMoneyMajor(s.totalAmount)}`],
  [METRICS.SUBSCRIPTIONS]: (s) => {
    const lines = [`🔔 *Active Subscriptions:* ${s.totalActive}`];
    const plans = (s.byPlan || []).map((p) => `${sanitizeValue(p.name, 30)}: ${p.count}`);
    if (plans.length) lines.push(`    • ${plans.join('  ·  ')}`);
    if (s.cancelling) lines.push(`    • Set to end at term end: ${s.cancelling}`);
    lines.push(`    • Subscription purchases to date: ${s.historicalPurchases}`);
    return lines;
  },
  [METRICS.BOUGHT_WEBSITES]: (s) => [`🛍️ *Total Bought Websites:* ${s.total}`, `    • Paid: ${s.paid}  ·  Free: ${s.free}`],
};

/** stats = { [metricId]: {...} }, metrics = selected ids. Only selected metrics appear in the message. */
const renderReport = ({ metrics, stats, generatedAt }) => {
  const selected = METRIC_ORDER.filter((m) => metrics.includes(m) && stats[m]);
  const body = selected.flatMap((m, i) => [...(i ? [''] : []), ...reportLines[m](stats[m])]);
  return [
    '📊 *DevDrop | Admin Report*',
    '',
    `📅 ${formatDateTime(generatedAt)}`,
    '',
    RULE,
    ...body,
    RULE,
    '',
    'DevDrop Admin Notification',
  ].join('\n');
};

module.exports = { TEMPLATES, RULE, UNAVAILABLE, METRICS, METRIC_ORDER, sanitizeValue, render, renderReport, formatMoneyMinor, formatMoneyMajor, formatDateTime };
