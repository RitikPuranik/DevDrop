import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Menu, X } from 'lucide-react';

const sections = [
  ['getting-started', 'Getting Started'], ['projects-purchases', 'Projects & Purchases'],
  ['github-publishing', 'GitHub Publishing'], ['vercel-deployment', 'Vercel Deployment'],
  ['render-deployment', 'Render Deployment'], ['supported-frameworks', 'Supported Frameworks'],
  ['environment-variables', 'Environment Variables'], ['troubleshooting', 'Troubleshooting'],
  ['security-credentials', 'Security & Credentials'], ['faq', 'FAQ'], ['support', 'Support'],
];

function CopyBlock({ children }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <div className="relative my-5 overflow-hidden rounded-xl border border-white/10 bg-black/50">
    <pre className="overflow-x-auto px-4 py-4 pr-12 text-xs leading-6 text-[#e8e2d6]/80 font-mono"><code>{children}</code></pre>
    <button type="button" onClick={copy} aria-label="Copy code" className="absolute right-2 top-2 rounded-lg p-2 text-white/45 hover:bg-white/10 hover:text-white transition-colors">
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  </div>;
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
    if (meta) meta.content = 'Official DevDrop documentation for projects, GitHub publishing, Vercel deployment, Render deployment, and account setup.';
    return () => { document.title = oldTitle; if (meta && oldDescription !== undefined) meta.content = oldDescription; };
  }, []);
  const nav = <nav aria-label="Documentation sections" className="space-y-1">{sections.map(([id, label]) => <a key={id} onClick={() => setMenuOpen(false)} href={`/docs#${id}`} className="block rounded-lg px-3 py-2 text-xs text-white/45 transition-colors hover:bg-white/5 hover:text-[#e8e2d6]">{label}</a>)}</nav>;
  return <div className="min-h-screen bg-[#050505] pt-28 text-[#e8e2d6] sm:pt-36">
    <header className="border-y border-white/8 bg-white/[0.015] px-[6vw] py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#8b7355]">Developer Documentation</p>
        <h1 className="mt-4 max-w-3xl font-serif text-5xl italic tracking-tighter sm:text-7xl">Build from purchase to production.</h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/50">Learn how DevDrop publishes your purchased project to GitHub and deploys supported applications into your own Vercel and Render accounts.</p>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-[6vw] py-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
      <div className="lg:hidden">
        <button type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="mb-6 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-mono uppercase tracking-widest text-white/70">
          On this page {menuOpen ? <X size={15} /> : <Menu size={15} />}
        </button>
        {menuOpen && <div className="mb-8 rounded-xl border border-white/10 bg-[#0b0b0b] p-2">{nav}</div>}
      </div>
      <aside className="hidden lg:block"><div className="sticky top-28 border-l border-white/10 pl-4"><p className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[#8b7355]">On this page</p>{nav}</div></aside>
      <article className="max-w-3xl">
        <DocSection id="getting-started" title="Getting Started"><p>DevDrop is a marketplace for website projects. Sign in, browse templates, complete a purchase, and open the project’s access page. From there, you can publish it to a repository and deploy the detected parts of the project.</p><div className="rounded-xl border border-[#8b7355]/30 bg-[#8b7355]/10 p-4 text-[#e8e2d6]"><strong>Required workflow:</strong> publish/export the project to your GitHub account first. DevDrop deploys from that exported repository, not from a local download.</div></DocSection>
        <DocSection id="projects-purchases" title="Projects & Purchases"><p>After purchase, the access page provides the project resources and deployment actions. The <strong className="text-white/80">Push to GitHub</strong> action creates an export in your own GitHub account; once its status is successful, <strong className="text-white/80">Deploy</strong> is unlocked.</p><p>Deployment history and links are available from your profile. A deployment keeps a snapshot of the exported repository so its history remains tied to the source used.</p></DocSection>
        <DocSection id="github-publishing" title="GitHub Publishing"><p>Select Push to GitHub on a purchased project. If needed, connect GitHub in the popup and approve the authorization request. Choose a valid repository name and start the export. Wait for a successful export before continuing to deployment.</p><p>DevDrop uses the exported repository and its default branch for analysis and provider deployment. If GitHub is not connected or the export did not finish successfully, DevDrop will ask you to complete that prerequisite.</p></DocSection>
        <DocSection id="vercel-deployment" title="Vercel Deployment"><p>For frontend projects, DevDrop deploys to <strong className="text-white/80">your own Vercel account</strong>; DevDrop does not host the deployed application. In the deployment flow, select <strong className="text-white/80">Connect Vercel</strong>. This opens Vercel’s Integration installation flow in a popup, where you approve the integration and choose the Vercel account or team where applicable.</p><p>After connection, DevDrop records the selected account/team context. It creates a Vercel project for the deployment, or reuses the project from an earlier deployment when redeploying. It detects the supported frontend framework and sends the matching Vercel framework preset when one is available.</p><p>Review the environment-variable fields shown by analysis, then start the deployment. The deployment is production-targeted and the status page polls through queued, build, and completion states. On failure or after cancellation, choose Retry/Redeploy to reuse the existing Vercel project; provider-side variables already configured remain in place.</p><p>Cancellation is best-effort: an in-progress Vercel build can be cancelled. For full-stack projects, DevDrop may first deploy the backend, synchronize application URLs, and redeploy the backend with the final URLs.</p></DocSection>
        <DocSection id="render-deployment" title="Render Deployment"><p>For supported backend projects, DevDrop creates the service in <strong className="text-white/80">your own Render workspace</strong>. Render connection does <strong className="text-white/80">not</strong> use OAuth: paste a personal Render API key generated in Render’s Account Settings → API Keys. DevDrop validates it and lists accessible workspaces.</p><p>If your key has more than one workspace, select the desired workspace in Connected Accounts before deploying. DevDrop creates or reuses the Render service for that deployment. Render’s current API does not expose equivalent build cancellation, so an in-progress Render build may continue after DevDrop marks a deployment cancelled.</p></DocSection>
        <DocSection id="supported-frameworks" title="Supported Frameworks"><p>The current analyzer supports only these deployment targets:</p><ul className="grid gap-2 sm:grid-cols-2"><li className="rounded-lg bg-white/[0.03] p-3">Next.js → Vercel</li><li className="rounded-lg bg-white/[0.03] p-3">React + Vite → Vercel</li><li className="rounded-lg bg-white/[0.03] p-3">Vue + Vite → Vercel</li><li className="rounded-lg bg-white/[0.03] p-3">Static HTML → Vercel</li><li className="rounded-lg bg-white/[0.03] p-3">NestJS → Render</li><li className="rounded-lg bg-white/[0.03] p-3">Express → Render</li></ul><p>Projects outside these patterns may be reported as unsupported rather than deployed with guessed settings.</p></DocSection>
        <DocSection id="environment-variables" title="Environment Variables"><p>Repository analysis scans for variable names referenced by the project and displays fields for values DevDrop cannot generate. It does not read actual secret values from your repository. Enter the required values in the deployment flow; they are configured for the relevant frontend or backend target.</p><CopyBlock>{'NODE_ENV=production\nAPI_URL=https://your-api.example'}</CopyBlock><p>Some URL and runtime values are generated automatically during a full-stack deployment. On a redeploy, DevDrop refreshes automatic values but does not ask again for the original buyer-supplied secrets.</p></DocSection>
        <DocSection id="troubleshooting" title="Troubleshooting"><p><strong className="text-white/80">Deploy is unavailable:</strong> confirm the purchase was successfully exported to GitHub, then connect every provider required by the analysis.</p><p><strong className="text-white/80">Vercel connection does not open:</strong> allow popups and retry the Integration installation flow. <strong className="text-white/80">Render key is rejected:</strong> create or paste a valid personal API key and ensure it can access at least one workspace.</p><p><strong className="text-white/80">Build failed:</strong> use the deployment status page’s retry action after correcting provider configuration or repository code. First builds can take several minutes.</p></DocSection>
        <DocSection id="security-credentials" title="Security & Credentials"><p>GitHub access tokens, Vercel access tokens, and Render API keys are stored encrypted at rest using AES-256-GCM. DevDrop uses them only to export your project or perform requested provider operations on your behalf. Secret values entered for deployment are cleared from DevDrop’s deployment record after the initial deployment.</p><p>Never put tokens or API keys in repository files, screenshots, or support messages. You can disconnect a provider from Connected Accounts to remove its connection.</p></DocSection>
        <DocSection id="faq" title="FAQ"><p><strong className="text-white/80">Can I deploy before GitHub publishing?</strong> No. A successful GitHub export is required because DevDrop deploys from your repository.</p><p><strong className="text-white/80">Where is my app hosted?</strong> In your Vercel account for supported frontends and your Render workspace for supported backends—not on DevDrop infrastructure.</p><p><strong className="text-white/80">Can I use Render OAuth?</strong> No. The current implementation uses a personal Render API key, not OAuth.</p><p><strong className="text-white/80">Will a retry create duplicates?</strong> Redeploy reuses the existing Vercel project and Render service when possible.</p></DocSection>
        <DocSection id="support" title="Support"><p>Need help with a purchase, export, or deployment? Contact the DevDrop team with the project and deployment status details (never secrets or tokens).</p><a href="https://dev-drop-gamma.vercel.app/contact" className="inline-flex items-center gap-2 rounded-xl bg-[#8b7355] px-5 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-[#725e46] transition-colors">Contact support <ExternalLink size={14} /></a></DocSection>
      </article>
    </div>
  </div>;
}
