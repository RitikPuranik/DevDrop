import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  ExternalLink,
  FileCode,
  FileText,
  Film,
  GitBranch,
  Loader2,
  Rocket,
  ShieldCheck,
} from 'lucide-react';
import { buyerAPI } from '../../api/buyer';
import { assetAPI } from '../../api/asset';
import { githubAPI } from '../../api/github';
import { deploymentAPI } from '../../api/deployment';
import { toast } from 'sonner';
import PushToGithubModal from '../../components/github/PushToGithubModal';

export default function PurchaseAccess() {
  const { purchaseId } = useParams();
  const navigate = useNavigate();
  const previewRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [purchase, setPurchase] = useState(null);
  const [assets, setAssets] = useState(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState('');
  const [previewFallbackTried, setPreviewFallbackTried] = useState(false);
  const [githubModalOpen, setGithubModalOpen] = useState(false);
  const [githubExport, setGithubExport] = useState(null);
  const [latestDeployment, setLatestDeployment] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/', { replace: true });
      return;
    }

    fetchPurchaseAccess();
  }, [purchaseId, navigate]);

  useEffect(() => {
    const video = previewRef.current;
    if (!video || !previewVideoUrl) return;

    const tryPlay = () => {
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    };

    video.load();

    if (video.readyState >= 2) {
      tryPlay();
      return undefined;
    }

    video.onloadeddata = tryPlay;
    return () => {
      video.onloadeddata = null;
    };
  }, [previewVideoUrl]);

  const fetchPurchaseAccess = async () => {
    try {
      setLoading(true);
      setAssets(null);
      setPreviewVideoUrl('');
      setPreviewFallbackTried(false);
      const res = await buyerAPI.getPurchaseDetails(purchaseId);
      const purchaseData = res.data?.data;
      const website = purchaseData?.websiteId;

      setPurchase(purchaseData || null);
      setPreviewVideoUrl(website?.files?.previewVideo?.url || '');

      if (website?._id) {
        await Promise.all([
          fetchAssets(website._id),
          !website?.files?.previewVideo?.url ? fetchPreviewFallback(website._id) : Promise.resolve(),
          fetchGithubExport(website._id),
          fetchLatestDeployment(website._id),
        ]);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Purchase not found');
      navigate('/workspace', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  // Whether "Deploy" should go straight to the deployment wizard or explain
  // the GitHub-publishing prerequisite first (spec: publish before deploy).
  const fetchGithubExport = async (websiteId) => {
    try {
      const res = await githubAPI.getExportForWebsite(websiteId);
      setGithubExport(res.data?.data || null);
    } catch {
      setGithubExport(null);
    }
  };

  const fetchLatestDeployment = async (websiteId) => {
    try {
      const res = await deploymentAPI.getForWebsite(websiteId);
      setLatestDeployment(res.data?.data || null);
    } catch {
      setLatestDeployment(null);
    }
  };

  const isPublishedToGithub = githubExport?.status === 'success';

  const handleDeployClick = () => {
    if (!isPublishedToGithub) {
      toast.info('Publish this project to GitHub first — DevDrop deploys from your repository.');
      setGithubModalOpen(true);
      return;
    }
    if (latestDeployment) {
      navigate(`/deployments/${latestDeployment.id}`);
    } else {
      navigate(`/deploy/${purchaseId}`);
    }
  };

  const deployButtonProps = (() => {
    if (!isPublishedToGithub) {
      return { label: 'Deploy', helper: 'Publish to GitHub first to unlock deployment', variant: 'neutral' };
    }
    if (latestDeployment?.status === 'SUCCESS') {
      return { label: 'View Deployment', helper: latestDeployment.vercel?.url || latestDeployment.render?.url || 'Live — manage or redeploy', variant: 'success' };
    }
    if (latestDeployment?.isActive) {
      return { label: 'Deployment In Progress', helper: 'View live progress', variant: 'info' };
    }
    if (latestDeployment?.status === 'FAILED') {
      return { label: 'View Deployment', helper: 'Last attempt failed — view details to retry', variant: 'neutral' };
    }
    return { label: 'Deploy', helper: 'Deploy to your own Vercel & Render accounts', variant: 'brand' };
  })();

  const fetchAssets = async (websiteId) => {
    try {
      setLoadingAssets(true);
      const res = await assetAPI.getAssetUrls(websiteId);
      const assetData = res.data?.data || null;
      setAssets(assetData);

      if (assetData?.previewVideo?.url) {
        setPreviewVideoUrl(assetData.previewVideo.url);
      }
    } catch (err) {
      setAssets(null);
      toast.error(err.response?.data?.message || 'Failed to load downloads');
    } finally {
      setLoadingAssets(false);
    }
  };

  const fetchPreviewFallback = async (websiteId) => {
    if (previewFallbackTried) return;

    try {
      setPreviewFallbackTried(true);
      const res = await assetAPI.getPreviewUrl(websiteId);
      const url = res.data?.data?.url;
      if (url) {
        setPreviewVideoUrl(url);
      }
    } catch {
      // Preview video is optional, so we silently keep the live-site fallback.
    }
  };

  const handlePreviewError = async () => {
    if (!purchase?.websiteId?._id || previewFallbackTried) return;
    await fetchPreviewFallback(purchase.websiteId._id);
  };

  const openAsset = (url, label) => {
    if (!url) {
      toast.error(`${label} is not available right now`);
      return;
    }

    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#8b7355]" size={40} />
      </div>
    );
  }

  if (!purchase?.websiteId) return null;

  const website = purchase.websiteId;
  const techStack = website.techStack || {};
  const allTech = [
    ...(techStack.frontend || []),
    ...(techStack.backend || []),
    ...(techStack.database || []),
    ...(techStack.devops || []),
    ...(techStack.other || []),
  ];
  const liveDeployment = assets?.deployedPreview?.url || website.deployedUrl || null;
  const sourceZip = assets?.sourceCode?.url || null;
  const docsPdf = assets?.docs?.url || null;
  const walkthroughVideo = assets?.video?.url || null;
  const purchaseAmount = purchase.totalPaid ?? purchase.amount ?? website.price ?? 0;
  const purchaseDate = new Date(purchase.purchaseDate || purchase.createdAt);

  return (
    <div className="min-h-screen bg-[#050505] text-[#ece5d8] pt-28 pb-20 px-6 antialiased">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(139,115,85,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.08),_transparent_24%)] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate('/workspace')}
          className="flex items-center gap-2 text-white/25 text-[10px] font-bold uppercase tracking-[0.2em] mb-8 hover:text-white transition-colors"
        >
          <ArrowLeft size={12} /> Back To Workspace
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[36px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] backdrop-blur-2xl p-6 md:p-8 lg:p-10 shadow-[0_30px_80px_rgba(0,0,0,0.4)]"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-10">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] uppercase tracking-[0.24em] text-emerald-300 font-bold">
                  <CheckCircle size={12} /> Purchase Access
                </span>
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.24em] text-white/45 font-bold">
                  {website.category}
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4">
                {website.name}
              </h1>
              <p className="text-white/45 text-sm md:text-base leading-relaxed max-w-2xl">
                Your purchased build, protected files, and live deployment are all gathered here in one place.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full lg:w-auto lg:min-w-[320px]">
              <MetricCard label="Paid" value={purchaseAmount === 0 ? 'FREE' : `₹${purchaseAmount}`} accent="text-emerald-300" />
              <MetricCard label="Purchased" value={purchaseDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_360px]">
            <div className="space-y-6">
              <div className="rounded-[30px] border border-white/8 bg-[#090909] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                <div className="aspect-video rounded-[24px] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)] relative">
                  {previewVideoUrl ? (
                    <video
                      key={previewVideoUrl}
                      ref={previewRef}
                      src={previewVideoUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onError={handlePreviewError}
                      className="w-full h-full object-contain"
                    />
                  ) : liveDeployment ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <a
                        href={liveDeployment}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-[0.18em] hover:bg-[#f2ede6] transition-colors"
                      >
                        <ExternalLink size={14} /> Open Live Preview
                      </a>
                    </div>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-white/25 text-sm">
                      Preview not available for this purchase
                    </div>
                  )}

                  <div className="absolute left-4 bottom-4 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-[10px] uppercase tracking-[0.22em] text-white/65 font-bold">
                    Preview Player
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                <SectionCard title="About This Template">
                  <p className="text-sm leading-relaxed text-white/55">{website.description}</p>
                </SectionCard>

                <SectionCard title="Seller">
                  <div className="flex items-center gap-4">
                    {website.sellerId?.avatar ? (
                      <img src={website.sellerId.avatar} alt={website.sellerId?.name || 'Creator'} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#8b7355] to-[#5a4a38] flex items-center justify-center text-lg font-serif italic text-white shadow-md">
                        {(website.sellerId?.name || 'C')[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-lg font-black tracking-tight">{website.sellerId?.name || 'Creator'}</p>
                      {website.sellerId?.email && (
                        <p className="text-xs text-white/35 mt-1 break-all">{website.sellerId.email}</p>
                      )}
                    </div>
                  </div>
                </SectionCard>
              </div>

              <SectionCard title="Tech Stack">
                {allTech.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allTech.map((item) => (
                      <span
                        key={item}
                        className="px-3 py-2 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold uppercase tracking-[0.12em] text-white/55"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-white/35">No tech stack details were attached to this project.</p>
                )}
              </SectionCard>

              {walkthroughVideo && (
                <SectionCard title="Walkthrough Video">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <p className="text-sm text-white/45 leading-relaxed">
                      A full walkthrough video was uploaded during approval. You can open it in a new tab whenever you want a guided tour.
                    </p>
                    <button
                      type="button"
                      onClick={() => openAsset(walkthroughVideo, 'Walkthrough video')}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-purple-500 text-black px-5 py-3 text-xs font-black uppercase tracking-[0.2em] hover:bg-purple-400 transition-colors"
                    >
                      <Film size={14} /> Open Walkthrough
                    </button>
                  </div>
                </SectionCard>
              )}
            </div>

            <div className="space-y-6 lg:sticky lg:top-28 self-start">
              <div className="rounded-[30px] border border-white/8 bg-[#0b0b0b] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.38)]">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-4">
                  Access Files
                </p>

                <div className="space-y-3">
                  <ActionButton
                    icon={ExternalLink}
                    label="Open Live Site"
                    helper="Launch the approved deployed build"
                    onClick={() => openAsset(liveDeployment, 'Live site')}
                    loading={false}
                    variant="neutral"
                  />
                  <ActionButton
                    icon={FileCode}
                    label="Download Source ZIP"
                    helper={loadingAssets ? 'Preparing secure file...' : (assets?.sourceCode?.fileName || 'Download source bundle')}
                    onClick={() => openAsset(sourceZip, 'Source ZIP')}
                    loading={loadingAssets}
                    variant="success"
                  />
                  <ActionButton
                    icon={FileText}
                    label="Download Docs PDF"
                    helper={loadingAssets ? 'Preparing secure file...' : (assets?.docs?.fileName || 'Download documentation')}
                    onClick={() => openAsset(docsPdf, 'Docs PDF')}
                    loading={loadingAssets}
                    variant="info"
                  />
                  <ActionButton
                    icon={GitBranch}
                    label="Push to GitHub"
                    helper="Export this project into a repository in your own GitHub account"
                    onClick={() => setGithubModalOpen(true)}
                    loading={false}
                    variant="brand"
                  />
                  <ActionButton
                    icon={Rocket}
                    label={deployButtonProps.label}
                    helper={deployButtonProps.helper}
                    onClick={handleDeployClick}
                    loading={false}
                    variant={deployButtonProps.variant}
                  />
                </div>

                <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck size={18} className="text-[#8b7355] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70 mb-2">
                        Protected Access
                      </p>
                      <p className="text-xs text-white/35 leading-relaxed">
                        Download links are generated from your purchase record. If a file expires, reopening this page will refresh it.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(139,115,85,0.14),rgba(255,255,255,0.02))] p-6">
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-bold mb-3">
                  Order Snapshot
                </p>
                <div className="space-y-3 text-sm">
                  <DetailRow label="Purchase Date" value={purchaseDate.toLocaleString('en-IN')} />
                  <DetailRow label="Category" value={website.category?.toUpperCase() || 'PAID'} />
                  <DetailRow label="Files Ready" value={loadingAssets ? 'Loading...' : 'Source, docs, preview'} />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <PushToGithubModal
        open={githubModalOpen}
        onClose={() => setGithubModalOpen(false)}
        website={website}
      />
    </div>
  );
}

function MetricCard({ label, value, accent = 'text-white' }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-bold mb-2">{label}</p>
      <p className={`text-lg font-black tracking-tight ${accent}`}>{value}</p>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="rounded-[28px] border border-white/8 bg-[#0c0c0c] p-6">
      <p className="text-[10px] uppercase tracking-[0.28em] text-[#8b7355] font-bold mb-4">{title}</p>
      {children}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-white/35">{label}</span>
      <span className="text-right font-bold text-white/75">{value}</span>
    </div>
  );
}

function ActionButton({ icon: Icon, label, helper, onClick, loading, variant = 'neutral' }) {
  const variants = {
    neutral: 'bg-white/5 text-white hover:bg-white/10',
    success: 'bg-emerald-500 text-black hover:bg-emerald-400',
    info: 'bg-blue-500 text-black hover:bg-blue-400',
    brand: 'bg-[#8b7355] text-white hover:bg-[#725e46]',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`w-full rounded-2xl px-4 py-4 text-left transition-all disabled:opacity-70 disabled:cursor-not-allowed ${variants[variant] || variants.neutral}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em]">{label}</p>
          <p className={`text-[11px] mt-2 leading-relaxed ${variant === 'neutral' || variant === 'brand' ? 'text-white/45' : 'text-black/70'}`}>{helper}</p>
        </div>
      </div>
    </button>
  );
}
