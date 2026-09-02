import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Upload, ShoppingBag, Rocket, Heart, Landmark,
  Package, ExternalLink, Trash2, Loader2, Plus, AlertCircle,
  ArrowLeft, Download, CheckCircle, Eye, ArrowUpRight, TrendingUp,
  Sparkles,
} from 'lucide-react';
import { userAPI } from '../../api/user';
import { sellerAPI } from '../../api/seller';
import { buyerAPI } from '../../api/buyer';
import { wishlistAPI } from '../../api/wishlist';
import { authAPI } from '../../api/auth';
import { deploymentAPI } from '../../api/deployment';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import ProviderConnectCard from '../../components/deployment/ProviderConnectCard';
import DeploymentCard from '../../components/deployment/DeploymentCard';
import WorkspaceShell, { WorkspaceLoading } from '../../components/account/WorkspaceShell';
import { useAccentTheme } from '../../hooks/useAccentTheme';
import {
  TECH_OPTIONS, LISTING_TYPES, getListingIssue,
  WishlistPreview, getListingPreviewFallback, StatusBadge,
  CardGridSkeleton, BankDetailsSkeleton, EmptyState, GuidancePanel,
} from '../../components/account/shared';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'listings', label: 'My Listings', icon: Upload },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag },
  { id: 'deployments', label: 'Deployments', icon: Rocket },
  { id: 'wishlist', label: 'Wishlist', icon: Heart },
  { id: 'payouts', label: 'Payout Details', icon: Landmark },
];

export default function Workspace() {
  const navigate = useNavigate();
  const { cssVars } = useAccentTheme();

  const [activeSection, setActiveSection] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [listings, setListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  // --- DEPLOYMENTS STATE ---
  const [deployments, setDeployments] = useState([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(false);
  const [deploymentProviders, setDeploymentProviders] = useState(null);
  const [deploymentFilter, setDeploymentFilter] = useState('all');

  // --- BANK DETAILS STATE ---
  const [bankDetails, setBankDetails] = useState({ upiId: '', phoneNumber: '' });
  const [loadingBankDetails, setLoadingBankDetails] = useState(false);
  const [savingBankDetails, setSavingBankDetails] = useState(false);

  // --- SELLING FORM STATE ---
  const [isAddingListing, setIsAddingListing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [listingIssue, setListingIssue] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', category: 'free', price: 0, deployedUrl: '', githubUrl: '',
  });
  const [techStack, setTechStack] = useState({ frontend: [], backend: [], database: [], devops: [] });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/'); return; }
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeSection === 'listings') fetchListings();
    else if (activeSection === 'purchases') fetchPurchases();
    else if (activeSection === 'deployments') fetchDeployments();
    else if (activeSection === 'wishlist') fetchWishlist();
    else if (activeSection === 'payouts') fetchBankDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const [profileRes, dashRes] = await Promise.allSettled([
        userAPI.getProfile(),
        userAPI.getDashboard(),
      ]);

      if (profileRes.status === 'fulfilled') {
        const profileData = profileRes.value.data?.data;
        setProfile(profileData?.user ? { ...profileData.user, hasBankDetails: profileData.hasBankDetails } : profileData);
      } else {
        const err = profileRes.reason;
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.dispatchEvent(new Event('auth-changed'));
          toast.error('Your session expired. Please login again.');
          navigate('/', { replace: true });
          return;
        }
        toast.error(err.response?.data?.message || 'Failed to load profile');
      }

      if (dashRes.status === 'fulfilled') {
        setDashboard(dashRes.value.data?.data);
      } else {
        setDashboard({ uploadedWebsites: 0, purchases: 0, wishlistCount: 0, totalEarnings: 0, pendingPayouts: 0 });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchListings = async () => {
    try {
      setListingsLoading(true);
      const res = await sellerAPI.getMyWebsites();
      setListings(res.data?.data || []);
    } catch { setListings([]); }
    finally { setListingsLoading(false); }
  };

  const fetchPurchases = async () => {
    try {
      setPurchasesLoading(true);
      const res = await buyerAPI.getMyPurchases();
      setPurchases(res.data?.data || []);
    } catch { setPurchases([]); }
    finally { setPurchasesLoading(false); }
  };

  const fetchDeployments = async () => {
    try {
      setDeploymentsLoading(true);
      const [deploymentsRes, providersRes] = await Promise.all([
        deploymentAPI.list({ status: deploymentFilter === 'all' ? undefined : deploymentFilter, limit: 20 }),
        deploymentAPI.getProviders(),
      ]);
      setDeployments(deploymentsRes.data?.data || []);
      setDeploymentProviders(providersRes.data?.data || null);
    } catch { setDeployments([]); }
    finally { setDeploymentsLoading(false); }
  };

  useEffect(() => {
    if (activeSection === 'deployments') fetchDeployments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentFilter]);

  const fetchWishlist = async () => {
    try {
      setWishlistLoading(true);
      const res = await wishlistAPI.getWishlist();
      setWishlist(res.data?.data || []);
    } catch { setWishlist([]); }
    finally { setWishlistLoading(false); }
  };

  const fetchBankDetails = async () => {
    try {
      setLoadingBankDetails(true);
      const res = await userAPI.getBankDetails();
      if (res.data?.data) setBankDetails(res.data.data);
    } catch (err) {
      if (err.response?.status !== 404) toast.error('Failed to load bank details');
    } finally {
      setLoadingBankDetails(false);
    }
  };

  const handleSaveBankDetails = async (e) => {
    e.preventDefault();
    try {
      setSavingBankDetails(true);
      await userAPI.saveBankDetails(bankDetails);
      toast.success('Payout details saved successfully');
      setProfile(prev => ({ ...prev, hasBankDetails: true }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save bank details');
    } finally {
      setSavingBankDetails(false);
    }
  };

  // --- ACTIONS ---
  const handleAddListing = async (e) => {
    e.preventDefault();
    try {
      setListingIssue(null);
      setSubmitting(true);
      const normalizedPrice = form.category === 'free' ? 0 : Number(form.price);

      await sellerAPI.submitWebsite({ ...form, price: normalizedPrice, techStack });
      toast.success('Website submitted for review!');
      setIsAddingListing(false);
      setListingIssue(null);
      setForm({ name: '', description: '', category: 'free', price: 0, deployedUrl: '', githubUrl: '' });
      setTechStack({ frontend: [], backend: [], database: [], devops: [] });
      fetchListings();
    } catch (err) {
      const issue = getListingIssue(err);
      setListingIssue(issue);
      toast.error(issue.messages[0] || issue.title);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCategorySelect = (category) => {
    setListingIssue(null);
    setForm((prev) => ({
      ...prev,
      category,
      price: category === 'free' ? 0 : (prev.category === 'free' || prev.price === 0 ? '' : prev.price),
    }));
  };

  const handleSendVerification = async () => {
    try {
      setSendingVerification(true);
      await authAPI.sendVerification();
      const issue = {
        tone: 'warning',
        title: 'Verification email sent',
        messages: [
          'Check your inbox and spam folder for the verification email.',
          'After verifying your account, come back here and submit your project again.',
        ],
      };
      setListingIssue(issue);
      toast.success('Verification email sent');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send verification email');
    } finally {
      setSendingVerification(false);
    }
  };

  const handleDeleteListing = async (id) => {
    try {
      await sellerAPI.deleteWebsite(id);
      toast.success('Listing deleted');
      fetchListings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cannot delete this listing');
    }
  };

  const handleRemoveWishlist = async (websiteId) => {
    try {
      await wishlistAPI.remove(websiteId);
      toast.success('Removed from wishlist');
      fetchWishlist();
    } catch { toast.error('Failed to remove'); }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
    window.location.reload();
  };

  if (loading) return <div style={cssVars}><WorkspaceLoading /></div>;

  const stats = [
    { label: 'Approved', value: dashboard?.uploadedWebsites || 0, icon: Upload, color: '#f97316' },
    { label: 'Purchased', value: dashboard?.purchases || 0, icon: ShoppingBag, color: '#a78bfa' },
    { label: 'Wishlisted', value: dashboard?.wishlistCount || 0, icon: Heart, color: '#fb7185' },
    { label: 'Earnings', value: `₹${dashboard?.totalEarnings || 0}`, icon: TrendingUp, color: '#34d399' },
  ];

  const SECTION_META = {
    overview: { title: `Welcome back, ${profile?.name?.split(' ')[0] || 'there'}`, subtitle: "Here's what's happening across your workspace." },
    listings: { title: isAddingListing ? 'Submit New Template' : 'My Listings', subtitle: isAddingListing ? 'Fill in the details below to publish a new project.' : 'Manage the projects you have listed for sale.' },
    purchases: { title: 'Purchases', subtitle: 'Templates and projects you have bought.' },
    deployments: { title: 'Deployments', subtitle: 'Connected providers, live deployments, and your own projects.' },
    wishlist: { title: 'Wishlist', subtitle: 'Templates you have saved for later.' },
    payouts: { title: 'Payout Details', subtitle: 'Manage the account we use to pay you out.' },
  };

  const headerAction = activeSection === 'listings' && !isAddingListing
    ? (
      <button
        onClick={() => { setIsAddingListing(true); setListingIssue(null); }}
        className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] rounded-xl text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] shadow-lg transition-all"
      >
        <Plus size={14} /> List New
      </button>
    )
    : null;

  return (
    <div style={cssVars}>
      <WorkspaceShell
        profile={profile}
        navItems={NAV_ITEMS.map((n) => n.id === 'purchases' ? { ...n } : n)}
        activeSection={activeSection}
        onSelectSection={(id) => { setActiveSection(id); setIsAddingListing(false); setListingIssue(null); }}
        onLogout={handleLogout}
        pageTitle={SECTION_META[activeSection]?.title}
        pageSubtitle={SECTION_META[activeSection]?.subtitle}
        headerAction={headerAction}
      >
        <AnimatePresence mode="wait">
          {activeSection === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 md:grid-cols-4 mb-10 rounded-[28px] border border-white/8 bg-gradient-to-b from-[#111] to-[#0a0a0a] shadow-lg shadow-black/20 overflow-hidden divide-x divide-y md:divide-y-0 divide-white/[0.06]">
                {stats.map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="p-6 md:p-7 group hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <s.icon size={13} style={{ color: s.color }} />
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/45 font-semibold">{s.label}</p>
                    </div>
                    <p className="text-3xl md:text-4xl font-serif italic tracking-tight text-white">{s.value}</p>
                  </motion.div>
                ))}
              </div>

              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35 font-semibold mb-4">Quick Actions</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button onClick={() => setActiveSection('listings')} className="text-left bg-[#121110] border border-white/8 rounded-3xl p-6 hover:border-[var(--accent)]/40 transition-all group shadow-lg shadow-black/20">
                  <Upload size={18} className="text-[var(--accent)] mb-3" />
                  <p className="font-semibold text-white text-sm mb-1">Manage Listings</p>
                  <p className="text-white/45 text-xs leading-relaxed">List a new project or edit an existing one.</p>
                </button>
                <button onClick={() => setActiveSection('deployments')} className="text-left bg-[#121110] border border-white/8 rounded-3xl p-6 hover:border-[var(--accent)]/40 transition-all group shadow-lg shadow-black/20">
                  <Rocket size={18} className="text-[var(--accent)] mb-3" />
                  <p className="font-semibold text-white text-sm mb-1">Deploy a Purchase</p>
                  <p className="text-white/45 text-xs leading-relaxed">Connect GitHub, Vercel, or Render and go live.</p>
                </button>
                <button onClick={() => navigate('/deploy-own')} className="text-left bg-gradient-to-br from-[#171310] to-[#121110] border border-[var(--accent)]/25 rounded-3xl p-6 hover:border-[var(--accent)]/60 transition-all group shadow-lg shadow-black/20">
                  <Sparkles size={18} className="text-[var(--accent)] mb-3" />
                  <p className="font-semibold text-white text-sm mb-1">Deploy Your Own Project</p>
                  <p className="text-white/45 text-xs leading-relaxed">Any GitHub repo of yours — no purchase required.</p>
                </button>
                <button onClick={() => navigate('/template')} className="text-left bg-[#121110] border border-white/8 rounded-3xl p-6 hover:border-[var(--accent)]/40 transition-all group shadow-lg shadow-black/20">
                  <Package size={18} className="text-[var(--accent)] mb-3" />
                  <p className="font-semibold text-white text-sm mb-1">Browse Marketplace</p>
                  <p className="text-white/45 text-xs leading-relaxed">Discover new templates from other sellers.</p>
                </button>
              </div>
            </motion.div>
          )}

          {activeSection === 'listings' && (
            <motion.div key="listings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {isAddingListing ? (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="max-w-3xl space-y-4">
                  <button onClick={() => { setIsAddingListing(false); setListingIssue(null); }} className="flex items-center gap-2 text-white/60 text-[10px] font-bold uppercase mb-2 hover:text-white transition-colors">
                    <ArrowLeft size={12} /> Back to Listings
                  </button>

                  <form onSubmit={handleAddListing} className="space-y-4 pb-10">
                    {!profile?.isVerified && (
                      <GuidancePanel
                        tone="warning"
                        title="Your email is not verified yet"
                        messages={[
                          'Seller submissions are blocked until you verify your account email.',
                          'Use the button below to resend the verification email, then open that link and try again.',
                        ]}
                        actionLabel={sendingVerification ? 'Sending...' : 'Send Verification Email'}
                        onAction={handleSendVerification}
                        actionDisabled={sendingVerification}
                      />
                    )}

                    {listingIssue && !(listingIssue.title === 'Verify your email before listing' && !profile?.isVerified) && (
                      <GuidancePanel
                        tone={listingIssue.tone}
                        title={listingIssue.title}
                        messages={listingIssue.messages}
                        actionLabel={listingIssue.title === 'Verify your email before listing' ? (sendingVerification ? 'Sending...' : 'Resend Verification Email') : null}
                        onAction={listingIssue.title === 'Verify your email before listing' ? handleSendVerification : null}
                        actionDisabled={sendingVerification}
                      />
                    )}

                    <div className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-3xl p-6 transition-colors focus-within:border-[var(--accent)]/50">
                      <label className="text-[10px] uppercase tracking-widest text-[var(--accent)] block mb-2 font-bold">Project Name</label>
                      <input className="w-full bg-transparent text-xl font-bold outline-none placeholder:text-white/30" placeholder="e.g. Minimalist SaaS" required
                        value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>

                    <div className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-3xl p-6 transition-colors focus-within:border-[var(--accent)]/50">
                      <label className="text-[10px] uppercase tracking-widest text-[var(--accent)] block mb-2 font-bold">Description</label>
                      <textarea className="w-full bg-transparent text-sm outline-none resize-none text-white/82" placeholder="Features, stack, details..." rows={4} required
                        value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>

                    <div className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-3xl p-6 transition-colors focus-within:border-[var(--accent)]/50">
                      <label className="text-[10px] uppercase tracking-widest text-[var(--accent)] block mb-4 font-bold">Listing Type</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {LISTING_TYPES.map((type) => {
                          const isActive = form.category === type.id;
                          return (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => handleCategorySelect(type.id)}
                              className={`rounded-2xl border px-4 py-4 text-left transition-all ${isActive ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-white' : 'border-white/8 bg-white/[0.02] text-white/78 hover:border-white/20 hover:text-white'}`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-black uppercase tracking-[0.2em]">{type.label}</span>
                                {isActive && <CheckCircle size={16} className="text-[var(--accent)]" />}
                              </div>
                              <p className="text-xs leading-relaxed">{type.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {form.category !== 'free' && !profile?.hasBankDetails && (
                      <GuidancePanel
                        tone="warning"
                        title="Paid and exclusive listings need bank details"
                        messages={[
                          'The backend requires bank details before a paid or exclusive website can be accepted.',
                          'If you submit now without bank details configured, this upload will be rejected.',
                        ]}
                        actionLabel="Add Payout Details"
                        onAction={() => setActiveSection('payouts')}
                      />
                    )}

                    <div className={`grid gap-4 ${form.category === 'free' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                      {form.category !== 'free' && (
                        <div className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-3xl p-6 transition-colors focus-within:border-[var(--accent)]/50">
                          <label className="text-[10px] uppercase tracking-widest text-[var(--accent)] block mb-2 font-bold">Amount (₹)</label>
                          <input
                            type="number" min="1" required={form.category !== 'free'}
                            className="w-full bg-transparent text-lg font-bold text-white outline-none placeholder:text-white/30"
                            placeholder="Enter your selling price"
                            value={form.price}
                            onChange={(e) => setForm({ ...form, price: e.target.value })}
                          />
                        </div>
                      )}

                      <div className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-3xl p-6 transition-colors focus-within:border-[var(--accent)]/50">
                        <label className="text-[10px] uppercase tracking-widest text-[var(--accent)] block mb-2 font-bold">Live URL</label>
                        <input className="w-full bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30" placeholder="https://..." required
                          value={form.deployedUrl} onChange={(e) => setForm({ ...form, deployedUrl: e.target.value })} />
                      </div>
                    </div>

                    <div className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-3xl p-6 transition-colors focus-within:border-[var(--accent)]/50">
                      <label className="text-[10px] uppercase tracking-widest text-[var(--accent)] block mb-2 font-bold">GitHub URL</label>
                      <input className="w-full bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30" placeholder="https://github.com/..."
                        value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} />
                    </div>

                    <div className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-3xl p-6 transition-colors focus-within:border-[var(--accent)]/50">
                      <label className="text-[10px] uppercase tracking-widest text-[var(--accent)] block mb-4 font-bold">Tech Stack Selection</label>
                      {Object.entries(TECH_OPTIONS).map(([section, options]) => (
                        <div key={section} className="mb-4">
                          <p className="text-[10px] text-white/55 uppercase mb-2 font-bold tracking-wider">{section}</p>
                          <div className="flex flex-wrap gap-2">
                            {options.map(tech => (
                              <button key={tech} type="button"
                                onClick={() => {
                                  const current = techStack[section];
                                  const updated = current.includes(tech) ? current.filter(t => t !== tech) : [...current, tech];
                                  setTechStack({ ...techStack, [section]: updated });
                                }}
                                className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all ${techStack[section].includes(tech) ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-white/[0.04] border-white/10 text-white/65 hover:border-white/25 hover:text-white'}`}>
                                {tech}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button type="submit" disabled={submitting} className="w-full py-5 bg-[var(--accent)] text-white rounded-3xl font-bold text-xs uppercase tracking-widest hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
                      {submitting ? <Loader2 className="animate-spin" size={16} /> : <><Upload size={16} /> Submit Project</>}
                    </button>
                  </form>
                </motion.div>
              ) : (
                <AnimatePresence mode="wait">
                  {listingsLoading ? (
                    <motion.div key="listings-skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                      <CardGridSkeleton count={Math.min(listings.length || 6, 6)} />
                    </motion.div>
                  ) : listings.length === 0 ? (
                    <motion.div key="listings-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                      <EmptyState icon={Upload} title="No listings yet" description="Start selling your templates" action="Get Started" onAction={() => setIsAddingListing(true)} />
                    </motion.div>
                  ) : (
                    <motion.div key="listings-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {listings.map((item) => (
                          <div key={item._id} className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-[32px] p-4 hover:border-[var(--accent)]/40 transition-all duration-500 group flex flex-col justify-between h-full">
                            <div>
                              <div className="relative">
                                <WishlistPreview previewVideo={item.files?.previewVideo?.url || null} fallback={getListingPreviewFallback(item.status)} />
                                <div className="absolute top-3 left-3 z-10">
                                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${item.category === 'exclusive' ? 'bg-orange-500/80 text-white' : item.category === 'paid' ? 'bg-[var(--accent)]/80 text-white' : 'bg-emerald-500/80 text-white'}`}>
                                    {item.category}
                                  </span>
                                </div>
                                <div className="absolute top-3 right-3 z-10">
                                  <StatusBadge status={item.status} />
                                </div>
                              </div>

                              <div className="px-2">
                                <h3 className="font-black text-lg tracking-tight text-white line-clamp-1">{item.name}</h3>
                                <p className="text-white/60 text-xs mt-1.5 leading-relaxed line-clamp-2">{item.description}</p>
                              </div>

                              {item.adminComment && (
                                <div className={`mx-2 mt-3 rounded-2xl border px-4 py-3 ${item.status === 'rejected' ? 'border-red-500/15 bg-red-500/[0.05]' : 'border-sky-500/15 bg-sky-500/[0.05]'}`}>
                                  <p className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold mb-1.5 ${item.status === 'rejected' ? 'text-red-300/70' : 'text-sky-300/70'}`}>
                                    <AlertCircle size={10} /> Admin Note
                                  </p>
                                  <p className="text-xs text-white/74 leading-relaxed">{item.adminComment}</p>
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="flex items-center gap-4 px-2 mt-4 mb-3 text-white/56">
                                <span className="flex items-center gap-1.5 text-[10px] font-bold" title="Views"><Eye size={11} /> {item.viewCount || 0}</span>
                                <span className="flex items-center gap-1.5 text-[10px] font-bold" title="Wishlisted"><Heart size={11} /> {item.wishlistCount || 0}</span>
                                <span className="flex items-center gap-1.5 text-[10px] font-bold" title="Sold"><TrendingUp size={11} /> {item.salesCount || 0}</span>
                              </div>

                              <div className="flex items-center justify-between px-2 pb-2 pt-3 border-t border-white/8">
                                <span className="text-[var(--accent)] font-bold text-sm tracking-widest uppercase">{item.price === 0 ? 'FREE' : `₹${item.price}`}</span>
                                <div className="flex gap-2">
                                  {item.status === 'approved' && (
                                    <button onClick={() => navigate(`/website/${item._id}`)} title="View live listing" className="p-2 bg-white/[0.05] border border-white/8 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all">
                                      <ArrowUpRight size={14} />
                                    </button>
                                  )}
                                  {item.deployedUrl && (
                                    <a href={item.deployedUrl} target="_blank" rel="noreferrer" title="Open deployed site" className="p-2 bg-white/[0.05] border border-white/8 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all">
                                      <ExternalLink size={14} />
                                    </a>
                                  )}
                                  <button onClick={() => handleDeleteListing(item._id)} title="Delete listing" className="p-2 bg-white/[0.05] border border-white/8 rounded-xl hover:bg-red-500/15 hover:border-red-400/30 hover:text-red-400 transition-all">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </motion.div>
          )}

          {activeSection === 'purchases' && (
            <motion.div key="purchases" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <AnimatePresence mode="wait">
                {purchasesLoading ? (
                  <motion.div key="purchases-skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <CardGridSkeleton count={Math.min(purchases.length || 6, 6)} />
                  </motion.div>
                ) : purchases.length === 0 ? (
                  <motion.div key="purchases-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <EmptyState icon={ShoppingBag} title="No purchases yet" description="Browse templates to find your next project" action="Browse" onAction={() => navigate('/template')} />
                  </motion.div>
                ) : (
                  <motion.div key="purchases-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {purchases.map((p) => {
                        const web = p.websiteId || {};
                        const cat = web.category || 'paid';
                        const previewVideo = web.files?.previewVideo?.url || null;
                        return (
                          <div
                            key={p._id}
                            onClick={() => navigate(`/purchases/${p._id}`)}
                            className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-[32px] p-4 hover:border-[var(--accent)]/40 transition-all duration-500 group cursor-pointer flex flex-col justify-between h-full"
                          >
                            <div>
                              <WishlistPreview previewVideo={previewVideo} />
                              <div className="flex items-start justify-between px-2 mb-1">
                                <div className="flex-1 pr-4">
                                  <h3 className="font-black text-lg tracking-tight text-white line-clamp-1">{web.name || 'Template'}</h3>
                                  <p className="text-white/50 text-[10px] mt-1">
                                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recently'}
                                  </p>
                                </div>
                                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full text-emerald-400 bg-emerald-500/10 shrink-0">
                                  <CheckCircle size={8} /> Owned
                                </span>
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center justify-between px-2 mb-3">
                                <span className="text-[var(--accent)] font-bold text-sm tracking-widest uppercase">
                                  {p.amount ? `₹${p.amount}` : cat === 'free' ? 'FREE' : `₹${web.price || 0}`}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${cat === 'free' ? 'bg-emerald-500/80 text-white' : cat === 'exclusive' ? 'bg-orange-500/80 text-white' : 'bg-[var(--accent)]/80 text-white'}`}>
                                  {cat}
                                </span>
                              </div>

                              <div className="flex gap-2 px-2 pb-2">
                                {web.deployedUrl && (
                                  <a onClick={(e) => e.stopPropagation()} href={web.deployedUrl} target="_blank" rel="noreferrer"
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white/[0.05] border border-white/8 rounded-xl text-[10px] font-bold text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
                                    <ExternalLink size={11} /> Preview
                                  </a>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/purchases/${p._id}`); }}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 text-black rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-400 shadow-lg shadow-emerald-500/15 transition-all"
                                >
                                  <Download size={11} /> Open Access
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeSection === 'deployments' && (
            <motion.div key="deployments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="rounded-[28px] border border-white/8 bg-[#121110] shadow-lg shadow-black/20 p-6 mb-6">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent)] font-bold mb-4">Connected Accounts</p>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 flex items-center justify-between gap-4">
                    <div>
                      <span className="text-sm font-bold text-white">GitHub</span>
                      {deploymentProviders?.github?.connected ? (
                        <span className="ml-3 inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
                          <CheckCircle size={12} /> @{deploymentProviders.github.username}
                        </span>
                      ) : (
                        <span className="ml-3 text-[11px] text-white/60">Not connected</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/deployments')}
                      className="shrink-0 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/15 text-white/80 text-[10px] font-black uppercase tracking-wider hover:text-white hover:bg-white/10 hover:border-white/25 transition-colors"
                    >
                      {deploymentProviders?.github?.connected ? 'Reconnect' : 'Connect'}
                    </button>
                  </div>
                  <ProviderConnectCard provider="vercel" status={deploymentProviders?.vercel} onChange={fetchDeployments} />
                  <ProviderConnectCard provider="render" status={deploymentProviders?.render} onChange={fetchDeployments} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/deploy-own')}
                className="w-full flex items-center gap-4 rounded-[28px] border border-[var(--accent)]/25 bg-gradient-to-br from-[#171310] via-[#121110] to-[#0e0d0c] p-5 mb-6 text-left hover:border-[var(--accent)]/55 transition-all shadow-lg shadow-black/20 group"
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--accent-soft)' }}>
                  <Sparkles size={18} className="text-[var(--accent)]" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-white text-sm">Deploy Your Own Project</p>
                  <p className="text-white/50 text-xs mt-0.5">Any repository in your GitHub account — no DevDrop listing or purchase required.</p>
                </div>
                <ArrowUpRight size={18} className="text-white/40 group-hover:text-[var(--accent)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </button>

              <div className="flex items-center justify-between mb-5">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/45 font-semibold">
                  {deployments.length} Deployment{deployments.length === 1 ? '' : 's'}
                </p>
                <div className="flex gap-1.5">
                  {['all', 'successful', 'failed', 'deploying'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDeploymentFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${deploymentFilter === f ? 'bg-white text-black' : 'bg-white/5 text-white/68 hover:text-white/88'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {deploymentsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="animate-spin text-white/60" size={22} />
                </div>
              ) : deployments.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.01] p-12 text-center">
                  <Rocket className="mx-auto mb-4 text-white/50" size={28} />
                  <p className="text-white/68 text-sm mb-1">No deployments yet</p>
                  <p className="text-white/56 text-xs">Publish a purchased project to GitHub, then hit Deploy from its access page.</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {deployments.map((d) => (
                    <DeploymentCard key={d.id} deployment={d} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeSection === 'wishlist' && (
            <motion.div key="wishlist" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <AnimatePresence mode="wait">
                {wishlistLoading ? (
                  <motion.div key="wishlist-skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <CardGridSkeleton count={Math.min(wishlist.length || 6, 6)} />
                  </motion.div>
                ) : wishlist.length === 0 ? (
                  <motion.div key="wishlist-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <EmptyState icon={Heart} title="Wishlist empty" description="Save templates you love for later" action="Browse" onAction={() => navigate('/template')} />
                  </motion.div>
                ) : (
                  <motion.div key="wishlist-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {wishlist.map((w) => {
                        const web = w.websiteId || {};
                        const cat = web.category || 'free';
                        const previewVideo = web.files?.previewVideo?.url || null;
                        return (
                          <div
                            key={w._id}
                            onClick={() => navigate(`/website/${web._id}`)}
                            className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-[32px] p-4 hover:border-[var(--accent)]/40 transition-all duration-500 group cursor-pointer flex flex-col justify-between h-full"
                          >
                            <div>
                              <WishlistPreview previewVideo={previewVideo} />
                              <div className="flex items-start justify-between px-2 mb-1">
                                <div className="flex-1 pr-4">
                                  <h3 className="font-black text-lg tracking-tight text-white line-clamp-1">{web.name || 'Template'}</h3>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRemoveWishlist(web._id); }}
                                  className="p-2 -mr-2 -mt-2 rounded-xl hover:bg-red-500/10 text-red-400 transition-all shrink-0"
                                >
                                  <Heart size={16} className="fill-current" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-2 px-2 pb-2">
                              <span className="text-[var(--accent)] font-bold text-sm tracking-widest uppercase">
                                {cat === 'free' ? 'FREE' : `₹${web.price || 0}`}
                              </span>
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${cat === 'free' ? 'bg-emerald-500/80 text-white' : cat === 'exclusive' ? 'bg-orange-500/80 text-white' : 'bg-[var(--accent)]/80 text-white'}`}>
                                {cat}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeSection === 'payouts' && (
            <motion.div key="payouts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="max-w-2xl">
                <AnimatePresence mode="wait">
                  {loadingBankDetails ? (
                    <motion.div key="bank-skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                      <BankDetailsSkeleton />
                    </motion.div>
                  ) : (
                    <motion.div key="bank-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                      <form onSubmit={handleSaveBankDetails} className="space-y-6">
                        <div className="bg-[#121110] border border-white/8 shadow-lg shadow-black/20 rounded-3xl p-6 md:p-8 space-y-6 transition-colors focus-within:border-[var(--accent)]/50 hover:border-white/15">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="text-[10px] uppercase tracking-widest text-[var(--accent)] block font-bold">UPI ID</label>
                              <input
                                required
                                className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[var(--accent)]/60 focus:bg-black/40 transition-colors"
                                placeholder="username@upi"
                                value={bankDetails.upiId || ''}
                                onChange={(e) => setBankDetails({ ...bankDetails, upiId: e.target.value })}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] uppercase tracking-widest text-[var(--accent)] block font-bold">Phone Number</label>
                              <input
                                required type="tel"
                                className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[var(--accent)]/60 focus:bg-black/40 transition-colors"
                                placeholder="+91 9876543210"
                                value={bankDetails.phoneNumber || ''}
                                onChange={(e) => setBankDetails({ ...bankDetails, phoneNumber: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={savingBankDetails}
                          className="w-full py-4 bg-[var(--accent)] text-white rounded-3xl font-bold text-xs uppercase tracking-widest hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {savingBankDetails ? <Loader2 className="animate-spin" size={16} /> : <><CheckCircle size={16} /> Save Payout Details</>}
                        </button>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </WorkspaceShell>
    </div>
  );
}
