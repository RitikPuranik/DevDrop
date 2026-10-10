/**
 * Everything Kashi knows about DevDrop's pages. Kept as plain data so the
 * navigation answer is validated against this list — Kashi can never send a
 * user to a route that doesn't exist.
 *
 * Mirror of the <Route> table in frontend/src/App.jsx. Update both together.
 */
const ROUTES = [
  { path: '/', title: 'Home', auth: false, keywords: ['home', 'main page', 'landing', 'start'], about: 'DevDrop landing page.' },
  { path: '/template', title: 'Templates marketplace', auth: false, keywords: ['template', 'templates', 'marketplace', 'browse', 'buy', 'website for sale', 'shop', 'store'], about: 'Browse and buy ready-made website templates.' },
  { path: '/ai-studio', title: 'AI Studio', auth: false, keywords: ['ai studio', 'studio', 'generate', 'build website', 'create website', 'make a website', 'portfolio', 'ai builder', 'website builder'], about: 'Generate and edit a website with AI.' },
  { path: '/workspace', title: 'Workspace', auth: true, keywords: ['workspace', 'dashboard', 'my purchases', 'my projects', 'my websites', 'my deployments', 'purchases', 'earnings', 'seller'], about: 'Your dashboard: purchases, projects, deployments.' },
  { path: '/deploy-own', title: 'Deploy your own project', auth: true, keywords: ['deploy', 'deploy own', 'deploy my repo', 'deploy github', 'vercel', 'host my project', 'deploy my project'], about: 'Deploy one of your own GitHub repositories to Vercel/Render.' },
  { path: '/profile', title: 'Profile', auth: true, keywords: ['profile', 'account', 'settings', 'my account', 'bank', 'github connect', 'password'], about: 'Your account, connected accounts and bank details.' },
  { path: '/docs', title: 'Documentation', auth: false, keywords: ['docs', 'documentation', 'guide', 'help', 'how to', 'tutorial'], about: 'DevDrop documentation.' },
  { path: '/about', title: 'About us', auth: false, keywords: ['about', 'team', 'who are you', 'about us'], about: 'About the DevDrop team.' },
  { path: '/contact', title: 'Contact us', auth: false, keywords: ['contact', 'support', 'reach', 'email us', 'complaint', 'feedback form'], about: 'Contact DevDrop support.' },
  { path: '/review', title: 'Reviews', auth: false, keywords: ['review', 'reviews', 'testimonials', 'rating'], about: 'Customer reviews.' },
  { path: '/terms', title: 'Terms', auth: false, keywords: ['terms', 'conditions', 'tos'], about: 'Terms and conditions.' },
  { path: '/privacy', title: 'Privacy policy', auth: false, keywords: ['privacy', 'data policy'], about: 'Privacy policy.' },
  { path: '/admin', title: 'Admin panel', auth: true, adminOnly: true, keywords: ['admin', 'admin panel', 'gemini pool', 'groq pool', 'coupons', 'payouts', 'review queue'], about: 'Admin tools (admins only).' },
];

const STATIC_PATHS = new Set(ROUTES.map((r) => r.path));

/** Validates a navigation target against the app map and the user's context. */
function resolveNavigation(path, context = {}) {
  if (typeof path !== 'string') return { ok: false };
  const clean = path.trim().split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const route = ROUTES.find((r) => r.path === clean);
  if (route) {
    if (route.adminOnly && context.role !== 'admin') return { ok: false, reason: 'admin_only', route };
    if (route.auth && !context.isLoggedIn) return { ok: false, reason: 'login_required', route };
    return { ok: true, path: route.path, route };
  }
  // The only dynamic target Kashi may use: the deployment the user is looking at.
  const dep = clean.match(/^\/deployments\/([a-f0-9]{24})$/i);
  if (dep && context.isLoggedIn) return { ok: true, path: clean, route: { title: 'Deployment details' } };
  return { ok: false, reason: 'unknown' };
}

/** Cheap deterministic fallback used when the Groq pool is unavailable. */
function keywordRoute(message) {
  const text = String(message || '').toLowerCase();
  let best = null;
  for (const route of ROUTES) {
    for (const kw of route.keywords) {
      if (text.includes(kw) && (!best || kw.length > best.len)) best = { route, len: kw.length };
    }
  }
  return best ? best.route : null;
}

function describeRoutes(context = {}) {
  return ROUTES
    .filter((r) => !r.adminOnly || context.role === 'admin')
    .map((r) => `- ${r.path} — ${r.title}${r.auth ? ' (login required)' : ''}: ${r.about}`)
    .join('\n');
}

module.exports = { ROUTES, STATIC_PATHS, resolveNavigation, keywordRoute, describeRoutes };
