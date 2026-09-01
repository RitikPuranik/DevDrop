import React, { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

const sections = [
  ['acceptance', 'Acceptance of Terms'],
  ['eligibility-accounts', 'Eligibility and Accounts'],
  ['services', 'DevDrop Services'],
  ['digital-products', 'Digital Products and Purchases'],
  ['github-integration', 'GitHub Integration'],
  ['vercel-integration', 'Vercel Integration'],
  ['render-integration', 'Render Integration'],
  ['third-party-services', 'Third-Party Services'],
  ['user-responsibilities', 'User Responsibilities'],
  ['intellectual-property', 'Intellectual Property'],
  ['prohibited-activities', 'Prohibited Activities'],
  ['deployment-disclaimer', 'Deployment Disclaimer'],
  ['availability-changes', 'Availability and Changes'],
  ['disclaimers', 'Disclaimer of Warranties'],
  ['limitation-liability', 'Limitation of Liability'],
  ['indemnification', 'Indemnification'],
  ['termination', 'Termination'],
  ['governing-law', 'Governing Law and Disputes'],
  ['contact', 'Contact'],
];

function TermsSection({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-white/8 py-10 first:border-t-0 first:pt-0">
      <h2 className="font-serif text-3xl italic tracking-tight text-[#e8e2d6] sm:text-4xl">{title}</h2>
      <div className="mt-5 space-y-4 text-sm leading-7 text-white/60">{children}</div>
    </section>
  );
}

function TermsList({ children }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-[#8b7355]">{children}</ul>;
}

export default function Terms() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const oldTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const oldDescription = meta?.content;
    document.title = 'DevDrop Terms of Service';
    if (meta) meta.content = 'Terms of Service and End User License Agreement for using the DevDrop platform, marketplace, integrations, and deployment services.';
    return () => {
      document.title = oldTitle;
      if (meta && oldDescription !== undefined) meta.content = oldDescription;
    };
  }, []);

  const navigation = (
    <nav aria-label="Terms sections" className="space-y-1">
      {sections.map(([id, label]) => (
        <a key={id} href={`/terms#${id}`} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-xs text-white/45 transition-colors hover:bg-white/5 hover:text-[#e8e2d6]">
          {label}
        </a>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#050505] pt-28 text-[#e8e2d6] sm:pt-36">
      <header className="border-y border-white/8 bg-white/[0.015] px-[6vw] py-12 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#8b7355]">Legal</p>
          <h1 className="mt-4 max-w-3xl font-serif text-5xl italic tracking-tighter sm:text-7xl">Terms of Service &amp; EULA</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/50">The terms that govern access to DevDrop’s marketplace, projects, publishing, and deployment workflows.</p>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">Effective Date: [INSERT DATE]</p>
          <p className="mt-4 max-w-3xl rounded-xl border border-[#8b7355]/30 bg-[#8b7355]/10 px-4 py-3 text-xs leading-6 text-[#e8e2d6]/80">Owner note: replace the bracketed effective-date and governing-law placeholders before publishing this draft as final legal terms.</p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-[6vw] py-8 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <div className="lg:hidden">
          <button type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="mb-6 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-mono uppercase tracking-widest text-white/70">
            On this page {menuOpen ? <X size={15} /> : <Menu size={15} />}
          </button>
          {menuOpen && <div className="mb-8 rounded-xl border border-white/10 bg-[#0b0b0b] p-2">{navigation}</div>}
        </div>
        <aside className="hidden lg:block"><div className="sticky top-28 border-l border-white/10 pl-4"><p className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[#8b7355]">On this page</p>{navigation}</div></aside>

        <article className="max-w-3xl">
          <TermsSection id="acceptance" title="1. Acceptance of Terms">
            <p>These Terms of Service and End User License Agreement (the “Terms”) govern your access to and use of DevDrop, including its website, marketplace, project-access tools, publishing tools, and deployment workflows (collectively, the “Service”). By accessing or using the Service, you agree to these Terms. If you do not agree, do not use the Service.</p>
          </TermsSection>

          <TermsSection id="eligibility-accounts" title="2. Eligibility and Accounts">
            <p>You must provide accurate, current, and complete account information and keep it up to date. You are responsible for all activity occurring through your account and for safeguarding your password, access tokens, API keys, and other credentials. Do not share your account or credentials with others.</p>
            <p>We may suspend, restrict, or terminate access where reasonably necessary to protect the Service, users, rights holders, or third parties, including where we believe these Terms, applicable law, or a provider’s terms have been violated.</p>
          </TermsSection>

          <TermsSection id="services" title="3. DevDrop Services">
            <p>DevDrop is a developer-project marketplace and management platform. Depending on the project and your account, the Service may enable you to discover and acquire developer assets or projects, manage purchase access, download available project materials, publish eligible purchased projects to your GitHub account, and initiate deployments to supported providers.</p>
            <p>Some exclusive marketplace listings may support auctions and bidding. Bidding, purchase access, publishing, and deployment are available only when offered for the relevant listing and subject to the applicable workflow, eligibility checks, and third-party account connections.</p>
          </TermsSection>

          <TermsSection id="digital-products" title="4. Digital Products and Purchases">
            <p>Marketplace items are digital products. A successful purchase gives you the access or license described on the relevant listing and in any applicable seller-provided license; it does not automatically transfer copyright, trademarks, or other intellectual-property ownership unless the listing or a separate written agreement expressly says so.</p>
            <TermsList>
              <li>Buyers must review the listing, license, compatibility information, and any stated requirements before purchasing and may use purchased materials only as permitted by the applicable license.</li>
              <li>Sellers are responsible for accurately describing their listings and for having all rights, permissions, and licenses needed to upload, sell, license, or distribute their content.</li>
              <li>You may not redistribute, resell, sublicense, publish, or make purchased products available to others except where the applicable license expressly permits it.</li>
              <li>Payments and purchase processing are handled through the payment workflow made available by DevDrop. Any payment obligations, applicable taxes, and charges associated with your purchase are your responsibility.</li>
            </TermsList>
          </TermsSection>

          <TermsSection id="github-integration" title="5. GitHub Integration">
            <p>You may choose to connect your own GitHub account and authorize DevDrop to publish or export an eligible purchased project to a repository you select. You authorize the requested GitHub connection and the provider actions needed to complete the export.</p>
            <p>You remain solely responsible for the GitHub account, repository name, visibility, collaborators, branch settings, content, and permissions you choose. DevDrop does not own your GitHub account or repositories. A successful GitHub export is required before the supported deployment workflow can use that exported repository.</p>
          </TermsSection>

          <TermsSection id="vercel-integration" title="6. Vercel Integration">
            <p>For supported frontend projects, you may connect your own Vercel account through Vercel’s integration installation flow. After you authorize the connection, DevDrop may create a Vercel project or reuse the project associated with an earlier deployment, apply supported framework settings, and configure deployment settings or environment variables required by the selected workflow.</p>
            <p>Deployments occur in your own Vercel account or selected team context. DevDrop does not host the deployed application. You are responsible for your Vercel account, project settings, domains, environment variables, billing, and compliance with Vercel’s terms.</p>
          </TermsSection>

          <TermsSection id="render-integration" title="7. Render Integration">
            <p>For supported backend projects, DevDrop can create or reuse a service in your own Render workspace. The current Render connection uses a personal Render API key that you provide; it does not use Render OAuth. DevDrop validates the key and may let you select an accessible workspace for the deployment.</p>
            <p>You are responsible for protecting the Render API key and for your Render account, workspace, services, configuration, billing, and compliance with Render’s terms. Do not provide a key you are not authorized to use.</p>
          </TermsSection>

          <TermsSection id="third-party-services" title="8. Third-Party Services">
            <p>The Service relies on or may integrate with third-party services that are present in DevDrop’s workflow, including GitHub, Vercel, Render, Razorpay for payment processing, Supabase for storage-related services, Brevo for email services, and Sentry and PostHog for service monitoring and analytics. Your use of those services is also governed by their applicable terms, policies, and practices.</p>
            <p>DevDrop is not responsible for third-party services, their content, availability, security, acts, omissions, or changes to their policies, APIs, pricing, features, or limits.</p>
          </TermsSection>

          <TermsSection id="user-responsibilities" title="9. User Responsibilities">
            <p>You must use the Service lawfully, responsibly, and in accordance with these Terms and all applicable third-party terms. You are responsible for your content, listings, purchases, repositories, deployments, credentials, and activity through the Service.</p>
            <TermsList>
              <li>Maintain the rights needed for any content you upload, sell, distribute, publish, or deploy.</li>
              <li>Protect credentials and do not share, expose, or misuse access tokens, API keys, or account access.</li>
              <li>Use integrations only with accounts and workspaces you are authorized to connect and manage.</li>
              <li>Respect intellectual-property, privacy, and other rights of others, and do not upload malicious or harmful materials.</li>
            </TermsList>
          </TermsSection>

          <TermsSection id="intellectual-property" title="10. Intellectual Property">
            <p>DevDrop and its software, design, branding, and other Service materials are owned by DevDrop or its licensors and are protected by applicable intellectual-property laws. Subject to these Terms, DevDrop grants you a limited, non-exclusive, non-transferable, revocable right to access and use the Service for its intended purposes.</p>
            <p>You retain rights in content you own, subject to the rights you grant as needed to operate the Service. Marketplace assets and projects remain subject to the license stated on the relevant listing or otherwise provided by the seller. Third-party intellectual property remains the property of its respective owners.</p>
          </TermsSection>

          <TermsSection id="prohibited-activities" title="11. Prohibited Activities">
            <p>You may not:</p>
            <TermsList>
              <li>Use the Service for illegal activity, fraud, deception, or to infringe another person’s rights.</li>
              <li>Attempt unauthorized access to accounts, systems, data, repositories, provider workspaces, or access controls.</li>
              <li>Upload, distribute, or deploy malware, credential-stealing code, destructive code, or other harmful content.</li>
              <li>Abuse GitHub, Vercel, Render, payment, storage, email, analytics, or other connected services.</li>
              <li>Scrape, crawl, automate, or overload the Service except as expressly permitted by us or applicable law.</li>
              <li>Circumvent purchase controls or redistribute purchased products without authorization.</li>
            </TermsList>
          </TermsSection>

          <TermsSection id="deployment-disclaimer" title="12. Deployment Disclaimer">
            <p>Deployment providers are independent third parties that control their own infrastructure and accounts. Deployment success, build times, availability, and compatibility are not guaranteed. DevDrop is not responsible for provider outages, account restrictions, policy changes, API changes, quotas, billing, build failures, or limits.</p>
            <p>You are responsible for reviewing and maintaining your deployment configuration, code, repositories, secrets, domains, provider accounts, and provider-side settings. A provider may continue or stop a build according to its own capabilities and policies even if a DevDrop workflow is cancelled or fails.</p>
          </TermsSection>

          <TermsSection id="availability-changes" title="13. Availability and Changes">
            <p>We may modify, add, suspend, or remove features, listings, integrations, or parts of the Service at any time. The Service may be temporarily unavailable because of maintenance, updates, third-party dependencies, security issues, or events beyond our reasonable control. We may update these Terms from time to time; continued use after an update becomes effective constitutes acceptance to the extent permitted by law.</p>
          </TermsSection>

          <TermsSection id="disclaimers" title="14. Disclaimer of Warranties">
            <p>To the fullest extent permitted by applicable law, the Service and marketplace items are provided “as is” and “as available.” DevDrop does not warrant that the Service, any listing, export, integration, or deployment will be uninterrupted, secure, error-free, compatible with every environment, or meet your requirements. Nothing in these Terms excludes warranties that cannot legally be excluded.</p>
          </TermsSection>

          <TermsSection id="limitation-liability" title="15. Limitation of Liability">
            <p>To the fullest extent permitted by applicable law, DevDrop and its affiliates, licensors, and service providers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, data, goodwill, or business opportunities arising from or related to the Service.</p>
            <p>Where liability cannot be excluded, DevDrop’s aggregate liability for claims arising from or related to the Service will be limited to the amounts you paid to DevDrop for the Service giving rise to the claim during the twelve months before the event giving rise to liability, or the minimum amount required by applicable law, whichever is greater. These limits do not apply where prohibited by law.</p>
          </TermsSection>

          <TermsSection id="indemnification" title="16. Indemnification">
            <p>To the extent permitted by applicable law, you will defend, indemnify, and hold harmless DevDrop and its affiliates, licensors, and service providers from claims, liabilities, damages, losses, and expenses arising out of or related to your misuse of the Service, your violation of these Terms or applicable law, your content or activity, or infringement or alleged infringement caused by your content or use.</p>
          </TermsSection>

          <TermsSection id="termination" title="17. Termination">
            <p>You may stop using the Service at any time. We may suspend or terminate your access, remove content, or restrict integrations where reasonably necessary for security, legal compliance, enforcement of these Terms, protection of users or third parties, or operation of the Service. Upon termination, your right to use the Service ends, but provisions that by their nature should survive—including intellectual-property, disclaimer, liability, indemnification, and dispute provisions—will survive.</p>
          </TermsSection>

          <TermsSection id="governing-law" title="18. Governing Law and Disputes">
            <p>These Terms and any dispute arising out of or related to them will be governed by the laws of <strong className="text-[#e8e2d6]">[INSERT GOVERNING LAW / JURISDICTION]</strong>, without regard to conflict-of-law principles, except where applicable law requires otherwise. The venue, courts, and dispute-resolution process should be completed by the owner before publication.</p>
          </TermsSection>

          <TermsSection id="contact" title="19. Contact">
            <p>For questions about these Terms or the Service, please visit our <a href="/contact" className="text-[#e8e2d6] underline decoration-[#8b7355]/70 underline-offset-4 transition-colors hover:text-white">Contact and Support page</a>.</p>
          </TermsSection>
        </article>
      </div>
    </div>
  );
}
