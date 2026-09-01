import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Package, Heart, DollarSign, Upload, ShoppingBag, 
  ExternalLink, Trash2, Loader2, LogOut, Plus, AlertCircle,
  ArrowLeft, Download, CheckCircle, Landmark, Camera, X, Eye,
  ArrowUpRight, TrendingUp, XCircle, Clock, AlertTriangle, Rocket
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

const TABS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'listings', label: 'My Listings', icon: Upload },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag },
  { id: 'deployments', label: 'Deployments', icon: Rocket },
  { id: 'wishlist', label: 'Wishlist', icon: Heart },
  { id: 'bankDetails', label: 'Payout Details', icon: Landmark },
];

const TECH_OPTIONS = {
  frontend: ['React', 'Vue', 'Next.js', 'Nuxt.js', 'Svelte', 'Angular', 'Gatsby', 'Tailwind', 'Bootstrap', 'Material UI', 'Chakra UI', 'Framer Motion', 'Three.js', 'GSAP', 'WebGL', 'HTML', 'CSS', 'JavaScript', 'TypeScript', 'Redux', 'Zustand', 'React Query'],
  backend: ['Node.js', 'Express', 'NestJS', 'Django', 'Flask', 'FastAPI', 'Laravel', 'PHP', 'Ruby on Rails', 'Spring Boot', 'Java', 'Go', 'Rust', 'C#', '.NET', 'GraphQL', 'Apollo', 'REST API', 'tRPC'],
  database: ['MongoDB', 'PostgreSQL', 'MySQL', 'SQLite', 'Firebase', 'Supabase', 'Redis', 'Cassandra', 'DynamoDB', 'Oracle', 'SQL Server', 'Elasticsearch', 'Neo4j'],
  devops: ['Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Vercel', 'Render', 'Netlify', 'Heroku', 'DigitalOcean', 'GitHub Actions', 'GitLab CI', 'Jenkins', 'Terraform', 'Nginx', 'Apache', 'Cloudflare', 'Linux'],
};

const LISTING_TYPES = [
  {
    id: 'free',
    label: 'Free',
    description: 'Good for open demos, lead generation, or portfolio exposure.',
  },
  {
    id: 'paid',
    label: 'Paid',
    description: 'Sell the template multiple times at a fixed price.',
  },
  {
    id: 'exclusive',
    label: 'Exclusive',
    description: 'Offer the project as a one-time premium sale.',
  },
];

const LISTING_FIELD_LABELS = {
  name: 'Project name',
  description: 'Description',
  category: 'Category',
  price: 'Price',
  deployedUrl: 'Live URL',
  githubUrl: 'GitHub URL',
};

function getListingIssue(error) {
  const data = error.response?.data;

  if (data?.requiresVerification) {
    return {
      tone: 'warning',
      title: 'Verify your email before listing',
      messages: [
        'Check your inbox for the verification email that was just sent.',
        'Open the link in that email, then come back and submit your project again.',
      ],
    };
  }

  if (data?.requiresBankDetails) {
    return {
      tone: 'warning',
      title: 'Bank details are required first',
      messages: [
        'Paid and exclusive listings need bank details on your account before submission.',
        'Add your bank details first, then try submitting the listing again.',
      ],
    };
  }

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return {
      tone: 'error',
      title: 'Please fix these fields',
      messages: data.errors.map(({ field, message }) => `${LISTING_FIELD_LABELS[field] || field}: ${message}`),
    };
  }

  if (data?.message === 'Free websites must have price 0') {
    return {
      tone: 'error',
      title: 'Price needs to stay at 0',
      messages: [
        'This form is currently submitting the project as a free listing.',
        'Set the price to 0 and submit again.',
      ],
    };
  }

  if (data?.message === 'Paid/exclusive websites must have price > 0') {
    return {
      tone: 'error',
      title: 'Paid listings need a price',
      messages: [
        'Paid or exclusive listings must have a price greater than 0.',
        'Enter a valid price, then submit again.',
      ],
    };
  }

  const serverError = data?.error || data?.message;

  return {
    tone: 'error',
    title: 'Submission failed',
    messages: [
      serverError && serverError !== 'Validation failed'
        ? serverError
        : 'Something went wrong on our end. Please check your fields and try again.',
    ],
  };
}

export default function Profile() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [listings, setListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  // Per-tab loading flags — drive the skeleton state shown while that tab's data is in flight
  const [listingsLoading, setListingsLoading] = useState(false);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);

  // --- DEPLOYMENTS STATE ---
  const [deployments, setDeployments] = useState([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(false);
  const [deploymentProviders, setDeploymentProviders] = useState(null);
  const [deploymentFilter, setDeploymentFilter] = useState('all');


  // --- BANK DETAILS STATE ---
  const [bankDetails, setBankDetails] = useState({
    upiId: '',
    phoneNumber: ''
  });
  const [loadingBankDetails, setLoadingBankDetails] = useState(false);
  const [savingBankDetails, setSavingBankDetails] = useState(false);

  // --- SELLING FORM STATE ---
  const [isAddingListing, setIsAddingListing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [listingIssue, setListingIssue] = useState(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'free',
    price: 0,
    deployedUrl: '',
    githubUrl: '',
  });
  const [techStack, setTechStack] = useState({
    frontend: [], backend: [], database: [], devops: [],
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/'); return; }
    fetchProfile();
  }, []);

  useEffect(() => {
    if (activeTab === 'listings') fetchListings();
    else if (activeTab === 'purchases') fetchPurchases();
    else if (activeTab === 'deployments') fetchDeployments();
    else if (activeTab === 'wishlist') fetchWishlist();
    else if (activeTab === 'bankDetails') fetchBankDetails();
  }, [activeTab]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      // Run both requests in parallel — cuts initial load time in half
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
    if (activeTab === 'deployments') fetchDeployments();
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
      if (res.data?.data) {
        setBankDetails(res.data.data);
      }
    } catch (err) {
      if (err.response?.status !== 404) {
        toast.error('Failed to load bank details');
      }
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

      await sellerAPI.submitWebsite({
        ...form,
        price: normalizedPrice,
        techStack,
      });
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
      price: category === 'free'
        ? 0
        : prev.category === 'free' || prev.price === 0
          ? ''
          : prev.price,
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

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Please upload a JPG, PNG, or WebP image');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    try {
      setAvatarUploading(true);
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await userAPI.updateAvatar(formData);
      const newAvatarUrl = res.data?.data?.avatar;
      if (newAvatarUrl) {
        setProfile(prev => ({ ...prev, avatar: newAvatarUrl }));
      }
      toast.success('Profile picture updated!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload profile picture');
    } finally {
      setAvatarUploading(false);
      // Reset input so the same file can be re-selected
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleAvatarRemove = async () => {
    try {
      setAvatarUploading(true);
      await userAPI.removeAvatar();
      setProfile(prev => ({ ...prev, avatar: null }));
      toast.success('Profile picture removed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove profile picture');
    } finally {
      setAvatarUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#8b7355]" size={40} />
      </div>
    );
  }

  const stats = [
    { label: 'Approved', value: dashboard?.uploadedWebsites || 0, icon: Upload, color: '#f97316' },
    { label: 'Purchased', value: dashboard?.purchases || 0, icon: ShoppingBag, color: '#a78bfa' },
    { label: 'Wishlisted', value: dashboard?.wishlistCount || 0, icon: Heart, color: '#fb7185' },
    { label: 'Earnings', value: `₹${dashboard?.totalEarnings || 0}`, icon: DollarSign, color: '#34d399' },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-[#e8e2d6] pt-28 pb-20 px-6 antialiased">
      <div className="max-w-6xl mx-auto">

        {/* ── HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-6">
          <div className="flex items-center gap-6">
            {/* ── INTERACTIVE AVATAR ── */}
            <div className="relative group">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />

              <div className="w-20 h-20 rounded-full overflow-hidden shadow-lg shadow-[#8b7355]/20 ring-2 ring-white/10 ring-offset-2 ring-offset-[#050505]">
                {avatarUploading ? (
                  <div className="w-full h-full bg-gradient-to-br from-[#8b7355] to-[#5a4a38] flex items-center justify-center">
                    <Loader2 className="animate-spin text-white" size={24} />
                  </div>
                ) : profile?.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile?.name || 'User'}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                  />
                ) : null}
                {/* Initials fallback — shown when no avatar or image fails to load */}
                <div
                  className="w-full h-full bg-gradient-to-br from-[#8b7355] to-[#5a4a38] flex items-center justify-center text-3xl font-serif italic text-white"
                  style={{ display: (!avatarUploading && !profile?.avatar) ? 'flex' : 'none' }}
                >
                  {profile?.name?.[0]?.toUpperCase() || 'U'}
                </div>
              </div>

              {/* Hover overlay — upload trigger */}
              {!avatarUploading && (
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Camera size={20} className="text-white" />
                </div>
              )}

              {/* Remove button — only if avatar exists */}
              {profile?.avatar && !avatarUploading && (
                <button
                  onClick={handleAvatarRemove}
                  className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400 shadow-lg z-10"
                  title="Remove profile picture"
                >
                  <X size={12} className="text-white" />
                </button>
              )}
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight">{profile?.name || 'User'}</h1>
              <p className="text-white/30 text-sm mt-1">{profile?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold uppercase tracking-[0.15em] text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <LogOut size={14} /> Logout
          </button>
        </motion.div>

        {/* ── TAB NAV ── */}
        <div className="flex gap-1 bg-white/[0.03] border border-white/10 p-1.5 rounded-[28px] mb-10 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setIsAddingListing(false); setListingIssue(null); }}
              className={`relative flex items-center gap-2 px-6 py-3 text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap z-10 ${
                activeTab === tab.id ? 'text-black' : 'text-gray-500 hover:text-white'
              }`}
            >
              {activeTab === tab.id && (
                <motion.div layoutId="profileTab" className="absolute inset-0 bg-white rounded-[22px] -z-10" transition={{ type: "spring", bounce: 0.15, duration: 0.6 }} />
              )}
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                {stats.map((s, i) => (
                  <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="bg-[#111] border border-white/5 rounded-3xl p-6 group hover:border-white/15 transition-all">
                    <s.icon size={20} style={{ color: s.color }} className="mb-4 opacity-60 group-hover:opacity-100 transition-opacity" />
                    <p className="text-3xl font-black tracking-tight">{s.value}</p>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 mt-2 font-bold">{s.label}</p>
                  </motion.div>
                ))}
              </div>
              <div className="flex gap-4">
                  <button onClick={() => setActiveTab('listings')} className="flex-1 bg-[#8b7355] hover:bg-[#725e46] text-white py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2">
                  <Upload size={14} /> View My Work
                </button>
                <button onClick={() => navigate('/template')} className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-white py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2">
                  <Package size={14} /> Market
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'listings' && (
            <motion.div key="listings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold tracking-tight">
                  {isAddingListing ? "Submit New Template" : "My Project Hub"}
                </h2>
                {!isAddingListing && (
                  <button onClick={() => { setIsAddingListing(true); setListingIssue(null); }} className="flex items-center gap-2 px-5 py-2.5 bg-[#8b7355] rounded-xl text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[#725e46] transition-all">
                    <Plus size={14} /> List New
                  </button>
                )}
              </div>

              {isAddingListing ? (
                /* ── INTEGRATED SELL FORM ── */
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="max-w-3xl mx-auto space-y-4">
                   <button onClick={() => { setIsAddingListing(false); setListingIssue(null); }} className="flex items-center gap-2 text-white/30 text-[10px] font-bold uppercase mb-4 hover:text-white transition-colors">
                    <ArrowLeft size={12} /> Back to Hub
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
                          actionLabel={
                            listingIssue.title === 'Verify your email before listing'
                              ? (sendingVerification ? 'Sending...' : 'Resend Verification Email')
                              : null
                          }
                          onAction={
                            listingIssue.title === 'Verify your email before listing'
                              ? handleSendVerification
                              : null
                          }
                          actionDisabled={sendingVerification}
                        />
                      )}

                      <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                        <label className="text-[9px] uppercase tracking-widest text-[#8b7355] block mb-2 font-bold">Project Name</label>
                        <input className="w-full bg-transparent text-xl font-bold outline-none placeholder:text-white/10" placeholder="e.g. Minimalist SaaS" required 
                          value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
                      </div>

                      <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                        <label className="text-[9px] uppercase tracking-widest text-[#8b7355] block mb-2 font-bold">Description</label>
                        <textarea className="w-full bg-transparent text-sm outline-none resize-none text-white/60" placeholder="Features, stack, details..." rows={4} required 
                          value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
                      </div>

                      <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                        <label className="text-[9px] uppercase tracking-widest text-[#8b7355] block mb-4 font-bold">Listing Type</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {LISTING_TYPES.map((type) => {
                            const isActive = form.category === type.id;
                            return (
                              <button
                                key={type.id}
                                type="button"
                                onClick={() => handleCategorySelect(type.id)}
                                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                                  isActive
                                    ? 'border-[#8b7355] bg-[#8b7355]/15 text-white'
                                    : 'border-white/8 bg-white/[0.02] text-white/55 hover:border-white/20 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-black uppercase tracking-[0.2em]">{type.label}</span>
                                  {isActive && <CheckCircle size={16} className="text-[#c8b08d]" />}
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
                        />
                      )}

                      <div className={`grid gap-4 ${form.category === 'free' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                        {form.category !== 'free' && (
                          <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                            <label className="text-[9px] uppercase tracking-widest text-[#8b7355] block mb-2 font-bold">Amount (₹)</label>
                            <input
                              type="number"
                              min="1"
                              required={form.category !== 'free'}
                              className="w-full bg-transparent text-lg font-bold outline-none"
                              placeholder="Enter your selling price"
                              value={form.price}
                              onChange={(e) => setForm({...form, price: e.target.value})}
                            />
                          </div>
                        )}

                        <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                          <label className="text-[9px] uppercase tracking-widest text-[#8b7355] block mb-2 font-bold">Live URL</label>
                          <input className="w-full bg-transparent text-sm outline-none" placeholder="https://..." required
                            value={form.deployedUrl} onChange={(e) => setForm({...form, deployedUrl: e.target.value})} />
                        </div>
                      </div>

                      <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                        <label className="text-[9px] uppercase tracking-widest text-[#8b7355] block mb-2 font-bold">GitHub URL</label>
                        <input className="w-full bg-transparent text-sm outline-none" placeholder="https://github.com/..."
                          value={form.githubUrl} onChange={(e) => setForm({...form, githubUrl: e.target.value})} />
                      </div>

                      <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                         <label className="text-[9px] uppercase tracking-widest text-[#8b7355] block mb-4 font-bold">Tech Stack Selection</label>
                         {Object.entries(TECH_OPTIONS).map(([section, options]) => (
                            <div key={section} className="mb-4">
                               <p className="text-[10px] text-white/20 uppercase mb-2 font-bold">{section}</p>
                               <div className="flex flex-wrap gap-2">
                                  {options.map(tech => (
                                    <button key={tech} type="button" 
                                      onClick={() => {
                                        const current = techStack[section];
                                        const updated = current.includes(tech) ? current.filter(t => t !== tech) : [...current, tech];
                                        setTechStack({...techStack, [section]: updated});
                                      }}
                                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${techStack[section].includes(tech) ? 'bg-[#8b7355] text-white' : 'bg-white/5 text-white/30'}`}>
                                      {tech}
                                    </button>
                                  ))}
                               </div>
                            </div>
                         ))}
                      </div>

                      <button type="submit" disabled={submitting} className="w-full py-5 bg-[#8b7355] text-white rounded-3xl font-bold text-xs uppercase tracking-widest hover:bg-[#725e46] transition-all flex items-center justify-center gap-2">
                        {submitting ? <Loader2 className="animate-spin" size={16} /> : <><Upload size={16} /> Submit Project</>}
                      </button>
                   </form>
                </motion.div>
              ) : (
                /* ── LISTINGS GRID ── */
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
                      <div key={item._id} className="bg-[#111] border border-white/5 rounded-[32px] p-4 hover:border-orange-100/20 transition-all duration-500 group flex flex-col justify-between h-full">
                        <div>
                          <div className="relative">
                            <WishlistPreview
                              previewVideo={item.files?.previewVideo?.url || null}
                              fallback={getListingPreviewFallback(item.status)}
                            />
                            <div className="absolute top-3 left-3 z-10">
                              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                item.category === 'exclusive' ? 'bg-orange-500/80 text-white' :
                                item.category === 'paid' ? 'bg-[#8b7355]/80 text-white' :
                                'bg-emerald-500/80 text-white'
                              }`}>
                                {item.category}
                              </span>
                            </div>
                            <div className="absolute top-3 right-3 z-10">
                              <StatusBadge status={item.status} />
                            </div>
                          </div>

                          <div className="px-2">
                            <h3 className="font-black text-lg tracking-tight line-clamp-1">{item.name}</h3>
                            <p className="text-white/30 text-xs mt-1.5 leading-relaxed line-clamp-2">{item.description}</p>
                          </div>

                          {item.adminComment && (
                            <div className={`mx-2 mt-3 rounded-2xl border px-4 py-3 ${
                              item.status === 'rejected' ? 'border-red-500/15 bg-red-500/[0.05]' : 'border-sky-500/15 bg-sky-500/[0.05]'
                            }`}>
                              <p className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-bold mb-1.5 ${
                                item.status === 'rejected' ? 'text-red-300/70' : 'text-sky-300/70'
                              }`}>
                                <AlertCircle size={10} /> Admin Note
                              </p>
                              <p className="text-xs text-white/50 leading-relaxed">{item.adminComment}</p>
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-4 px-2 mt-4 mb-3 text-white/25">
                            <span className="flex items-center gap-1.5 text-[10px] font-bold" title="Views">
                              <Eye size={11} /> {item.viewCount || 0}
                            </span>
                            <span className="flex items-center gap-1.5 text-[10px] font-bold" title="Wishlisted">
                              <Heart size={11} /> {item.wishlistCount || 0}
                            </span>
                            <span className="flex items-center gap-1.5 text-[10px] font-bold" title="Sold">
                              <TrendingUp size={11} /> {item.salesCount || 0}
                            </span>
                          </div>

                          <div className="flex items-center justify-between px-2 pb-2 pt-3 border-t border-white/5">
                            <span className="text-[#8b7355] font-bold text-sm tracking-widest uppercase">{item.price === 0 ? 'FREE' : `₹${item.price}`}</span>
                            <div className="flex gap-2">
                              {item.status === 'approved' && (
                                <button
                                  onClick={() => navigate(`/website/${item._id}`)}
                                  title="View live listing"
                                  className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-all"
                                >
                                  <ArrowUpRight size={14} />
                                </button>
                              )}
                              {item.deployedUrl && (
                                <a href={item.deployedUrl} target="_blank" rel="noreferrer" title="Open deployed site" className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                                  <ExternalLink size={14} />
                                </a>
                              )}
                              <button onClick={() => handleDeleteListing(item._id)} title="Delete listing" className="p-2 bg-white/5 rounded-xl hover:bg-red-500/20 hover:text-red-400 transition-all">
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

          {activeTab === 'purchases' && (
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
                        className="bg-[#111] border border-white/5 rounded-[32px] p-4 hover:border-orange-100/20 transition-all duration-500 group cursor-pointer flex flex-col justify-between h-full"
                      >
                        <div>
                          <WishlistPreview previewVideo={previewVideo} />

                          <div className="flex items-start justify-between px-2 mb-1">
                            <div className="flex-1 pr-4">
                              <h3 className="font-black text-lg tracking-tight line-clamp-1">{web.name || 'Template'}</h3>
                              <p className="text-white/20 text-[10px] mt-1">
                                {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recently'}
                              </p>
                            </div>
                            <span className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full text-emerald-400 bg-emerald-500/10 shrink-0">
                              <CheckCircle size={8} /> Owned
                            </span>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between px-2 mb-3">
                            <span className="text-[#8b7355] font-bold text-sm tracking-widest uppercase">
                              {p.amount ? `₹${p.amount}` : cat === 'free' ? 'FREE' : `₹${web.price || 0}`}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              cat === 'free' ? 'bg-emerald-500/80 text-white' :
                              cat === 'exclusive' ? 'bg-orange-500/80 text-white' :
                              'bg-[#8b7355]/80 text-white'
                            }`}>
                              {cat}
                            </span>
                          </div>

                          <div className="flex gap-2 px-2 pb-2">
                            {web.deployedUrl && (
                              <a onClick={(e) => e.stopPropagation()} href={web.deployedUrl} target="_blank" rel="noreferrer"
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white/5 rounded-xl text-[10px] font-bold text-white/40 hover:text-white hover:bg-white/10 transition-all">
                                <ExternalLink size={11} /> Preview
                              </a>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/purchases/${p._id}`);
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 text-black rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all"
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

          {activeTab === 'deployments' && (
            <motion.div key="deployments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="rounded-[28px] border border-white/8 bg-[#0c0c0c] p-6 mb-6">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-4">Connected Accounts</p>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 flex items-center justify-between">
                    <span className="text-sm font-bold">GitHub</span>
                    {deploymentProviders?.github?.connected ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
                        <CheckCircle size={12} /> @{deploymentProviders.github.username}
                      </span>
                    ) : (
                      <span className="text-[11px] text-white/30">Not connected — use Push to GitHub on any purchase</span>
                    )}
                  </div>
                  <ProviderConnectCard provider="vercel" status={deploymentProviders?.vercel} onChange={fetchDeployments} />
                  <ProviderConnectCard provider="render" status={deploymentProviders?.render} onChange={fetchDeployments} />
                </div>
              </div>

              <div className="flex items-center justify-between mb-5">
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-bold">
                  {deployments.length} Deployment{deployments.length === 1 ? '' : 's'}
                </p>
                <div className="flex gap-1.5">
                  {['all', 'successful', 'failed', 'deploying'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDeploymentFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${
                        deploymentFilter === f ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white/70'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {deploymentsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="animate-spin text-white/30" size={22} />
                </div>
              ) : deployments.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.01] p-12 text-center">
                  <Rocket className="mx-auto mb-4 text-white/20" size={28} />
                  <p className="text-white/40 text-sm mb-1">No deployments yet</p>
                  <p className="text-white/25 text-xs">Publish a purchased project to GitHub, then hit Deploy from its access page.</p>
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

          {activeTab === 'wishlist' && (
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
                        className="bg-[#111] border border-white/5 rounded-[32px] p-4 hover:border-orange-100/20 transition-all duration-500 group cursor-pointer flex flex-col justify-between h-full"
                      >
                        <div>
                          <WishlistPreview previewVideo={previewVideo} />

                          <div className="flex items-start justify-between px-2 mb-1">
                            <div className="flex-1 pr-4">
                              <h3 className="font-black text-lg tracking-tight line-clamp-1">{web.name || 'Template'}</h3>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveWishlist(web._id);
                              }}
                              className="p-2 -mr-2 -mt-2 rounded-xl hover:bg-red-500/10 text-red-400 transition-all shrink-0"
                            >
                              <Heart size={16} className="fill-current" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2 px-2 pb-2">
                          <span className="text-[#8b7355] font-bold text-sm tracking-widest uppercase">
                            {cat === 'free' ? 'FREE' : `₹${web.price || 0}`}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            cat === 'free' ? 'bg-emerald-500/80 text-white' :
                            cat === 'exclusive' ? 'bg-orange-500/80 text-white' :
                            'bg-[#8b7355]/80 text-white'
                          }`}>
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

          {activeTab === 'bankDetails' && (
            <motion.div key="bankDetails" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="max-w-2xl mx-auto">
                <div className="mb-8">
                  <h2 className="text-xl font-bold tracking-tight">Payout Details</h2>
                  <p className="text-white/40 text-xs mt-1">Manage your payout account information. We use UPI and Phone Number for payments.</p>
                </div>
                
                <AnimatePresence mode="wait">
                {loadingBankDetails ? (
                  <motion.div key="bank-skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <BankDetailsSkeleton />
                  </motion.div>
                ) : (
                  <motion.div key="bank-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  <form onSubmit={handleSaveBankDetails} className="space-y-6">
                    <div className="bg-[#111] border border-white/5 rounded-3xl p-6 md:p-8 space-y-6 hover:border-white/10 transition-all">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[9px] uppercase tracking-widest text-[#8b7355] block font-bold">UPI ID</label>
                          <input 
                            required
                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#8b7355]/50 transition-colors" 
                            placeholder="username@upi"
                            value={bankDetails.upiId || ''}
                            onChange={(e) => setBankDetails({...bankDetails, upiId: e.target.value})}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[9px] uppercase tracking-widest text-[#8b7355] block font-bold">Phone Number</label>
                          <input 
                            required
                            type="tel"
                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#8b7355]/50 transition-colors" 
                            placeholder="+91 9876543210"
                            value={bankDetails.phoneNumber || ''}
                            onChange={(e) => setBankDetails({...bankDetails, phoneNumber: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      disabled={savingBankDetails} 
                      className="w-full py-4 bg-[#8b7355] text-white rounded-3xl font-bold text-xs uppercase tracking-widest hover:bg-[#725e46] transition-all flex items-center justify-center gap-2"
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
      </div>
    </div>
  );
}

// --- HELPER COMPONENTS ---

function WishlistPreview({ previewVideo, fallback }) {
  const videoRef = useRef(null);

  return (
    <div
      className="group/preview aspect-square rounded-[24px] mb-4 relative overflow-hidden flex items-center justify-center border border-white/5 bg-[#1a1a1a]"
      onMouseEnter={() => videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => videoRef.current?.pause()}
    >
      {previewVideo ? (
        <video
          ref={videoRef}
          src={previewVideo}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover transition-all duration-500 group-hover/preview:scale-[1.03]"
        />
      ) : fallback ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),_transparent_42%)] px-4 text-center">
          {fallback}
        </div>
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_42%),linear-gradient(180deg,_rgba(255,255,255,0.03),_rgba(0,0,0,0.35))] transition-all duration-500 group-hover/preview:blur-sm group-hover/preview:brightness-[0.45]" />
          <Eye className="text-white/10 transition-all duration-500 group-hover/preview:opacity-0" size={54} />
        </>
      )}
    </div>
  );
}

function getListingPreviewFallback(status) {
  const config = {
    rejected: { icon: XCircle, label: 'Listing rejected', tone: 'text-red-400/70' },
    pending_review: { icon: Clock, label: 'Awaiting review', tone: 'text-amber-400/70' },
    changes_requested: { icon: AlertTriangle, label: 'Changes requested', tone: 'text-sky-400/70' },
  };
  const c = config[status];
  if (!c) return null;
  const Icon = c.icon;
  return (
    <div className={`flex flex-col items-center gap-2.5 ${c.tone}`}>
      <Icon size={30} strokeWidth={1.5} />
      <span className="text-[10px] font-bold uppercase tracking-[0.15em]">{c.label}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    approved: { label: 'Live', color: 'bg-emerald-500/85 text-white', pulse: true },
    pending_review: { label: 'Pending', color: 'bg-amber-500/85 text-white' },
    changes_requested: { label: 'Changes', color: 'bg-sky-500/85 text-white' },
    rejected: { label: 'Rejected', color: 'bg-red-500/85 text-white' },
    in_auction: { label: 'In Auction', color: 'bg-orange-500/85 text-white' },
    sold: { label: 'Sold', color: 'bg-white/85 text-black' },
  };
  const c = config[status] || { label: status, color: 'bg-white/15 text-white' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider backdrop-blur-md ${c.color}`}>
      {c.pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
        </span>
      )}
      {c.label}
    </span>
  );
}

// --- LOADING SKELETONS ---

function Skeleton({ className = '' }) {
  return <div className={`skeleton-shimmer ${className}`} />;
}

function CardSkeleton() {
  return (
    <div className="bg-[#111] border border-white/5 rounded-[32px] p-4 flex flex-col justify-between h-full">
      <div>
        <Skeleton className="aspect-square rounded-[24px] mb-4" />
        <div className="px-2 space-y-2.5">
          <Skeleton className="h-4 w-2/3 rounded-full" />
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton className="h-2.5 w-4/5 rounded-full" />
        </div>
      </div>
      <div className="flex items-center justify-between px-2 mt-5 pt-3 border-t border-white/5">
        <Skeleton className="h-4 w-14 rounded-full" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-8 w-8 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function CardGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.35 }}>
          <CardSkeleton />
        </motion.div>
      ))}
    </div>
  );
}

function BankDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-[#111] border border-white/5 rounded-3xl p-6 md:p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2.5">
            <Skeleton className="h-2.5 w-16 rounded-full" />
            <Skeleton className="h-[46px] w-full rounded-2xl" />
          </div>
          <div className="space-y-2.5">
            <Skeleton className="h-2.5 w-24 rounded-full" />
            <Skeleton className="h-[46px] w-full rounded-2xl" />
          </div>
        </div>
      </div>
      <Skeleton className="h-[52px] w-full rounded-3xl" />
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Icon size={40} className="text-white/10 mb-6" />
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-white/30 text-sm mb-8">{description}</p>
      <button onClick={onAction} className="px-8 py-3 bg-[#8b7355] text-white rounded-2xl font-bold text-xs uppercase tracking-widest">
        {action}
      </button>
    </div>
  );
}

function GuidancePanel({ tone = 'warning', title, messages, actionLabel, onAction, actionDisabled = false }) {
  const styles = {
    warning: {
      wrapper: 'border-amber-400/20 bg-amber-500/10',
      icon: 'text-amber-300',
      title: 'text-amber-200',
      text: 'text-amber-100/80',
      bullet: 'bg-amber-300',
      button: 'bg-amber-300 text-black hover:bg-amber-200',
    },
    error: {
      wrapper: 'border-red-400/20 bg-red-500/10',
      icon: 'text-red-300',
      title: 'text-red-200',
      text: 'text-red-100/80',
      bullet: 'bg-red-300',
      button: 'bg-red-300 text-black hover:bg-red-200',
    },
  };

  const palette = styles[tone] || styles.warning;

  return (
    <div className={`rounded-3xl border p-5 ${palette.wrapper}`}>
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className={`mt-0.5 shrink-0 ${palette.icon}`} />
        <div className="flex-1">
          <h3 className={`text-sm font-bold mb-2 ${palette.title}`}>{title}</h3>
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message} className={`flex items-start gap-2 text-sm leading-relaxed ${palette.text}`}>
                <span className={`mt-2 h-1.5 w-1.5 rounded-full shrink-0 ${palette.bullet}`} />
                <span>{message}</span>
              </div>
            ))}
          </div>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className={`mt-4 rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${palette.button}`}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}