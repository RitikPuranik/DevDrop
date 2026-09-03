import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, KeyRound, Loader2, Triangle, Server, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { deploymentAPI } from '../../api/deployment';

const PROVIDER_META = {
  vercel: { label: 'Vercel', icon: Triangle, blurb: 'Hosts your frontend build.' },
  render: { label: 'Render', icon: Server, blurb: 'Hosts your backend API.' },
};

/**
 * Connect/disconnect card for one deployment provider. Vercel opens a popup
 * that lands on a page of our own (VercelOAuthCallback.jsx) once it's done —
 * that page finishes the connection itself and best-effort postMessages this
 * tab to refresh instantly; see that component for why the connection can't
 * depend on window.opener alone. Render has no OAuth flow, so it opens a
 * small inline API-key form instead (see render.provider.js for why).
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

    // The popup itself now finishes the connection (see
    // VercelOAuthCallback.jsx / deployment.controller.js's vercelCallback
    // for why) — it's a page on our own origin, so it posts back to us
    // with window.location.origin as the target. This message is purely a
    // "refresh now" notification; if it never arrives (e.g. the popup's
    // trip through vercel.com severed window.opener along the way), the
    // popup.closed fallback below re-checks provider status instead of
    // assuming failure.
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const { type, accountLabel, message } = event.data || {};
      if (type !== 'vercel-oauth-code-connected' && type !== 'vercel-oauth-error') return;

      messageHandledRef.current = true;
      clearInterval(popupWatcherRef.current);
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      setConnecting(false);

      if (type === 'vercel-oauth-code-connected') {
        toast.success(`Vercel connected${accountLabel ? ` as ${accountLabel}` : ''}`);
        onChange?.();
      } else {
        toast.error(message || 'Vercel connection failed');
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

      // Fallback: the popup finishes the connection itself (see
      // VercelOAuthCallback.jsx), so postMessage is only needed to refresh
      // THIS tab instantly. If it never arrives — e.g. vercel.com's own
      // Cross-Origin-Opener-Policy severed window.opener before the popup
      // ever reached our pages, or the user just closed the popup by hand —
      // re-check provider status directly once the popup closes rather than
      // assuming failure; the connection may well have already succeeded
      // server-side even though we were never notified. Gated on
      // messageHandledRef so this doesn't double-report once a message DID
      // arrive.
      clearInterval(popupWatcherRef.current);
      popupWatcherRef.current = setInterval(async () => {
        if (popup.closed) {
          clearInterval(popupWatcherRef.current);
          if (!messageHandledRef.current) {
            setConnecting(false);
            try {
              const res = await deploymentAPI.getProviders();
              if (res.data?.data?.vercel?.connected) {
                toast.success('Vercel connected');
              } else {
                toast.error("Vercel connection wasn't completed. If you finished setup on Vercel, try connecting again.");
              }
            } catch {
              toast.error("Couldn't confirm the Vercel connection. Refresh the page to check its status.");
            }
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
                <span className="inline-flex items-center gap-1.5 text-[#cbb392]">
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