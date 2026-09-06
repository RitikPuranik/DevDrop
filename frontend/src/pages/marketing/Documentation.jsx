import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Menu, X } from 'lucide-react';

const sections = [
  ['getting-started', 'Getting Started'],
  ['how-devdrop-works', 'How DevDrop Works'],
  ['projects-purchases', 'Projects & Purchases'],
  ['github-publishing', 'GitHub Publishing'],
  ['vercel-deployment', 'Vercel Deployment'],
  ['render-deployment', 'Render Deployment'],
  ['supported-frameworks', 'Supported Frameworks'],
  ['environment-variables', 'Environment Variables'],
  ['deployment-lifecycle', 'Deployment Lifecycle'],
  ['testing-quality', 'Testing & Quality'],
  ['security-credentials', 'Security & Credentials'],
  ['troubleshooting', 'Troubleshooting'],
  ['faq', 'FAQ'],
  ['support', 'Support'],
];

function CopyBlock({ children }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(children);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="relative my-5 overflow-hidden rounded-xl border border-white/10 bg-black/50">
      <pre className="overflow-x-auto px-4 py-4 pr-12 text-xs leading-6 text-[#e8e2d6]/80 font-mono">
        <code>{children}</code>
      </pre>
      <button type="button" onClick={copy} aria-label="Copy code" className="absolute right-2 top-2 rounded-lg p-2 text-white/45 hover:bg-white/10 hover:text-white transition-colors">
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function DocSection({ id, title, children }) {
  return <section id={id} className="scroll-mt-28 border-t border-white/8 py-10 first:border-t-0 first:pt-0">
    <h2 className="font-serif text-3xl italic tracking-tight text-[#e8e2d6] sm:text-4xl">{title}</h2>
    <div className="mt-5 space-y-4 text-sm leading-7 text-white/60">{children}</div>
  </section>;
}

export default function Documentation() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const oldTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const oldDescription = meta?.content;
    document.title = 'DevDrop Documentation';
    if (meta) meta.content = 'Official DevDrop documentation for purchasing projects, GitHub publishing, Vercel and Render deployment, environment variables, and account setup.';
    return () => { document.title = oldTitle; if (meta && oldDescription !== undefined) meta.content = oldDescription; };
  }, []);

  const nav = <nav aria-label="Documentation sections" className="space-y-1">{sections.map(([id, label]) => <a key={id} onClick={() => setMenuOpen(false)} href={`/docs#${id}`} className="block rounded-lg px-3 py-2 text-xs text-white/45 transition-colors hover:bg-white/5 hover:text-[#e8e2d6]">{label}</a>)}</nav>;

  return <div className="min-h-screen bg-[#050505] pt-28 text-[#e8e2d6] sm:pt-36">
    <header className="border-y border-white/8 bg-white/[0.015] px-[6vw] py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#8b7355]">Developer Documentation</p>
        <h1 className="mt-4 max-w-4xl font-serif text-5xl italic tracking-tighter sm:text-7xl">From purchased project to production.</h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/50">The current DevDrop workflow: discover a project, complete a purchase, export it to your GitHub account, analyze the repository, and deploy supported frontend and backend workloads into your own cloud accounts.</p>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-[6vw] py-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
      <div className="lg:hidden">
        <button type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="mb-6 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-mono uppercase tracking-widest text-white/70">
          On this page {menuOpen ? <X size={15} /> : <Menu size={15} />}
        </button>
        {menuOpen && <div className="mb-8 rounded-xl border border-white/10 bg-[#0b0b0b] p-2">{nav}</div>}
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-28 border-l border-white/10 pl-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[#8b7355]">On this page</p>
          {nav}
        </div>
      </aside>

      <article className="max-w-3xl">
        <DocSection id="getting-started" title="Getting Started">
          <p>DevDrop is a marketplace for developer projects and website templates. Create an account, browse the marketplace, open a project, and complete checkout. After purchase, use the project access flow to retrieve the project and its available publishing and deployment actions.</p>
          <div className="rounded-xl border border-[#8b7355]/30 bg-[#8b7355]/10 p-4 text-[#e8e2d6]"><strong>Important:</strong> DevDrop's deployment workflow starts from a successful GitHub export. The deployment service analyzes the exported repository rather than deploying an arbitrary local ZIP directly.</div>
        </DocSection>

        <DocSection id="how-devdrop-works" title="How DevDrop Works">
          <p>The platform is split into a React frontend and a modular Node.js/Express backend. The browser handles the product experience, while the backend owns protected operations and third-party credentials.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7355]">1. Discover</p><p className="mt-2 text-white/70">Browse projects, inspect details, and choose a purchase.</p></div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7355]">2. Publish</p><p className="mt-2 text-white/70">Export the purchased project into your GitHub account.</p></div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7355]">3. Deploy</p><p className="mt-2 text-white/70">Analyze the repository and deploy supported parts to your providers.</p></div>
          </div>
          <p>Authentication, purchase ownership, payment verification, storage, exports, deployment credentials, and backup operations remain backend responsibilities. The frontend communicates with the backend through the configured API URL.</p>
        </DocSection>

        <DocSection id="projects-purchases" title="Projects & Purchases">
          <p>After a successful purchase, the access page exposes project resources and purchase-aware actions. Purchased projects can be exported to GitHub and, after a successful export, can enter the deployment flow.</p>
          <p>Your profile/workspace also exposes account and deployment information. A deployment is associated with the exported source used for that deployment so its lifecycle can be tracked independently from the original marketplace listing.</p>
        </DocSection>

        <DocSection id="github-publishing" title="GitHub Publishing">
          <p>Select <strong className="text-white/80">Push to GitHub</strong> from a purchased project. Connect GitHub through the authorization popup when necessary, then provide the repository name, description, and visibility.</p>
          <p>DevDrop verifies the purchase server-side before creating the export. The export is rate-limited, and GitHub credentials are never exposed to the frontend after authentication.</p>
          <p>Once the export is successful, DevDrop can inspect the repository's default branch and use it as the source for deployment analysis. A failed or incomplete export must be resolved before deployment can proceed.</p>
        </DocSection>

        <DocSection id="vercel-deployment" title="Vercel Deployment">
          <p>Supported frontend applications are deployed into <strong className="text-white/80">your own Vercel account or team</strong>. DevDrop does not host the resulting website.</p>
          <p>Connect Vercel through DevDrop's integration flow. The callback is handled by the backend, and the frontend receives only the result needed to complete the connection.</p>
          <p>During deployment, DevDrop analyzes the exported repository, identifies the framework, applies provider-specific configuration, and creates or reuses the corresponding Vercel project. Redeploy operations reuse the existing project when possible.</p>
          <p>Full-stack projects can require backend deployment first so application URLs can be synchronized before the frontend is finalized. DevDrop polls deployment status and exposes queued, build, completion, failure, and cancellation states.</p>
        </DocSection>

        <DocSection id="render-deployment" title="Render Deployment">
          <p>Supported backend applications are deployed into <strong className="text-white/80">your own Render workspace</strong>.</p>
          <p>Render connection currently uses a personal API key rather than OAuth. Paste the key into the Connect Render flow, let DevDrop validate it, and select the workspace when more than one is available.</p>
          <p>DevDrop creates or reuses a Render service for the deployment. Render does not provide the same build-cancellation behavior as Vercel for this workflow, so a provider-side build may continue even after DevDrop records a cancellation request.</p>
        </DocSection>

        <DocSection id="supported-frameworks" title="Supported Frameworks">
          <p>The current repository analyzer recognizes these deployment targets:</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            <li className="rounded-lg bg-white/[0.03] p-3">Next.js → Vercel</li>
            <li className="rounded-lg bg-white/[0.03] p-3">React + Vite → Vercel</li>
            <li className="rounded-lg bg-white/[0.03] p-3">Vue + Vite → Vercel</li>
            <li className="rounded-lg bg-white/[0.03] p-3">Static HTML → Vercel</li>
            <li className="rounded-lg bg-white/[0.03] p-3">NestJS → Render</li>
            <li className="rounded-lg bg-white/[0.03] p-3">Express → Render</li>
          </ul>
          <p>The analyzer is rule-driven. Unsupported repositories should be reported as unsupported rather than deployed with guessed settings.</p>
        </DocSection>

        <DocSection id="environment-variables" title="Environment Variables">
          <p>DevDrop's frontend uses Vite environment variables prefixed with <code className="text-white/80">VITE_</code>. These are browser-visible configuration values, not private secrets.</p>
          <CopyBlock>{'VITE_API_URL=http://localhost:5000\nVITE_RAZORPAY_KEY_ID=your_razorpay_key_id\nVITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com\nVITE_POSTHOG_PROJECT_TOKEN=your_posthog_project_token\nVITE_POSTHOG_HOST=https://us.i.posthog.com\nVITE_SENTRY_DSN=your_sentry_dsn'}</CopyBlock>
          <p>Backend-only credentials such as MongoDB credentials, JWT signing secrets, Supabase service-role keys, GitHub secrets, Vercel secrets, Render API keys, and encryption keys must remain on the server.</p>
        </DocSection>

        <DocSection id="deployment-lifecycle" title="Deployment Lifecycle">
          <p>A deployment moves through a controlled sequence rather than directly jumping from a repository to a URL:</p>
          <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4 font-mono text-xs leading-7 text-white/60">
            <div>Repository export</div><div>↓</div><div>Repository / framework analysis</div><div>↓</div><div>Provider connection + required configuration</div><div>↓</div><div>Project / service creation or reuse</div><div>↓</div><div>Build + deployment polling</div><div>↓</div><div>Live URL + deployment history</div>
          </div>
          <p>Users can inspect deployment details, redeploy supported deployments, and cancel where provider APIs allow it. Deployment creation is rate-limited per user to protect provider and platform resources.</p>
        </DocSection>

        <DocSection id="testing-quality" title="Testing & Quality">
          <p>The backend test suite is centralized under <code className="text-white/80">backend/tests/</code> and is split into unit, API, and integration coverage. The active Jest configuration collects those three directories and targets <code className="text-white/80">src/**/*.js</code> for coverage.</p>
          <p>The frontend uses Vitest with Testing Library and jsdom. Frontend quality checks include tests, ESLint, and the production Vite build.</p>
          <CopyBlock>{'cd backend\nnpm test\nnpm run test:unit\nnpm run test:api\nnpm run test:integration\nnpm run test:coverage\n\ncd ../frontend\nnpm test\nnpm run lint\nnpm run build'}</CopyBlock>
          <p>Coverage output is generated locally or in CI and is intentionally not committed to the repository.</p>
        </DocSection>

        <DocSection id="security-credentials" title="Security & Credentials">
          <p>DevDrop uses JWT-based authentication, role-aware authorization, request validation, security middleware, rate limiting, and encrypted storage for provider credentials.</p>
          <p>GitHub, Vercel, and Render credentials are encrypted at rest with AES-256-GCM. GitHub export checks purchase ownership on the backend before repository operations are performed.</p>
          <p>Never paste access tokens, API keys, JWT secrets, database credentials, or encryption keys into repository files, screenshots, support requests, or browser-exposed environment variables.</p>
        </DocSection>

        <DocSection id="troubleshooting" title="Troubleshooting">
          <p><strong className="text-white/80">Deploy is unavailable:</strong> confirm that the project purchase is valid, the GitHub export completed successfully, and the provider required by the analyzer is connected.</p>
          <p><strong className="text-white/80">GitHub export failed:</strong> reconnect GitHub if the authorization expired, verify the repository name is valid, and retry after the export rate limit window when necessary.</p>
          <p><strong className="text-white/80">Vercel connection fails:</strong> allow browser popups and retry the integration flow. <strong className="text-white/80">Render connection fails:</strong> use a valid personal API key with workspace access.</p>
          <p><strong className="text-white/80">Build failed:</strong> inspect the deployment details, correct repository or provider configuration, then use the redeploy/retry action. Do not expose credentials while debugging.</p>
        </DocSection>

        <DocSection id="faq" title="FAQ">
          <p><strong className="text-white/80">Can I deploy a project before exporting it to GitHub?</strong> No. The current deployment analyzer reads the exported repository.</p>
          <p><strong className="text-white/80">Does DevDrop host my deployed app?</strong> No. Supported frontends are deployed to your Vercel account/team and supported backends to your Render workspace.</p>
          <p><strong className="text-white/80">Does Render use OAuth?</strong> No. The current Render workflow uses a personal API key.</p>
          <p><strong className="text-white/80">Can DevDrop deploy any repository?</strong> No. Only the currently supported framework patterns are accepted by the analyzer.</p>
          <p><strong className="text-white/80">Where are my deployment credentials stored?</strong> Provider credentials are handled by the backend and encrypted at rest. They are not stored as frontend source code.</p>
        </DocSection>

        <DocSection id="support" title="Support">
          <p>Need help with a purchase, GitHub export, account connection, or deployment? Use the DevDrop contact flow and include the project name and non-sensitive deployment status details.</p>
          <a href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-[#8b7355] px-5 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-[#725e46] transition-colors">Contact support <ExternalLink size={14} /></a>
        </DocSection>
      </article>
    </div>
  </div>;
}
