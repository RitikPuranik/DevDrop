import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, AlertTriangle } from 'lucide-react';
import { usePostHog } from '@posthog/react';

import { BOLT_DIY_URL } from '../../config/aiStudio.config';

/**
 * AI Studio.
 *
 * Previously a guided wizard (Website Type -> Details -> Assets -> Design ->
 * Review -> Generate -> Progress -> Ready) backed by DevDrop's own
 * generation-job model and a WebContainer-based PreviewWorkspace, both
 * calling Genie under the hood. The old implementation is preserved at
 * AiStudio.wizard.deprecated.jsx.bak for reference/rollback.
 *
 * Replaced with an embedded bolt.diy (https://github.com/stackblitz-labs/bolt.diy)
 * instance: bolt.diy owns prompting, code generation, the file tree, the
 * terminal, and the live WebContainer preview end-to-end. DevDrop's job here
 * is just to gate the route behind login and host it full-bleed, the same
 * way `/website` (the existing builder) is already chrome-less.
 *
 * See services/bolt-diy/DEVDROP_INTEGRATION.md for what this trades away
 * (the portfolio wizard, per-user job history, asset uploads) and what's
 * still open (SSO/prompt hand-off into the embed).
 */
export default function AiStudio() {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Same env-var gate pattern used before (Section 46) — DevDrop has no
  // established feature-flag platform.
  const aiStudioEnabled = import.meta.env.VITE_AI_STUDIO_ENABLED !== 'false';

  React.useEffect(() => {
    if (!aiStudioEnabled) navigate('/workspace', { replace: true });
  }, [aiStudioEnabled, navigate]);

  React.useEffect(() => {
    try {
      posthog?.capture('ai_studio_opened');
    } catch {
      // Analytics should never break the page.
    }
  }, [posthog]);

  if (!aiStudioEnabled) return null;

  if (!BOLT_DIY_URL) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-neutral-950 px-6 text-center text-white">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <h1 className="text-xl font-semibold">AI Studio isn't configured yet</h1>
        <p className="max-w-md text-sm text-neutral-400">
          Set <code className="rounded bg-neutral-800 px-1.5 py-0.5">VITE_BOLT_DIY_URL</code> to the URL of the
          bolt.diy service (see <code className="rounded bg-neutral-800 px-1.5 py-0.5">services/bolt-diy</code>) and
          reload.
        </p>
        <button
          type="button"
          onClick={() => navigate('/workspace')}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workspace
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <button
          type="button"
          onClick={() => navigate('/workspace')}
          className="inline-flex items-center gap-2 text-sm text-neutral-300 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to DevDrop
        </button>
        <span className="text-sm font-medium text-neutral-300">AI Studio</span>
        <a
          href={BOLT_DIY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-neutral-300 hover:text-white"
        >
          Open full screen
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="relative flex-1">
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
            <span className="text-sm text-neutral-400">Loading AI Studio…</span>
          </div>
        )}
        <iframe
          title="AI Studio"
          src={BOLT_DIY_URL}
          onLoad={() => setIframeLoaded(true)}
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write; cross-origin-isolated"
        />
      </div>
    </div>
  );
}
