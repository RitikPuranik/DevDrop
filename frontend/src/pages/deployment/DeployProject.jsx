import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GitBranch,
  KeyRound,
  Loader2,
  RefreshCw,
  Rocket,
  Server,
  Sparkles,
  Triangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { buyerAPI } from '../../api/buyer';
import { deploymentAPI } from '../../api/deployment';
import ProviderConnectCard from '../../components/deployment/ProviderConnectCard';

const ARCHITECTURE_LABEL = {
  FRONTEND_ONLY: 'Frontend Only',
  BACKEND_ONLY: 'Backend Only',
  FULLSTACK: 'Full Stack',
  UNKNOWN: 'Unknown',
};

export default function DeployProject() {
  const { purchaseId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [purchase, setPurchase] = useState(null);
  const [providers, setProviders] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzeError, setAnalyzeError] = useState('');
  const [envValues, setEnvValues] = useState({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId]);

  const init = async () => {
    try {
      setLoading(true);
      const res = await buyerAPI.getPurchaseDetails(purchaseId);
      const purchaseData = res.data?.data;
      const website = purchaseData?.websiteId;
      if (!website?._id) throw new Error('Project not found');
      setPurchase(purchaseData);

      // A deployment already exists for this project — manage it from its
      // own details page instead of restarting the wizard.
      const existing = await deploymentAPI.getForWebsite(website._id).then((r) => r.data?.data).catch(() => null);
      if (existing) {
        navigate(`/deployments/${existing.id}`, { replace: true });
        return;
      }

      const providersRes = await deploymentAPI.getProviders();
      setProviders(providersRes.data?.data || null);

      await runAnalysis(website._id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load this project');
      navigate('/profile', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const refreshProviders = async () => {
    const res = await deploymentAPI.getProviders();
    setProviders(res.data?.data || null);
  };

  const runAnalysis = async (websiteId) => {
    try {
      setAnalyzing(true);
      setAnalyzeError('');
      const res = await deploymentAPI.analyze(websiteId);
      setAnalysis(res.data?.data || null);
    } catch (err) {
      setAnalyzeError(err.response?.data?.message || 'Could not analyze this repository.');
    } finally {
      setAnalyzing(false);
    }
  };

  const website = purchase?.websiteId;
  const userVars = (analysis?.envPlan || []).filter((v) => v.source === 'user');
  const autoVars = (analysis?.envPlan || []).filter((v) => v.source === 'auto');

  const neededProviders = [analysis?.frontend?.provider, analysis?.backend?.provider].filter(Boolean);
  const providersReady = neededProviders.every((p) => providers?.[p]?.connected && (p !== 'render' || providers.render.ownerId));

  const handleDeploy = async () => {
    const missing = userVars.filter((v) => v.required && !String(envValues[v.key] || '').trim());
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.map((v) => v.key).join(', ')}`);
      return;
    }
    try {
      setCreating(true);
      const res = await deploymentAPI.create(website._id, envValues);
      const { deploymentId } = res.data?.data || {};
      navigate(`/deployments/${deploymentId}`, { replace: true });
    } catch (err) {
      const missingVariables = err.response?.data?.missingVariables;
      toast.error(
        missingVariables ? `Please fill in: ${missingVariables.join(', ')}` : err.response?.data?.message || 'Could not start deployment'
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="animate-spin text-white/30" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#ece5d8]">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-white/35 hover:text-white text-xs font-bold uppercase tracking-widest mb-8 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Rocket size={18} className="text-[#8b7355]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Deploy Project</h1>
        </div>
        <p className="text-white/35 text-sm mb-10 ml-[52px]">{website?.name}</p>

        {analyzing ? (
          <AnalyzingCard />
        ) : analyzeError ? (
          <ErrorCard message={analyzeError} onRetry={() => runAnalysis(website._id)} />
        ) : analysis?.architecture === 'UNKNOWN' ? (
          <UnknownArchitectureCard analysis={analysis} />
        ) : (
          analysis && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <RepositoryCard analysis={analysis} />
              <TargetsCard analysis={analysis} />

              {neededProviders.length > 0 && (
                <Section title="Connected Accounts">
                  <div className="space-y-3">
                    {neededProviders.map((p) => (
                      <ProviderConnectCard key={p} provider={p} status={providers?.[p]} onChange={refreshProviders} />
                    ))}
                  </div>
                </Section>
              )}

              {(userVars.length > 0 || autoVars.length > 0) && (
                <Section title="Environment Variables">
                  <div className="space-y-4">
                    {autoVars.length > 0 && (
                      <div className="space-y-2">
                        {autoVars.map((v) => (
                          <div key={`${v.target}-${v.key}`} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/8">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-white/70">{v.key}</span>
                              <TargetTag target={v.target} />
                            </div>
                            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-400/80 font-bold shrink-0">
                              <Sparkles size={10} /> Generated automatically
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {userVars.length > 0 && (
                      <div className="space-y-3">
                        {userVars.map((v) => (
                          <div key={`${v.target}-${v.key}`}>
                            <label className="flex items-center gap-2 text-[11px] font-mono text-white/60 mb-1.5">
                              <KeyRound size={11} className="text-white/30" />
                              {v.key} <TargetTag target={v.target} />
                            </label>
                            <input
                              type="password"
                              value={envValues[v.key] || ''}
                              onChange={(e) => setEnvValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                              placeholder={v.required ? 'Required' : 'Optional'}
                              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-sm font-mono focus:outline-none focus:border-[#8b7355]/50 transition-colors"
                            />
                          </div>
                        ))}
                        <p className="text-[11px] text-white/25 leading-relaxed">
                          These couldn't be generated automatically — DevDrop never reads your repository's actual secret values, only the variable names it references.
                        </p>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              <button
                type="button"
                onClick={handleDeploy}
                disabled={creating || !providersReady}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#8b7355] text-white text-xs font-black uppercase tracking-[0.22em] hover:bg-[#725e46] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
                {creating ? 'Starting Deployment…' : 'Start Deployment'}
              </button>
              {!providersReady && (
                <p className="text-center text-[11px] text-white/30 -mt-3">Connect the accounts above to continue.</p>
              )}
            </motion.div>
          )
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-6">
      <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-4">{title}</p>
      {children}
    </div>
  );
}

function TargetTag({ target }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${target === 'frontend' ? 'bg-blue-500/10 text-blue-300' : 'bg-purple-500/10 text-purple-300'}`}>
      {target}
    </span>
  );
}

function RepositoryCard({ analysis }) {
  return (
    <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <GitBranch size={16} className="text-white/60" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">
            {analysis.repository.owner}/{analysis.repository.repo}
          </p>
          <p className="text-[11px] text-white/30">Branch: {analysis.repository.branch}</p>
        </div>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
        <CheckCircle2 size={11} /> Detected
      </span>
    </div>
  );
}

function TargetsCard({ analysis }) {
  return (
    <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-6">
      <div className="flex items-center justify-between mb-5">
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold">Deployment Targets</p>
        <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">{ARCHITECTURE_LABEL[analysis.architecture]}</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {analysis.frontend ? (
          <TargetTile icon={Triangle} framework={analysis.frontend.framework} provider="Vercel" role="Frontend deployment" root={analysis.frontend.rootDirectory} />
        ) : (
          <EmptyTargetTile label="Frontend" note="No frontend detected in this repository." />
        )}
        {analysis.backend ? (
          <TargetTile icon={Server} framework={analysis.backend.framework} provider="Render" role="Backend deployment" root={analysis.backend.rootDirectory} />
        ) : (
          <EmptyTargetTile label="Backend" note="Not required for this project." />
        )}
      </div>
      {analysis.warnings?.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {analysis.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-2 text-[11px] text-amber-300/70">
              <AlertCircle size={12} className="mt-0.5 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function TargetTile({ icon: Icon, framework, provider, role, root }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-[#8b7355]" />
        <span className="font-bold text-sm">{framework}</span>
      </div>
      <p className="text-[11px] text-white/40 mb-3">{role}</p>
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/70">
        <ArrowRight size={10} className="text-white/25" /> {provider}
      </div>
      <p className="text-[10px] text-white/25 mt-2">Root: {root || '/'}</p>
    </div>
  );
}

function EmptyTargetTile({ label, note }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/8 bg-white/[0.01] p-4 flex flex-col justify-center">
      <span className="font-bold text-sm text-white/30 mb-1">{label}</span>
      <p className="text-[11px] text-white/25">{note}</p>
    </div>
  );
}

function AnalyzingCard() {
  const steps = ['Reading repository structure', 'Detecting frameworks', 'Scanning for environment variables', 'Building deployment plan'];
  return (
    <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-10 text-center">
      <Loader2 className="animate-spin mx-auto mb-5 text-[#8b7355]" size={26} />
      <h3 className="font-bold text-base mb-4">Analyzing repository…</h3>
      <div className="space-y-2 max-w-xs mx-auto text-left">
        {steps.map((step) => (
          <div key={step} className="flex items-center gap-2 text-white/35 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8b7355]/60 shrink-0" />
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ message, onRetry }) {
  return (
    <div className="rounded-[26px] border border-red-400/20 bg-red-500/5 p-8 text-center">
      <AlertCircle className="mx-auto mb-4 text-red-300" size={26} />
      <p className="text-red-200 text-sm mb-6 max-w-md mx-auto leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-colors"
      >
        <RefreshCw size={13} /> Try Again
      </button>
    </div>
  );
}

function UnknownArchitectureCard({ analysis }) {
  return (
    <div className="rounded-[26px] border border-amber-400/20 bg-amber-500/5 p-8 text-center">
      <AlertCircle className="mx-auto mb-4 text-amber-300" size={26} />
      <h3 className="font-bold text-base mb-2">We couldn't automatically determine how to deploy this project</h3>
      <p className="text-white/40 text-sm mb-4 max-w-md mx-auto leading-relaxed">Please review the detected configuration manually.</p>
      {analysis?.warnings?.length > 0 && (
        <div className="max-w-md mx-auto text-left space-y-1.5">
          {analysis.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-300/70">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
