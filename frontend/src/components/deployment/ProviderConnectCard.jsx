import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, KeyRound, Loader2, Triangle, Server, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { deploymentAPI } from '../../api/deployment';

const getBackendOrigin = () => {
  try {
    return new URL(import.meta.env.VITE_API_URL).origin;
  } catch {
    return null;
  }
};

const PROVIDER_META = {
  vercel: { label: 'Vercel', icon: Triangle, blurb: 'Hosts your frontend build.' },
  render: { label: 'Render', icon: Server, blurb: 'Hosts your backend API.' },
};

/**
 * Connect/disconnect card for one deployment provider. Vercel uses the same
 * popup + postMessage OAuth pattern as PushToGithubModal's GitHub connect;
 * Render has no OAuth flow, so it opens a small inline API-key form instead
 * (see render.provider.js for why).
 */
export default function ProviderConnectCard({ provider, status, onChange }) {
  const meta = PROVIDER_META[provider];
  const [connecting, setConnecting] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const popupRef = useRef(null);
  const popupWatcherRef = useRef(null);
  // True once a postMessage from the callback popup has been received for
  // the current attempt. The popup.closed watcher below polls every 800ms
  // and, on its own, can't distinguish "user closed the popup without
  // finishing" from "the callback page closed itself right after posting
  // a message whose finish-connect call is still in flight" — the latter
  // is the common case, since finish-connect does a token exchange + a
  // couple of Vercel API calls + a DB write, which routinely takes longer
  // than 800ms. Without this flag the watcher can fire mid-flight and
  // report "disconnected" (via onChange) before finish-connect has even
  // resolved, right as it was about to succeed.
  const messageHandledRef = useRef(false);

  useEffect(() => {
    if (provider !== 'vercel') return undefined;
    const backendOrigin = getBackendOrigin();

    const handleMessage = async (event) => {
      if (backendOrigin && event.origin !== backendOrigin) return;
      const { type, code, teamId, message } = event.data || {};
      if (type !== 'vercel-oauth-code' && type !== 'vercel-oauth-error') return;

      // Claim this attempt and stop the popup.closed watcher BEFORE the
      // `await` below, not after — otherwise the watcher's next 800ms tick
      // can still slip in while finish-connect is pending (see the ref's
      // comment above) and close it out from under us.
      messageHandledRef.current = true;
      clearInterval(popupWatcherRef.current);
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }

      if (type === 'vercel-oauth-code') {
        // The callback route can't identify a user (Vercel doesn't echo
        // back a state param), so the exchange happens here instead, on
        // the authenticated SPA — see deployment.controller.js's
        // finishConnectVercel for why.
        try {
          const res = await deploymentAPI.finishConnectVercel(code, teamId);
          const accountLabel = res.data?.data?.accountLabel;
          toast.success(`Vercel connected${accountLabel ? ` as ${accountLabel}` : ''}`);
          onChange?.();
        } catch (err) {
          toast.error(err.response?.data?.message || 'Vercel connection failed');
        } finally {
          setConnecting(false);
        }
      } else {
        toast.error(message || 'Vercel connection failed');
        setConnecting(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(popupWatcherRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const handleConnectVercel = async () => {
    try {
      setConnecting(true);
      messageHandledRef.current = false;
      const res = await deploymentAPI.connectVercel();
      const authorizeUrl = res.data?.data?.authorizeUrl;
      if (!authorizeUrl) throw new Error('No authorization URL returned');
      const popup = window.open(authorizeUrl, 'vercel-oauth', 'width=600,height=720');
      popupRef.current = popup;
      if (!popup) {
        toast.error('Please allow popups to connect Vercel');
        setConnecting(false);
        return;
      }

      // Fallback: if the callback page's postMessage never arrives at all
      // (e.g. a proxy/CDN re-adds a strict Cross-Origin-Opener-Policy
      // header and severs window.opener, or the redirect never lands on
      // our callback route in the first place), detect the popup closing
      // and re-sync status so the "Waiting…" state doesn't hang forever.
      // Gated on messageHandledRef so this doesn't fire — and wrongly
      // report a failed connection — while a finish-connect call from a
      // message that DID arrive is still in flight; see that ref's
      // comment for why the popup closing is not on its own proof that
      // nothing happened.
      clearInterval(popupWatcherRef.current);
      popupWatcherRef.current = setInterval(() => {
        if (popup.closed) {
          clearInterval(popupWatcherRef.current);
          if (!messageHandledRef.current) {
            setConnecting(false);
            toast.error("Vercel didn't confirm the connection. If you finished setup on Vercel, the popup may not have redirected back to DevDrop — double-check the integration's redirect URL, then try again.");
            onChange?.();
          }
        }
      }, 800);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start Vercel connection');
      setConnecting(false);
    }
  };

  const handleConnectRender = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    try {
      setConnecting(true);
      await deploymentAPI.connectRender(apiKey.trim());
      toast.success('Render connected');
      setShowKeyForm(false);
      setApiKey('');
      onChange?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'That API key was rejected by Render');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setConnecting(true);
      if (provider === 'vercel') await deploymentAPI.disconnectVercel();
      else await deploymentAPI.disconnectRender();
      toast.success(`${meta.label} disconnected`);
      onChange?.();
    } catch {
      toast.error(`Could not disconnect ${meta.label}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleSelectOwner = async (ownerId) => {
    try {
      await deploymentAPI.setRenderOwner(ownerId);
      setShowOwnerPicker(false);
      onChange?.();
    } catch {
      toast.error('Could not switch workspace');
    }
  };

  const Icon = meta.icon;
  const connected = Boolean(status?.connected);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <Icon size={15} className="text-white/60" />
          </div>
          <div>
            <p className="text-sm font-bold">{meta.label}</p>
            <p className="text-[11px] text-white/35">
              {connected ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 size={11} /> Connected{status.accountLabel ? ` · ${status.accountLabel}` : ''}
                </span>
              ) : (
                meta.blurb
              )}
            </p>
          </div>
        </div>

        {connected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={connecting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-white/40 text-[10px] font-black uppercase tracking-widest hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            <Unplug size={12} /> Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={provider === 'vercel' ? handleConnectVercel : () => setShowKeyForm((v) => !v)}
            disabled={connecting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-[#f2ede6] transition-colors disabled:opacity-60"
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
            {connecting ? 'Waiting…' : `Connect ${meta.label}`}
          </button>
        )}
      </div>

      {provider === 'render' && showKeyForm && !connected && (
        <form onSubmit={handleConnectRender} className="mt-4 pt-4 border-t border-white/8 space-y-2.5">
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/35 font-bold">
            <KeyRound size={11} /> Render API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="rnd_xxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-[#8b7355]/50 transition-colors"
          />
          <p className="text-[11px] text-white/25 leading-relaxed">
            Generate one from Render → Account Settings → API Keys. DevDrop stores it encrypted and uses it only to deploy on your behalf.
          </p>
          <button
            type="submit"
            disabled={connecting || !apiKey.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#8b7355] text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#725e46] transition-colors disabled:opacity-50"
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : 'Save & Connect'}
          </button>
        </form>
      )}

      {provider === 'render' && connected && (status?.owners?.length || 0) > 1 && (
        <div className="mt-3 pt-3 border-t border-white/8">
          <button
            type="button"
            onClick={() => setShowOwnerPicker((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors"
          >
            <ChevronDown size={12} className={showOwnerPicker ? 'rotate-180 transition-transform' : 'transition-transform'} />
            Deploying into: <span className="text-white/70 font-bold">{status.owners.find((o) => o.id === status.ownerId)?.name || 'workspace'}</span>
          </button>
          {showOwnerPicker && (
            <div className="mt-2 space-y-1.5">
              {status.owners.map((owner) => (
                <button
                  key={owner.id}
                  type="button"
                  onClick={() => handleSelectOwner(owner.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    owner.id === status.ownerId ? 'bg-[#8b7355]/20 text-white' : 'bg-white/[0.02] text-white/45 hover:text-white/70'
                  }`}
                >
                  {owner.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}