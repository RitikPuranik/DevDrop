'use strict';

/**
 * Redacts secrets from deployment log text BEFORE it is cached, returned to
 * the browser or written anywhere. Logs are treated purely as untrusted text:
 * control characters / ANSI escapes are stripped and length is capped, and the
 * API returns them as JSON strings (the UI renders them as text nodes, never HTML).
 *
 * This is best-effort pattern matching — it cannot recognise an arbitrary
 * secret that has no recognisable shape and no telltale key name. It is
 * deliberately conservative: false positives (over-redaction) are preferred
 * to leaking a credential.
 */

const REDACTED = '[REDACTED]';
const MAX_MESSAGE_CHARS = 2000;

// ESC[...m style colour codes and other CSI sequences, plus OSC sequences.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
// C0 control chars except \t; \n and \r are normalised separately.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

// Keys whose *value* is sensitive in KEY=value, KEY: value or "key":"value" forms.
const SENSITIVE_KEY =
  '(?:[A-Za-z0-9_.-]*(?:secret|token|passw(?:or)?d|passwd|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|credential|auth(?:orization)?|session|cookie|signature|salt|dsn|connection[_-]?string)[A-Za-z0-9_.-]*|(?:DATABASE|MONGO(?:DB)?|POSTGRES(?:QL)?|REDIS|SUPABASE|FIREBASE|JWT|STRIPE|RAZORPAY|SENDGRID|TWILIO|OPENAI|GEMINI|GROQ|ANTHROPIC|BREVO)[A-Za-z0-9_.-]*(?:URL|URI|KEY|SECRET|TOKEN|PASSWORD|DSN))';

const RULES = [
  // PEM private key blocks (may span several log lines once joined; also catches a single line).
  { name: 'pem', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, to: REDACTED },
  // URLs with embedded credentials: scheme://user:pass@host
  { name: 'url-credentials', re: /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, to: `$1${REDACTED}:${REDACTED}@` },
  // Authorization / Cookie headers (whole value).
  { name: 'auth-header', re: /\b(authorization|proxy-authorization|x-api-key|x-auth-token|cookie|set-cookie)(\s*[:=]\s*)([^\r\n]+)/gi, to: `$1$2${REDACTED}` },
  // Bearer / Basic tokens anywhere.
  { name: 'bearer', re: /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, to: `$1 ${REDACTED}` },
  // JSON-ish: "password": "value"
  { name: 'json-kv', re: new RegExp(`(["']${SENSITIVE_KEY}["']\\s*:\\s*)(["'])(?:\\\\.|(?!\\2).)*\\2`, 'gi'), to: `$1"${REDACTED}"` },
  // KEY=value / KEY: value (quoted or bare)
  {
    name: 'kv',
    re: new RegExp(`\\b(${SENSITIVE_KEY})(\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;&"']+)`, 'gi'),
    to: `$1$2${REDACTED}`,
  },
  // Query-string credentials: ?token=abc&key=def
  { name: 'query', re: /([?&](?:access_token|token|key|api_key|apikey|secret|password|signature|sig|code)=)[^&\s#"']+/gi, to: `$1${REDACTED}` },
  // JSON Web Tokens
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, to: REDACTED },
  // Well-known provider token shapes
  { name: 'github', re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, to: REDACTED },
  { name: 'vercel', re: /\b(?:vc[a-z]_[A-Za-z0-9]{16,}|vercel_[A-Za-z0-9_]{16,})\b/g, to: REDACTED },
  { name: 'aws-access-key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, to: REDACTED },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{30,}\b/g, to: REDACTED },
  { name: 'slack', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, to: REDACTED },
  { name: 'stripe-razorpay', re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}\b|\brzp_(?:live|test)_[A-Za-z0-9]{8,}\b/g, to: REDACTED },
  { name: 'sendgrid', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, to: REDACTED },
  { name: 'npm', re: /\bnpm_[A-Za-z0-9]{30,}\b/g, to: REDACTED },
];

/** Strips ANSI/control characters and caps length. Always returns a string. */
const sanitizeText = (value) => {
  let text = typeof value === 'string' ? value : value == null ? '' : String(value);
  text = text.replace(ANSI_RE, '').replace(/\r\n?/g, '\n').replace(CONTROL_RE, '');
  if (text.length > MAX_MESSAGE_CHARS) text = `${text.slice(0, MAX_MESSAGE_CHARS)}… [truncated]`;
  return text;
};

/** sanitizeText + secret redaction. */
const redactText = (value) => {
  let text = sanitizeText(value);
  for (const rule of RULES) text = text.replace(rule.re, rule.to);
  return text;
};

/** Convenience for tests / diagnostics. */
const containsRedaction = (text) => String(text).includes(REDACTED);

module.exports = { redactText, sanitizeText, containsRedaction, REDACTED, MAX_MESSAGE_CHARS };
