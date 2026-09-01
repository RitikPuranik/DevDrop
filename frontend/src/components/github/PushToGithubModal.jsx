import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GitBranch, Loader2, CheckCircle2, ExternalLink, Lock, Globe, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { githubAPI } from '../../api/github';

const sanitizeRepoName = (rawName) => String(rawName || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+/, '').replace(/[-.]+$/, '').replace(/-{2,}/g, '-').slice(0, 100) || 'devdrop-project';
const getBackendOrigin = () => { try { return new URL(import.meta.env.VITE_API_URL).origin; } catch { return null; } };
const isGithubAuthExpired = (message = '') => /github (authorization|connection).*(expired|revoked)|authorization has expired/i.test(String(message));

export default function PushToGithubModal({ open, onClose, website }) {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [connected, setConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [repositoryName, setRepositoryName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [submitting, setSubmitting] = useState(false);
  const [exportState, setExportState] = useState(null);
  const [previousExport, setPreviousExport] = useState(null);
  const popupRef = useRef(null);
  const pollTimerRef = useRef(null);
  const popupWatcherRef = useRef(null);

  useEffect(() => {
    if (!open || !website?._id) return;
    setExportState(null); setRepositoryName(sanitizeRepoName(website.name)); setDescription(`${website.name} — purchased from DevDrop`); setVisibility('public'); refreshStatus();
    return () => { clearTimeout(pollTimerRef.current); clearInterval(popupWatcherRef.current); if (popupRef.current && !popupRef.current.closed) popupRef.current.close(); };
  }, [open, website?._id]);

  useEffect(() => {
    const backendOrigin = getBackendOrigin();
    const handleMessage = (event) => {
      if (backendOrigin && event.origin !== backendOrigin) return;
      const { type, username, message } = event.data || {};
      if (type === 'github-oauth-success') { toast.success(`GitHub connected as @${username}`); setConnecting(false); setExportState(null); refreshStatus(); }
      else if (type === 'github-oauth-error') { toast.error(message || 'GitHub connection failed'); setConnecting(false); }
      else return;
      clearInterval(popupWatcherRef.current); if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
    window.addEventListener('message', handleMessage); return () => window.removeEventListener('message', handleMessage);
  }, []);

  const refreshStatus = async () => {
    try {
      setCheckingStatus(true);
      const [statusRes, exportRes] = await Promise.all([githubAPI.getStatus(), githubAPI.getExportForWebsite(website._id).catch(() => ({ data: { data: null } }))]);
      const statusData = statusRes.data?.data;
      setConnected(Boolean(statusData?.connected)); setGithubUsername(statusData?.username || ''); setPreviousExport(exportRes.data?.data || null);
    } catch { setConnected(false); setGithubUsername(''); } finally { setCheckingStatus(false); }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true); const res = await githubAPI.connect(); const authorizeUrl = res.data?.data?.authorizeUrl; if (!authorizeUrl) throw new Error('No authorization URL returned');
      const popup = window.open(authorizeUrl, 'github-oauth', 'width=600,height=720'); popupRef.current = popup;
      if (!popup) { toast.error('Please allow popups to connect GitHub'); setConnecting(false); return; }
      clearInterval(popupWatcherRef.current); popupWatcherRef.current = setInterval(() => { if (popup.closed) { clearInterval(popupWatcherRef.current); setConnecting(false); refreshStatus(); } }, 800);
    } catch (err) { toast.error(err.response?.data?.message || 'Could not start GitHub connection'); setConnecting(false); }
  };

  const pollExportStatus = (exportId, startedAt = Date.now()) => {
    clearTimeout(pollTimerRef.current);
    pollTimerRef.current = setTimeout(async () => {
      try {
        const res = await githubAPI.getExportStatus(exportId); const data = res.data?.data; setExportState(data);
        if (data?.status === 'success') { setSubmitting(false); return; }
        if (data?.status === 'failed') {
          setSubmitting(false);
          if (isGithubAuthExpired(data.errorMessage)) { setConnected(false); setGithubUsername(''); toast.error('Your GitHub authorization has expired. Reconnect GitHub to continue.'); }
          return;
        }
        if (Date.now() - startedAt > 180000) { setSubmitting(false); setExportState((prev) => ({ ...prev, status: 'failed', errorMessage: 'This is taking longer than expected. Check back shortly.' })); return; }
        pollExportStatus(exportId, startedAt);
      } catch { setSubmitting(false); }
    }, 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); const cleanName = sanitizeRepoName(repositoryName); if (!cleanName) return toast.error('Please enter a repository name');
    try {
      setSubmitting(true); setExportState({ status: 'pending' });
      const res = await githubAPI.createExport(website._id, { repositoryName: cleanName, description: description?.trim() || undefined, visibility });
      const { exportId, status } = res.data?.data || {}; setExportState({ status: status || 'pending' }); pollExportStatus(exportId);
    } catch (err) {
      setSubmitting(false); const msg = err.response?.data?.message || 'Could not start the export'; setExportState({ status: 'failed', errorMessage: msg });
      if (isGithubAuthExpired(msg)) { setConnected(false); setGithubUsername(''); toast.error('Your GitHub authorization has expired. Reconnect GitHub to continue.'); } else toast.error(msg);
    }
  };

  const handleClose = () => { clearTimeout(pollTimerRef.current); onClose?.(); };
  if (!open) return null;
  const isProcessing = exportState?.status === 'pending' || exportState?.status === 'processing';
  const isSuccess = exportState?.status === 'success';
  const expired = !connected && isGithubAuthExpired(exportState?.errorMessage);

  return <AnimatePresence><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={handleClose}>
    <motion.div initial={{ opacity: 0, y: 20, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .98 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg bg-[#0b0b0b] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
      <button type="button" onClick={handleClose} className="absolute top-5 right-5 text-white/30 hover:text-white"><X size={18} /></button>
      <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center"><GitBranch size={18} className="text-[#8b7355]" /></div><div><h2 className="text-lg font-black">Push to GitHub</h2><p className="text-white/35 text-xs">{website?.name}</p></div></div>
      {checkingStatus ? <div className="flex items-center justify-center py-14 text-white/30"><Loader2 className="animate-spin" size={24} /></div>
      : isSuccess ? <SuccessView exportState={exportState} onClose={handleClose} />
      : isProcessing ? <ProcessingView />
      : !connected ? <ConnectView connecting={connecting} onConnect={handleConnect} expired={expired} />
      : <ExportForm repositoryName={repositoryName} setRepositoryName={setRepositoryName} description={description} setDescription={setDescription} visibility={visibility} setVisibility={setVisibility} githubUsername={githubUsername} onSubmit={handleSubmit} submitting={submitting} errorMessage={exportState?.status === 'failed' ? exportState.errorMessage : null} previousExport={previousExport} />}
    </motion.div></motion.div></AnimatePresence>;
}

function ConnectView({ connecting, onConnect, expired }) { return <div className="text-center py-6"><div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-5"><GitBranch size={24} className="text-white/60" /></div><h3 className="font-bold text-base mb-2">{expired ? 'Reconnect GitHub' : 'Connect GitHub'}</h3><p className="text-white/40 text-sm leading-relaxed max-w-sm mx-auto mb-6">{expired ? 'Your previous GitHub authorization is no longer valid. Reconnect your account to continue exporting.' : 'Connect your GitHub account to export your purchased project directly into a repository you own.'}</p><button type="button" onClick={onConnect} disabled={connecting} className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-[0.18em] disabled:opacity-60">{connecting ? <Loader2 size={14} className="animate-spin" /> : expired ? <RefreshCw size={14} /> : <GitBranch size={14} />}{connecting ? 'Waiting for GitHub…' : expired ? 'Reconnect GitHub' : 'Connect GitHub'}</button></div>; }

function ExportForm({ repositoryName, setRepositoryName, description, setDescription, visibility, setVisibility, githubUsername, onSubmit, submitting, errorMessage, previousExport }) { const cleanPreview = sanitizeRepoName(repositoryName); return <form onSubmit={onSubmit} className="space-y-5"><div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold uppercase tracking-[0.18em]"><CheckCircle2 size={12} /> GitHub Connected · @{githubUsername}</div>{previousExport?.status === 'success' && previousExport?.repositoryUrl && <a href={previousExport.repositoryUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10 text-xs text-white/50"><span>Previously exported to {previousExport.repositoryUrl.replace('https://','')}</span><ExternalLink size={12}/></a>}<div><label className="block text-[10px] uppercase tracking-[0.2em] text-white/35 font-bold mb-2">Repository Name</label><input value={repositoryName} onChange={(e)=>setRepositoryName(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10 text-sm" /><p className="text-[11px] text-white/25 mt-1.5">Will be created as <span className="text-white/45">{githubUsername}/{cleanPreview}</span></p></div><div><label className="block text-[10px] uppercase tracking-[0.2em] text-white/35 font-bold mb-2">Description</label><textarea value={description} onChange={(e)=>setDescription(e.target.value)} rows={2} maxLength={350} className="w-full px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10 text-sm resize-none" /></div><div><label className="block text-[10px] uppercase tracking-[0.2em] text-white/35 font-bold mb-2">Repository Visibility</label><div className="grid grid-cols-2 gap-3"><VisibilityOption icon={Globe} label="Public" active={visibility==='public'} onClick={()=>setVisibility('public')} /><VisibilityOption icon={Lock} label="Private" active={visibility==='private'} onClick={()=>setVisibility('private')} /></div></div>{errorMessage && <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-400/20 text-red-200 text-xs"><AlertCircle size={14}/><span>{errorMessage}</span></div>}<button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#8b7355] text-white text-xs font-black uppercase tracking-[0.2em] disabled:opacity-60">{submitting ? <Loader2 size={14} className="animate-spin"/> : <ArrowRight size={14}/>} {submitting ? 'Creating…' : 'Create & Push'}</button></form>; }
function VisibilityOption({ icon: Icon, label, active, onClick }) { return <button type="button" onClick={onClick} className={`flex items-center gap-2 justify-center px-4 py-3 rounded-2xl border text-xs font-bold uppercase tracking-widest ${active?'bg-[#8b7355] border-[#8b7355] text-white':'bg-white/[0.02] border-white/10 text-white/40'}`}><Icon size={14}/>{label}</button>; }
function ProcessingView(){return <div className="py-8 text-center"><Loader2 className="animate-spin mx-auto mb-5 text-[#8b7355]" size={28}/><h3 className="font-bold text-base mb-4">Exporting to GitHub…</h3><p className="text-white/30 text-xs">Creating repository and uploading project files.</p></div>}
function SuccessView({exportState,onClose}){return <div className="text-center py-6"><div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5"><CheckCircle2 size={26} className="text-emerald-400"/></div><h3 className="font-bold text-base mb-2">Successfully exported!</h3><p className="text-white/40 text-sm mb-6 break-all px-4">{exportState?.repositoryUrl}</p><div className="flex flex-col gap-2.5"><a href={exportState?.repositoryUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-[0.18em]"><ExternalLink size={14}/>Open Repository</a><button type="button" onClick={onClose} className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-[0.18em]">Close</button></div></div>}
