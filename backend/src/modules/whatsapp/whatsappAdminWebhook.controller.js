'use strict';

const crypto = require('crypto');
const axios = require('axios');
const reports = require('../../infrastructure/notifications/adminReport.service');
const { METRICS, METRIC_ORDER } = require('../../infrastructure/notifications/messageTemplates');
const { digitsOnly } = require('../../infrastructure/notifications/config');

const MENU = [
  '👋 *Hello Admin! Welcome to DevDrop.*',
  'Your private Admin Assistant is ready. Choose what you want to check:',
  '',
  '━━━━━━━━━━━━━━━━━━',
  '📊 *BUSINESS OVERVIEW*',
  '1️⃣ Business Overview (all key counts)',
  '2️⃣ Pending Website Verifications',
  '3️⃣ Pending Payouts',
  '4️⃣ Active Subscriptions',
  '5️⃣ Total Websites Bought',
  '',
  '🌐 *WEBSITE MANAGEMENT*',
  '6️⃣ Pending verifications',
  '7️⃣ Website sales summary',
  '',
  '💰 *PAYMENTS & PAYOUTS*',
  '8️⃣ Pending payout report',
  '',
  '🔔 *SUBSCRIPTIONS*',
  '9️⃣ Subscription breakdown',
  '',
  '🛍️ *MARKETPLACE*',
  '10️⃣ Purchase summary',
  '',
  'Reply with a number or: *MENU*, *HELP*, *TODAY*.',
  '━━━━━━━━━━━━━━━━━━'
].join('\n');

const menuCommands = new Map([
  ['1', METRIC_ORDER],
  ['2', [METRICS.PENDING_VERIFICATIONS]],
  ['6', [METRICS.PENDING_VERIFICATIONS]],
  ['3', [METRICS.PENDING_PAYOUTS]],
  ['8', [METRICS.PENDING_PAYOUTS]],
  ['4', [METRICS.SUBSCRIPTIONS]],
  ['9', [METRICS.SUBSCRIPTIONS]],
  ['5', [METRICS.BOUGHT_WEBSITES]],
  ['7', [METRICS.BOUGHT_WEBSITES]],
  ['10', [METRICS.BOUGHT_WEBSITES]],
]);

const textOf = (message) => {
  if (message?.type === 'text') return String(message.text?.body || '').trim();
  if (message?.type === 'interactive') {
    const i = message.interactive || {};
    return String(i.button_reply?.id || i.list_reply?.id || '').trim();
  }
  return '';
};
const normalize = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const safeEq = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const sendReply = async (to, body) => {
  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const version = /^v\d+\.\d+$/.test(String(process.env.WHATSAPP_GRAPH_API_VERSION || '')) ? process.env.WHATSAPP_GRAPH_API_VERSION : 'v23.0';
  if (!token || !phoneNumberId) throw new Error('WhatsApp outbound configuration missing');
  await axios.post(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: String(body).slice(0, 4000) }
  }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
};

const makeBusinessOverview = async (metrics) => (await reports.buildReport(metrics)).message;
const commandResponse = async (raw) => {
  const cmd = normalize(raw);
  if (['hi', 'hello', 'hey', 'start', 'menu'].includes(cmd)) return MENU;
  if (['help', '?'].includes(cmd)) return '📌 *DevDrop Admin Help*\nReply with a menu number or: pending websites, pending payouts, subscriptions, website sales, business overview, menu.';
  if (['today', 'business overview', 'overview', 'report', '1'].includes(cmd)) return makeBusinessOverview(METRIC_ORDER);
  if (['pending websites', 'pending website verifications', 'verifications', '2', '6'].includes(cmd)) return makeBusinessOverview([METRICS.PENDING_VERIFICATIONS]);
  if (['pending payouts', 'payouts', '3', '8'].includes(cmd)) return makeBusinessOverview([METRICS.PENDING_PAYOUTS]);
  if (['subscriptions', 'active subscriptions', '4', '9'].includes(cmd)) return makeBusinessOverview([METRICS.SUBSCRIPTIONS]);
  if (['website sales', 'website purchases', 'bought websites', '5', '7', '10'].includes(cmd)) return makeBusinessOverview([METRICS.BOUGHT_WEBSITES]);
  return 'I did not recognize that option. Reply *MENU* to see available reports, or *HELP* for commands.';
};

const verify = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = req.query['hub.challenge'];
  const expected = String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '');
  if (mode === 'subscribe' && expected && safeEq(token, expected) && challenge) return res.status(200).send(String(challenge));
  return res.sendStatus(403);
};

const receive = async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  const signature = String(req.get('x-hub-signature-256') || '');
  if (!appSecret || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return res.sendStatus(401);
  const digest = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
  if (!safeEq(signature, digest)) return res.sendStatus(401);

  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { return res.sendStatus(400); }
  // Acknowledge Meta promptly. Process only incoming WhatsApp messages, ignore status callbacks.
  res.sendStatus(200);
  if (payload.object !== 'whatsapp_business_account') return;

  const configuredAdmin = digitsOnly(process.env.WHATSAPP_ADMIN_SENDER_WA_ID || process.env.WHATSAPP_ADMIN_PHONE_NUMBER);
  if (!configuredAdmin) {
    console.warn('[whatsapp-assistant] missing authorized sender identity');
    return;
  }
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      for (const message of change.value?.messages || []) {
        const sender = digitsOnly(message.from);
        if (!sender || sender !== configuredAdmin) {
          console.warn('[whatsapp-assistant] ignored message from unauthorized sender');
          continue;
        }
        // Basic duplicate suppression per process. For durable cross-instance dedupe, persist provider message IDs.
        const id = String(message.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (seen.size > 2000) seen.delete(seen.values().next().value);
        try {
          const reply = await commandResponse(textOf(message));
          await sendReply(sender, reply);
          console.info('[whatsapp-assistant] reply sent', { command: normalize(textOf(message)).slice(0, 32) });
        } catch (error) {
          const status = error.response?.status;
          const code = error.response?.data?.error?.code;
          console.error('[whatsapp-assistant] reply failed', { status, providerCode: code, message: error.message?.slice(0, 180) });
        }
      }
    }
  }
};
const seen = new Set();
module.exports = { verify, receive, commandResponse, MENU };
