import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { deploymentAPI } from '../../api/deployment';

/**
 * Lands here after Vercel redirects back from the "New Integration" flow
 * (see backend deployment.controller.js's vercelCallback for why this is a
 * real page on the FRONTEND rather than an inline HTML page on the backend
 * posting a message to window.opener).
 *
 * This page finishes the connection itself — it's just a normal tab on our
 * own origin, so it has the same localStorage (and JWT) as whichever tab
 * opened the popup, and can call finishConnectVercel directly. It then
 * best-effort notifies the opener via postMessage purely so that tab's UI
 * can refresh instantly; if that doesn't arrive (e.g. window.opener got
 * severed by vercel.com's own Cross-Origin-Opener-Policy earlier in the
 * flow), the connection has still succeeded — the opener tab will pick it
 * up next time it re-checks provider status.
 */
export default function VercelOAuthCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('working'); // 'working' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notifyOpener = (payload) => {
    try {
      if (window.opener) {
        // Same-origin page (this route lives on the frontend itself), so
        // targeting our own origin is always correct here.
        window.opener.postMessage(payload, window.location.origin);
      }
    } catch {
      // Best-effort only — the connection above has already happened
      // regardless of whether this reaches the opener.
    }
  };

  const closeSoon = () => {
    // Give the user a moment to see the result before the tab disappears;
    // window.close() only works on windows opened via script, which this
    // popup was — if it's not allowed (e.g. opened directly in a new tab
    // by the user), it silently no-ops and the "you can close this" copy
    // still applies.
    setTimeout(() => {
      try {
        window.close();
      } catch {
        // Ignore — not every tab can be closed programmatically.
      }
    }, 1200);
  };

  const run = async () => {
    const error = searchParams.get('error');
    if (error) {
      setStatus('error');
      setMessage(error);
      notifyOpener({ type: 'vercel-oauth-error', message: error });
      closeSoon();
      return;
    }

    const code = searchParams.get('code');
    if (!code) {
      setStatus('error');
      setMessage('Missing authorization code.');
      notifyOpener({ type: 'vercel-oauth-error', message: 'Missing authorization code.' });
      closeSoon();
      return;
    }

    const teamId = searchParams.get('teamId') || null;
    const configurationId = searchParams.get('configurationId') || null;
    const state = searchParams.get('state') || null;

    try {
      const res = await deploymentAPI.finishConnectVercel(code, teamId, configurationId, state);
      const accountLabel = res.data?.data?.accountLabel;
      setStatus('success');
      setMessage(accountLabel ? `Connected as ${accountLabel}.` : 'Vercel connected.');
      notifyOpener({ type: 'vercel-oauth-code-connected', accountLabel });
      closeSoon();
    } catch (err) {
      const errMessage = err.response?.data?.message || 'Could not complete Vercel authorization. Please try connecting again.';
      setStatus('error');
      setMessage(errMessage);
      notifyOpener({ type: 'vercel-oauth-error', message: errMessage });
      closeSoon();
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-[#ece5d8] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        {status === 'working' && (
          <>
            <Loader2 className="animate-spin mx-auto mb-4 text-[#8b7355]" size={28} />
            <p className="text-sm text-white/60">Finishing Vercel connection…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={28} />
            <p className="text-sm text-white/80">{message}</p>
            <p className="text-xs text-white/30 mt-2">You can close this window now.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="mx-auto mb-4 text-red-300" size={28} />
            <p className="text-sm text-white/80">{message}</p>
            <p className="text-xs text-white/30 mt-2">You can close this window and try again.</p>
          </>
        )}
      </div>
    </div>
  );
}
