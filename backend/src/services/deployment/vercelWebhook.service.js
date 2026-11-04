'use strict';

const crypto = require('crypto');
const VercelWebhookEvent = require('../../modules/deployment/vercelWebhookEvent.model');
const { reconcileProjectDeployment } = require('./versionSync.service');

/**
 * Vercel -> DevDrop webhook handling.
 *
 *  - Signature: Vercel sends `x-vercel-signature` = hex HMAC-SHA1 of the RAW request body, keyed with
 *    the integration's client secret (or the secret of the webhook that was created). We compare in
 *    constant time and reject anything unsigned. If no secret is configured the endpoint refuses all
 *    traffic rather than accepting unauthenticated events.
 *  - Idempotency: delivery ids are recorded (event id only, never the payload); a repeated delivery
 *    is acknowledged without being processed again. If processing fails the record is removed so
 *    Vercel's retry can succeed.
 *  - Trust: the body is only a hint ("something changed for deployment X in project Y"). DevDrop
 *    re-reads the deployment and the project's production state from Vercel before changing anything,
 *    so a replayed or odd payload can't change which deployment DevDrop considers live.
 */

const HANDLED_PREFIX = 'deployment.';
const INLINE_BUDGET_MS = 4000;

const getSecret = () => process.env.VERCEL_WEBHOOK_SECRET || process.env.VERCEL_CLIENT_SECRET || '';

const computeSignature = (secret, rawBody) => crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

const verifySignature = (rawBody, signature, secret = getSecret()) => {
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = Buffer.from(computeSignature(secret, rawBody), 'hex');
  let provided;
  try {
    provided = Buffer.from(String(signature).trim(), 'hex');
  } catch {
    return false;
  }
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
};

const withBudget = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), ms);
    timer.unref?.();
    promise.then((v) => { clearTimeout(timer); resolve({ value: v }); }, (e) => { clearTimeout(timer); reject(e); });
  });

/**
 * @param {Buffer} rawBody
 * @param {object} headers lower-cased request headers
 * @returns {Promise<{status:number, body:object}>}
 */
const handleWebhook = async (rawBody, headers) => {
  const secret = getSecret();
  if (!secret) return { status: 503, body: { success: false, message: 'Vercel webhooks are not configured.' } };
  if (!verifySignature(rawBody, headers['x-vercel-signature'], secret)) {
    return { status: 401, body: { success: false, message: 'Invalid signature.' } };
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { status: 400, body: { success: false, message: 'Invalid JSON.' } };
  }

  const type = String(event?.type || '');
  if (!type.startsWith(HANDLED_PREFIX)) return { status: 200, body: { success: true, ignored: true } };

  const projectId = event?.payload?.project?.id || event?.payload?.projectId || null;
  const deploymentId = event?.payload?.deployment?.id || event?.payload?.deploymentId || null;
  if (!projectId || !deploymentId) return { status: 200, body: { success: true, ignored: true } };

  const eventId = String(event.id || crypto.createHash('sha256').update(rawBody).digest('hex'));
  try {
    await VercelWebhookEvent.create({ eventId, type });
  } catch (error) {
    if (error?.code === 11000) return { status: 200, body: { success: true, duplicate: true } };
    throw error;
  }

  const work = reconcileProjectDeployment(projectId, deploymentId);
  try {
    const outcome = await withBudget(work, INLINE_BUDGET_MS);
    if (outcome.timedOut) {
      // Keep going in the background; the lazy sync on next view is the backstop if this later fails.
      work.catch((e) => console.warn(`[vercel-webhook] background reconcile failed: ${e.message}`));
    }
    return { status: 200, body: { success: true } };
  } catch (error) {
    await VercelWebhookEvent.deleteOne({ eventId }).catch(() => {}); // allow Vercel's retry to be processed
    console.warn(`[vercel-webhook] reconcile failed: ${error.message}`);
    return { status: 500, body: { success: false, message: 'Processing failed.' } };
  }
};

module.exports = { handleWebhook, verifySignature, computeSignature };
