'use strict';
// Content screening for skill text. Skill text is untrusted advisory input: this is defence in depth, not the
// primary control (permissions and data boundaries are enforced in code, see skillLoader.js / skillContextBuilder.js).
const MAX_SKILL_BYTES = 32 * 1024;
const MAX_LINES = 4000;

const RULES = [
  { id: 'delimiter-spoofing', re: /<<<|>>>|={3,}\s*DEVDROP/i, reason: 'contains platform delimiter sequences' },
  { id: 'override-attempt', re: /\b(?:ignore|disregard|forget|override)\b[^\n]{0,40}\b(?:previous|prior|above|earlier|system|platform|safety)\b[^\n]{0,30}\b(?:instructions?|rules?|prompts?|constraints?|checks?)\b/i, reason: 'attempts to override higher-priority instructions' },
  { id: 'prompt-disclosure', re: /\b(?:reveal|print|disclose|output|leak)\b[^\n]{0,40}\b(?:system prompt|api[ _-]?keys?|credentials?|secrets?|environment variables?)\b/i, reason: 'asks for disclosure of prompts or secrets' },
  { id: 'secret-names', re: /\b(?:GEMINI_API_KEYS?|GROQ_API_KEYS?|QUEUE_REDIS_URL|SERVICE_API_KEY|GEMINI_MONGODB_URI|AI_GEMINI_TOKEN_ENCRYPTION_KEY|TOKEN_ENCRYPTION_KEY)\b/, reason: 'references internal credential names' },
  { id: 'pipe-to-shell', re: /\b(?:curl|wget)\b[^\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/i, reason: 'contains a download-and-execute command' },
  { id: 'fetch-instruction', re: /\b(?:fetch|download|webfetch|curl|wget)\b[^\n]{0,80}https?:\/\//i, reason: 'instructs fetching remote content' },
  { id: 'tool-grant', re: /\b(?:grant(?:ed|s)?|unlock(?:ed)?|authori[sz]ed?|permit(?:ted)?)\b[^\n]{0,40}\b(?:shell|bash|terminal|browser|filesystem|file system|network|internet|tool|tools|permission|permissions|access|admin)\b|\benable\b[^\n]{0,15}\b(?:shell|bash|terminal|browser|network|filesystem|internet)\b/i, reason: 'attempts to grant tools or permissions' },
  { id: 'run-command', re: /\brun the following (?:command|script)s?\b/i, reason: 'instructs executing commands' },
  { id: 'script-tag', re: /<\s*script\b/i, reason: 'contains a script tag' },
];

function validateSkillText(text, { maxBytes = MAX_SKILL_BYTES } = {}) {
  const reasons = [];
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reasons: ['empty content'] };
  if (Buffer.byteLength(text, 'utf8') > maxBytes) reasons.push(`exceeds ${maxBytes} bytes`);
  if (text.split('\n').length > MAX_LINES) reasons.push(`exceeds ${MAX_LINES} lines`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) reasons.push('contains control characters');
  for (const rule of RULES) if (rule.re.test(text)) reasons.push(`${rule.id}: ${rule.reason}`);
  return { ok: reasons.length === 0, reasons };
}

module.exports = { validateSkillText, MAX_SKILL_BYTES, RULES };
