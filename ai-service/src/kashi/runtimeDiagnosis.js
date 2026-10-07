/**
 * Kashi: tells apart a runtime crash that CODE can fix from one that needs a
 * human to set something in Vercel (a missing environment variable). Burning
 * fix rounds rewriting code for a missing VITE_SUPABASE_URL only makes the
 * repo worse, so env problems are reported instead of "fixed".
 */
const MIME_PATTERNS = [
  /Expected a JavaScript(?:-or-Wasm)? module script but the server responded with a MIME type of \"(?:text\/jsx|application\/octet-stream)\"/i,
  /Strict MIME type checking is enforced for module scripts/i,
  /server responded with a MIME type of .*text\/jsx/i,
  /server responded with a MIME type of .*application\/octet-stream/i,
];

const ENV_PATTERNS = [
  /supabase(Url|Key|Anon\w*)\s+is\s+required/i,
  /Invalid\s+supabase(Url|Key)/i,
  /Firebase:\s*Error\s*\(auth\/(invalid-api-key|configuration-not-found)\)/i,
  /\b(apiKey|api key|publishableKey|clientId|projectId)\b[^\n]{0,40}\b(is required|is missing|missing|must be provided|not provided)\b/i,
  /\b(missing|undefined|not set|not defined)\b[^\n]{0,40}\b(env(ironment)?(\s+var(iable)?s?)?|VITE_[A-Z0-9_]+|NEXT_PUBLIC_[A-Z0-9_]+|REACT_APP_[A-Z0-9_]+)\b/i,
  /\b(VITE_[A-Z0-9_]+|NEXT_PUBLIC_[A-Z0-9_]+|REACT_APP_[A-Z0-9_]+)\b[^\n]{0,40}\b(undefined|missing|not set|is required)\b/i,
  /Failed to construct 'URL': Invalid URL[^\n]*undefined/i,
];

function diagnoseRuntimeErrors(errors = []) {
  const text = (errors || []).join('\n');
  const mimeHit = MIME_PATTERNS.some((re) => re.test(text));
  if (mimeHit) {
    return {
      kind: 'hosting-config',
      hint: 'The Vercel build is serving a source module (.jsx/.tsx) or another file with the wrong MIME type. The repository deployment configuration needs to point Vercel at the Vite dist/ output; this is not a component-level code bug.',
    };
  }
  const envHit = ENV_PATTERNS.some((re) => re.test(text));
  const vars = [...new Set((text.match(/\b(?:VITE|NEXT_PUBLIC|REACT_APP)_[A-Z0-9_]+\b/g) || []))].slice(0, 6);
  if (envHit) {
    return {
      kind: 'env',
      hint: `The site builds but crashes in the browser because a configuration value looks to be missing${vars.length ? ` (${vars.join(', ')})` : ''}. Add it under Vercel → Project → Settings → Environment Variables, then redeploy. This is not something a code change can fix.`,
    };
  }
  return { kind: 'code', hint: null };
}

module.exports = { diagnoseRuntimeErrors };
