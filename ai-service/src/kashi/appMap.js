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
  { path: '/workspace', title: 'Workspace', auth: true, keywords: ['workspace', 'dashboard', 'my projects', 'my websites', 'earnings', 'seller'], about: 'Your dashboard overview: purchases, listings, deployments, earnings.' },
  { path: '/deploy-own', title: 'Deploy your own project', auth: true, keywords: ['deploy', 'deploy own', 'deploy my repo', 'deploy github', 'vercel', 'host my project', 'deploy my project'], about: 'Deploy one of your own GitHub repositories to Vercel/Render.' },
  { path: '/profile', title: 'Profile', auth: true, keywords: ['profile', 'account', 'settings', 'my account', 'github connect', 'password'], about: 'Your account and connected accounts.' },
  { path: '/docs', title: 'Documentation', auth: false, keywords: ['docs', 'documentation', 'guide', 'help', 'how to', 'tutorial'], about: 'DevDrop documentation.' },
  { path: '/about', title: 'About us', auth: false, keywords: ['about', 'team', 'who are you', 'about us'], about: 'About the DevDrop team.' },
  { path: '/contact', title: 'Contact us', auth: false, keywords: ['contact', 'support', 'reach', 'email us', 'complaint', 'feedback form'], about: 'Contact DevDrop support.' },
  { path: '/review', title: 'Reviews', auth: false, keywords: ['review', 'reviews', 'testimonials', 'rating'], about: 'Customer reviews.' },
  { path: '/terms', title: 'Terms', auth: false, keywords: ['terms', 'conditions', 'tos'], about: 'Terms and conditions.' },
  { path: '/privacy', title: 'Privacy policy', auth: false, keywords: ['privacy', 'data policy'], about: 'Privacy policy.' },
  { path: '/admin', title: 'Admin panel', auth: true, adminOnly: true, keywords: ['admin', 'admin panel', 'gemini pool', 'groq pool', 'coupons', 'admin payouts', 'review queue'], about: 'Admin tools (admins only).' },
  // Deep links inside the workspace / profile. Paths include the query/hash on purpose: the model may only
  // use these exact strings (see resolveNavigation), so it can never invent a section.
  { path: '/workspace?section=pricing', title: 'Billing, plans & usage', auth: true, keywords: ['billing', 'pricing', 'plans', 'plan', 'upgrade', 'subscription', 'quota', 'usage', 'invoice', 'renew', 'cancel plan', 'payment history'], about: 'Your current plan, monthly AI Studio quota used/left, upgrade and renewal.' },
  { path: '/workspace?section=listings', title: 'My listings (sell a website)', auth: true, keywords: ['my listings', 'listing', 'list my website', 'sell', 'sell my website', 'upload website', 'upload template', 'submit project', 'submit website', 'add listing'], about: 'Submit a website/template to the marketplace for review and manage your listings.' },
  { path: '/workspace?section=purchases', title: 'My purchases', auth: true, keywords: ['my purchases', 'purchases', 'bought', 'orders'], about: 'Templates you bought.' },
  { path: '/workspace?section=deployments', title: 'My deployments', auth: true, keywords: ['deployments', 'my deployments', 'deployed sites'], about: 'Sites you deployed.' },
  { path: '/workspace?section=wishlist', title: 'Wishlist', auth: true, keywords: ['wishlist', 'saved templates', 'favourites', 'favorites'], about: 'Templates you saved.' },
  { path: '/profile#payout-details', title: 'Payout details', auth: true, keywords: ['payout', 'payouts', 'payout details', 'upi', 'get paid', 'bank', 'bank details', 'withdraw'], about: 'Where you add the UPI ID + phone number that sellers need before listing paid websites.' },
];


const STATIC_PATHS = new Set(ROUTES.map((r) => r.path));

/** Validates a navigation target against the app map and the user's context. */
function resolveNavigation(path, context = {}) {
  if (typeof path !== 'string') return { ok: false };
  const raw = path.trim();
  const clean = raw.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  // A deep link (query/hash) must match a known target exactly; anything else falls back to its bare path.
  const route = ROUTES.find((r) => r.path === raw) || ROUTES.find((r) => r.path === clean);
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
