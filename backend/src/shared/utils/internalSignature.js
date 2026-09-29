const crypto = require('crypto');

// HMAC-SHA256 signing for Backend <-> Worker internal webhooks.
// Signed string = `${timestamp}.${rawBody}`; the timestamp bounds replay.

const SIGNATURE_HEADER = 'x-internal-signature';
const TIMESTAMP_HEADER = 'x-internal-timestamp';
const MAX_SKEW_MS = 5 * 60 * 1000;

const compute = (secret, timestamp, rawBody) =>
  crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

const signBody = (secret, rawBody) => {
  const timestamp = String(Date.now());
  return { timestamp, signature: compute(secret, timestamp, rawBody) };
};

const buildHeaders = (secret, rawBody) => {
  const { timestamp, signature } = signBody(secret, rawBody);
  return {
    'Content-Type': 'application/json',
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signature,
  };
};

// Returns { ok, reason }. Reasons never contain the secret or the signature.
const checkSignature = (secret, headers, rawBody) => {
  if (!secret) return { ok: false, reason: 'INTERNAL_WEBHOOK_SECRET is not set on this service' };
  const timestamp = headers[TIMESTAMP_HEADER];
  const signature = headers[SIGNATURE_HEADER];
  if (!timestamp || !signature) return { ok: false, reason: 'missing signature headers (caller is not signing, or is not the Backend/Worker)' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return { ok: false, reason: 'timestamp outside the allowed 5-minute window (check both machines\' clocks)' };
  }

  const expected = Buffer.from(compute(secret, timestamp, rawBody || ''), 'hex');
  const provided = Buffer.from(String(signature), 'hex');
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'signature mismatch (INTERNAL_WEBHOOK_SECRET differs between Backend and Worker)' };
  }
  return { ok: true };
};

const verifySignature = (secret, headers, rawBody) => checkSignature(secret, headers, rawBody).ok;

// Express middleware factory. Requires req.rawBody (set by the json `verify` hook below).
const requireInternalSignature = (getSecret) => (req, res, next) => {
  const check = checkSignature(getSecret(), req.headers, req.rawBody);
  if (!check.ok) {
    console.warn(`🚫 Rejected internal webhook ${req.method} ${req.originalUrl}: ${check.reason}`);
    return res.status(401).json({ success: false, message: 'Invalid internal signature' });
  }
  next();
};

// express.json({ verify }) hook to keep the exact bytes that were signed.
const captureRawBody = (req, res, buf) => {
  req.rawBody = buf.toString('utf8');
};

module.exports = {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  buildHeaders,
  verifySignature,
  requireInternalSignature,
  captureRawBody,
};
