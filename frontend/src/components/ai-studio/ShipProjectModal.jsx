import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Rocket, Loader2, CheckCircle2, Circle, ExternalLink, Lock, Globe, AlertCircle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { githubAPI } from '../../api/github';
import { deploymentAPI } from '../../api/deployment';
import Github from './GithubIcon';

const POLL_MS = 2500;
const PUSH_TIMEOUT_MS = 3 * 60 * 1000;

const sanitizeRepoName = (raw) =>
  String(raw || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+/, '').replace(/[-.]+$/, '').replace(/-{2,}/g, '-').slice(0, 100) || 'devdrop-site';

const getBackendOrigin = () => {
  try { return new URL(import.meta.env.VITE_API_URL).origin; } catch { return null; }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const apiError = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

function Step({ state, label, children }) {
  const icon = state === 'done' ? <CheckCircle2 className="h-4 w-4 text-[var(--s-ok)]" />
    : state === 'active' ? <Loader2 className="h-4 w-4 animate-spin text-[var(--s-accent)]" />
    : state === 'error' ? <AlertCircle className="h-4 w-4 text-red-400" />
    : <Circle className="h-3.5 w-3.5 text-[var(--s-faint)]" />;
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] ${state === 'pending' ? 'text-[var(--s-faint)]' : 'text-[var(--s-text)]'}`}>{label}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * "Push to GitHub" / "Publish Live" for an AI Studio project.
 *  - GitHub: pushes the generated site to a NEW repo in the user's GitHub.
 *  - Live:   push (or reuse the earlier push) -> deploy that repo to the user's Vercel.
 * If GitHub / Vercel isn't connected yet, the modal shows the connect/authorize
 * step inline (same OAuth popups the rest of DevDrop already uses).
 */
export default function ShipProjectModal({ open, mode, onClose, onModeChange, projectId, title }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState(null);
  const [previousExport, setPreviousExport] = useState(null);
  const [connectingGithub, setConnectingGithub] = useState(false);

  const [repoName, setRepoName] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [pushFresh, setPushFresh] = useState(false);

  const [phase, setPhase] = useState('idle'); // idle | pushing | deploying | done | error
  const [repo, setRepo] = useState(null); // { owner, name, url, defaultBranch }
  const [error, setError] = useState('');

  const aliveRef = useRef(false);
  const popupRef = useRef(null);
  const popupWatcherRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [provRes, exportRes] = await Promise.all([
        deploymentAPI.getProviders(),
        githubAPI.getAiStudioExport(projectId).catch(() => ({ data: { data: null } })),
      ]);
      setProviders(provRes.data?.data || null);
      setPreviousExport(exportRes.data?.data || null);
    } catch (err) {
      setError(apiError(err, 'Could not load your connected accounts.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return undefined;
    aliveRef.current = true;
    setPhase('idle'); setError(''); setRepo(null); setPushFresh(false);
    setRepoName(sanitizeRepoName(title));
    refresh();
    return () => {
      aliveRef.current = false;
      clearInterval(popupWatcherRef.current);
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  // GitHub OAuth result from the popup (same contract as PushToGithubModal).
  useEffect(() => {
    const backendOrigin = getBackendOrigin();
    const onMessage = (event) => {
      if (backendOrigin && event.origin !== backendOrigin) return;
      const { type, username, message } = event.data || {};
      if (type === 'github-oauth-success') { toast.success(`GitHub connected as @${username}`); refresh(); }
      else if (type === 'github-oauth-error') toast.error(message || 'GitHub connection failed');
      else return;
      setConnectingGithub(false);
      clearInterval(popupWatcherRef.current);
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refresh]);

  const connectGithub = async () => {
    try {
      setConnectingGithub(true);
      const res = await githubAPI.connect();
      const url = res.data?.data?.authorizeUrl;
      if (!url) throw new Error('No authorization URL returned');
      const popup = window.open(url, 'github-oauth', 'width=600,height=720');
      popupRef.current = popup;
      if (!popup) { toast.error('Please allow popups to connect GitHub'); setConnectingGithub(false); return; }
      clearInterval(popupWatcherRef.current);
      popupWatcherRef.current = setInterval(() => {
        if (popup.closed) { clearInterval(popupWatcherRef.current); setConnectingGithub(false); refresh(); }
      }, 800);
    } catch (err) {
      toast.error(apiError(err, 'Could not start GitHub connection'));
      setConnectingGithub(false);
    }
  };

  // Starts a push and waits for it. Resolves to { owner, name, url, defaultBranch }.
  const pushToGithub = async () => {
    const res = await githubAPI.createAiStudioExport(projectId, {
      repositoryName: sanitizeRepoName(repoName),
      description: `${title || 'Website'} — generated with DevDrop AI Studio`,
      visibility,
    });
    const exportId = res.data?.data?.exportId;
    if (!exportId) throw new Error('GitHub push could not be started.');
    const startedAt = Date.now();
    while (aliveRef.current) {
      await sleep(POLL_MS);
      const { data } = await githubAPI.getExportStatus(exportId);
      const ex = data?.data;
      if (ex?.status === 'success') return { owner: ex.repositoryOwner, name: ex.repositoryName, url: ex.repositoryUrl, defaultBranch: ex.defaultBranch || 'main' };
      if (ex?.status === 'failed') throw new Error(ex.errorMessage || 'GitHub push failed.');
      if (Date.now() - startedAt > PUSH_TIMEOUT_MS) throw new Error('Pushing is taking longer than expected. Check your GitHub account in a minute.');
    }
    throw new Error('cancelled');
  };

  const handlePush = async () => {
    if (!providers?.github?.connected) return;
    setError(''); setPhase('pushing');
    try {
      const r = await pushToGithub();
      if (!aliveRef.current) return;
      setRepo(r); setPhase('done'); refresh();
    } catch (err) {
      if (!aliveRef.current || err.message === 'cancelled') return;
      setError(apiError(err, 'GitHub push failed.')); setPhase('error');
    }
  };

  // "Publish Live" no longer deploys from here. It makes sure the project is on
  // GitHub (reusing the earlier push unless a fresh copy is requested) and then
  // opens the workspace deploy flow with that repo preselected -- the same
  // place purchased/own projects are deployed, configured and redeployed.
  const handlePublish = async () => {
    if (!providers?.github?.connected) return;
    setError('');
    try {
      let target = null;
      const reuse = previousExport?.status === 'success' && previousExport.repositoryOwner && !pushFresh;
      if (reuse) {
        target = { owner: previousExport.repositoryOwner, name: previousExport.repositoryName, url: previousExport.repositoryUrl, defaultBranch: previousExport.defaultBranch || 'main' };
      } else {
        setPhase('pushing');
        target = await pushToGithub();
      }
      if (!aliveRef.current) return;
      setRepo(target); setPhase('done');
      onClose();
      navigate('/deploy-own', { state: { repository: target } });
    } catch (err) {
      if (!aliveRef.current || err.message === 'cancelled') return;
      setError(apiError(err, 'Could not prepare the repository.'));
      setPhase('error');
      refresh();
    }
  };

  if (!open) return null;

  const githubOk = Boolean(providers?.github?.connected);
  const busy = phase === 'pushing';
  const hasPrevious = previousExport?.status === 'success' && previousExport.repositoryOwner;
  const reusing = mode === 'live' && hasPrevious && !pushFresh;

  const field = 'w-full rounded-lg border border-[var(--s-line)] bg-[var(--s-bg)] px-3 py-2 text-[13px] text-[var(--s-text)] placeholder:text-[var(--s-faint)] focus:border-[var(--s-accent)] focus:outline-none disabled:opacity-50';
  const primary = 'flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--s-accent)] to-[var(--s-accent)] px-4 py-2.5 text-[13px] font-semibold text-[var(--s-text)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';

  const repoForm = (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--s-faint)]">Repository name</label>
        <input value={repoName} onChange={(e) => setRepoName(e.target.value)} disabled={busy} maxLength={100} className={field} placeholder="my-website" />
      </div>
      <div className="flex gap-2">
        {[['public', Globe, 'Public'], ['private', Lock, 'Private']].map(([v, Icon, label]) => (
          <button key={v} type="button" disabled={busy} onClick={() => setVisibility(v)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] ${visibility === v ? 'border-[var(--s-accent)] bg-[var(--s-raised)] text-[var(--s-text)]' : 'border-[var(--s-line)] text-[var(--s-muted)] hover:text-[var(--s-text)]'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
    </div>
  );

  const githubConnectRow = !githubOk && (
    <div className="rounded-xl border border-[var(--s-line)] bg-[var(--s-surface)] p-3">
      <p className="mb-2 text-[12px] text-[var(--s-muted)]">Authorize DevDrop to create repositories in your GitHub account.</p>
      <button type="button" onClick={connectGithub} disabled={connectingGithub} className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-[12.5px] font-semibold text-black hover:bg-[var(--s-surface)] disabled:opacity-60">
        {connectingGithub ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />} {connectingGithub ? 'Waiting for GitHub…' : 'Connect GitHub'}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--s-bg)] p-4 " onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--s-line)] bg-[var(--s-surface)] p-5 text-[var(--s-text)] shadow-none">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--s-line)] bg-[var(--s-surface)]">
              {mode === 'live' ? <Rocket className="h-4 w-4 text-[var(--s-accent)]" /> : <Github className="h-4 w-4 text-[var(--s-text)]" />}
            </span>
            <div>
              <h2 className="text-[15px] font-semibold">{mode === 'live' ? 'Publish Live' : 'Push to GitHub'}</h2>
              <p className="text-[11px] text-[var(--s-faint)]">{mode === 'live' ? 'Opens the Workspace deploy flow for this site' : 'Creates a new repo in your GitHub account'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-md p-1 text-[var(--s-muted)] hover:text-[var(--s-text)] disabled:opacity-30"><X className="h-4 w-4" /></button>
        </div>

        {loading && !providers ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[var(--s-accent)]" /></div>
        ) : mode === 'github' ? (
          <div className="space-y-4">
            {phase === 'done' && repo ? (
              <div className="space-y-3 rounded-xl border border-[var(--s-line-strong)] bg-[var(--s-raised)] p-4">
                <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--s-ok)]"><CheckCircle2 className="h-4 w-4" /> Pushed to GitHub</div>
                <a href={repo.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 break-all text-[12.5px] text-[var(--s-text)] underline underline-offset-2">{repo.owner}/{repo.name} <ExternalLink className="h-3 w-3 shrink-0" /></a>
                <button type="button" onClick={() => { setPhase('idle'); onModeChange?.('live'); }} className={primary}><Rocket className="h-4 w-4" /> Publish Live next <ArrowRight className="h-4 w-4" /></button>
              </div>
            ) : (
              <>
                {githubOk ? <p className="text-[12px] text-[var(--s-muted)]">Signed in to GitHub as <span className="text-[var(--s-text)]">@{providers.github.username}</span></p> : githubConnectRow}
                {githubOk && repoForm}
                {error && <p className="flex gap-2 rounded-lg border border-[var(--s-line-strong)] bg-[var(--s-raised)] p-3 text-[12px] text-[var(--s-err)]"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
                <button type="button" onClick={handlePush} disabled={!githubOk || busy || !repoName.trim()} className={primary}>
                  {phase === 'pushing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />} {phase === 'pushing' ? 'Pushing…' : 'Push to GitHub'}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <Step state={githubOk ? 'done' : 'pending'} label={githubOk ? `GitHub connected (@${providers.github.username})` : 'Connect GitHub'} />
              <Step state={phase === 'pushing' ? 'active' : repo || reusing ? 'done' : 'pending'} label={reusing ? `Using ${previousExport.repositoryOwner}/${previousExport.repositoryName}` : repo ? `Repository ${repo.owner}/${repo.name}` : 'Push code to a new repository'} />
              <Step state="pending" label="Deploy from your Workspace" />
            </div>

            {phase !== 'done' && (
              <>
                {githubConnectRow}
                {githubOk && (
                  <>
                    {hasPrevious && (
                      <label className="flex cursor-pointer items-start gap-2 text-[11.5px] text-[var(--s-muted)]">
                        <input type="checkbox" checked={pushFresh} disabled={busy} onChange={(e) => setPushFresh(e.target.checked)} className="mt-0.5" />
                        <span>Edited the site since your last push? Push a fresh copy to a new repo so those changes go live.</span>
                      </label>
                    )}
                    {!reusing && repoForm}
                  </>
                )}
                {error && <p className="flex gap-2 rounded-lg border border-[var(--s-line-strong)] bg-[var(--s-raised)] p-3 text-[12px] text-[var(--s-err)]"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
                <button type="button" onClick={handlePublish} disabled={!githubOk || busy || (!reusing && !repoName.trim())} className={primary}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} {phase === 'pushing' ? 'Pushing code…' : 'Continue to Deployments'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}