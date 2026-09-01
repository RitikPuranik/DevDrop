import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

/**
 * Completion page for Vercel's External Integration installation flow.
 *
 * The backend callback performs the Vercel code exchange and stores the
 * encrypted credential. This page therefore NEVER receives or exchanges a
 * Vercel authorization code. It only displays the backend result and tells
 * the opener tab to refresh provider status.
 */
export default function VercelOAuthCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('working');
  const [message, setMessage] = useState('Finishing Vercel connection…');
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const error = searchParams.get('error');
    const success = searchParams.get('status') === 'success';
    const accountLabel = searchParams.get('accountLabel');

    if (success) {
      const text = accountLabel ? `Connected as ${accountLabel}.` : 'Vercel connected.';
      setStatus('success');
      setMessage(text);
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'vercel-oauth-code-connected', accountLabel }, window.location.origin);
        }
      } catch {
        // The provider connection was already saved server-side.
      }
    } else {
      const text = error || 'Could not complete Vercel authorization. Please try connecting again.';
      setStatus('error');
      setMessage(text);
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'vercel-oauth-error', message: text }, window.location.origin);
        }
      } catch {
        // Best effort only.
      }
    }

    const timer = setTimeout(() => {
      try { window.close(); } catch { /* no-op */ }
    }, 1400);
    return () => clearTimeout(timer);
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-[#ece5d8] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        {status === 'working' && <Loader2 className="animate-spin mx-auto mb-4 text-[#8b7355]" size={28} />}
        {status === 'success' && <CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={28} />}
        {status === 'error' && <XCircle className="mx-auto mb-4 text-red-300" size={28} />}
        <p className="text-sm text-white/80">{message}</p>
        <p className="text-xs text-white/30 mt-2">You can close this window now.</p>
      </div>
    </div>
  );
}
