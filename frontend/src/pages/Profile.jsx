import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Package, Heart, DollarSign, Upload, ShoppingBag, 
  ExternalLink, Trash2, Loader2, LogOut, Plus, 
  ArrowLeft, ChevronDown, X, Download, FileCode, FileText, Film, CheckCircle 
} from 'lucide-react';
import { userAPI } from '../api/user';
import { sellerAPI } from '../api/seller';
import { buyerAPI } from '../api/buyer';
import { wishlistAPI } from '../api/wishlist';
import { assetAPI } from '../api/asset';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const TABS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'listings', label: 'My Listings', icon: Upload },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag },
  { id: 'wishlist', label: 'Wishlist', icon: Heart },
];

const TECH_OPTIONS = {
  frontend: ['React', 'Vue', 'Next.js', 'Tailwind', 'Framer Motion', 'Three.js', 'GSAP'],
  backend: ['Node.js', 'Express', 'Django', 'FastAPI', 'Laravel'],
  database: ['MongoDB', 'PostgreSQL', 'MySQL', 'Firebase', 'Supabase'],
  devops: ['Docker', 'AWS', 'Vercel', 'Netlify'],
};

export default function Profile() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [listings, setListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadsModalOpen, setDownloadsModalOpen] = useState(false);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [downloadsAssets, setDownloadsAssets] = useState(null);
  const [downloadsWebsite, setDownloadsWebsite] = useState(null);
  const [downloadsPurchase, setDownloadsPurchase] = useState(null);
  const [purchaseDetailsOpen, setPurchaseDetailsOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [selectedWebsiteDetail, setSelectedWebsiteDetail] = useState(null);
  const [detailDownloadsLoading, setDetailDownloadsLoading] = useState(false);
  const [detailDownloadsAssets, setDetailDownloadsAssets] = useState(null);

  // --- SELLING FORM STATE ---
  const [isAddingListing, setIsAddingListing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openSection, setOpenSection] = useState('frontend');
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
    else if (activeTab === 'wishlist') fetchWishlist();
  }, [activeTab]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const [profileRes, dashRes] = await Promise.all([
        userAPI.getProfile(),
        userAPI.getDashboard(),
      ]);
      setProfile(profileRes.data?.data?.user || profileRes.data?.data);
      setDashboard(dashRes.data?.data);
    } catch (err) {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchListings = async () => {
    try {
      const res = await sellerAPI.getMyWebsites();
      setListings(res.data?.data || []);
    } catch { setListings([]); }
  };

  const fetchPurchases = async () => {
    try {
      const res = await buyerAPI.getMyPurchases();
      setPurchases(res.data?.data || []);
    } catch { setPurchases([]); }
  };

  const fetchWishlist = async () => {
    try {
      const res = await wishlistAPI.getWishlist();
      setWishlist(res.data?.data || []);
    } catch { setWishlist([]); }
  };

  // Download a specific asset by requesting signed URLs and opening the chosen file only
  const downloadAsset = async (websiteId, fileType) => {
    try {
      setDownloadsLoading(true);
      // backend returns all signed urls, we only open the requested one
      const res = await assetAPI.getAssetUrls(websiteId);
      const data = res.data?.data;
      const map = {
        source: data?.sourceCode?.url,
        docs: data?.docs?.url,
        video: data?.video?.url,
      };
      const url = map[fileType];
      if (!url) return toast.error('Requested file not available');
      window.open(url, '_blank');
      toast.success('Download opened in a new tab');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to get download link');
    } finally {
      setDownloadsLoading(false);
    }
  };

  // --- ACTIONS ---
  const handleAddListing = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await sellerAPI.submitWebsite({
        ...form,
        price: form.category === 'free' ? 0 : form.price,
        techStack,
      });
      toast.success('Website submitted for review!');
      setIsAddingListing(false);
      setForm({ name: '', description: '', category: 'free', price: 0, deployedUrl: '', githubUrl: '' });
      setTechStack({ frontend: [], backend: [], database: [], devops: [] });
      fetchListings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#8b7355]" size={40} />
      </div>
    );
  }

  const stats = [
    { label: 'Uploaded', value: dashboard?.uploadedWebsites || 0, icon: Upload, color: '#f97316' },
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
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#8b7355] to-[#5a4a38] flex items-center justify-center text-3xl font-serif italic text-white shadow-lg shadow-[#8b7355]/20">
              {profile?.name?.[0]?.toUpperCase() || 'U'}
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
              onClick={() => { setActiveTab(tab.id); setIsAddingListing(false); }}
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
                  <button onClick={() => setIsAddingListing(true)} className="flex items-center gap-2 px-5 py-2.5 bg-[#8b7355] rounded-xl text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[#725e46] transition-all">
                    <Plus size={14} /> List New
                  </button>
                )}
              </div>

              {isAddingListing ? (
                /* ── INTEGRATED SELL FORM ── */
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="max-w-3xl mx-auto space-y-4">
                   <button onClick={() => setIsAddingListing(false)} className="flex items-center gap-2 text-white/30 text-[10px] font-bold uppercase mb-4 hover:text-white transition-colors">
                    <ArrowLeft size={12} /> Back to Hub
                   </button>
                   
                   <form onSubmit={handleAddListing} className="space-y-4 pb-10">
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

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                          <label className="text-[9px] uppercase tracking-widest text-[#8b7355] block mb-2 font-bold">Price (₹)</label>
                          <input type="number" className="w-full bg-transparent text-lg font-bold outline-none" 
                            value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} />
                        </div>
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
                listings.length === 0 ? (
                  <EmptyState icon={Upload} title="No listings yet" description="Start selling your templates" action="Get Started" onAction={() => setIsAddingListing(true)} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {listings.map((item) => (
                      <div key={item._id} className="bg-[#111] border border-white/5 rounded-3xl p-6 hover:border-white/15 transition-all group">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="font-bold text-lg tracking-tight">{item.name}</h3>
                            <p className="text-white/30 text-xs mt-1 line-clamp-1">{item.description}</p>
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                        {item.adminComment && (
                          <div className="mb-4 rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                            <p className="text-[9px] uppercase tracking-[0.2em] text-white/35 font-bold mb-2">Admin Note</p>
                            <p className="text-xs text-white/55 leading-relaxed">{item.adminComment}</p>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                          <span className="text-[#8b7355] font-bold text-sm">{item.price === 0 ? 'FREE' : `₹${item.price}`}</span>
                          <div className="flex gap-2">
                            {item.deployedUrl && (
                              <a href={item.deployedUrl} target="_blank" rel="noreferrer" className="p-2 bg-white/5 rounded-xl hover:bg-white/10">
                                <ExternalLink size={14} />
                              </a>
                            )}
                            <button onClick={() => handleDeleteListing(item._id)} className="p-2 bg-white/5 rounded-xl hover:bg-red-500/20 hover:text-red-400 transition-all">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </motion.div>
          )}

          {activeTab === 'purchases' && (
            <motion.div key="purchases" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {purchases.length === 0 ? (
                <EmptyState icon={ShoppingBag} title="No purchases yet" description="Browse templates to find your next project" action="Browse" onAction={() => navigate('/template')} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {purchases.map((p) => {
                    const web = p.websiteId || {};
                    const cat = web.category || 'paid';
                    const webId = web._id || (typeof p.websiteId === 'string' ? p.websiteId : null);
                    return (
                      <div key={p._id} onClick={() => {
                        setSelectedPurchase(p);
                        setSelectedWebsiteDetail(web);
                        setPurchaseDetailsOpen(true);
                      }} className="bg-[#111] border border-white/5 rounded-3xl p-6 hover:border-white/15 transition-all group cursor-pointer">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-bold text-lg tracking-tight">{web.name || 'Template'}</h3>
                            <p className="text-white/20 text-[10px] mt-1">
                              {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recently'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full text-emerald-400 bg-emerald-500/10">
                              <CheckCircle size={8} /> Owned
                            </span>
                            <span className={`text-[8px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full ${
                              cat === 'free' ? 'text-emerald-400 bg-emerald-500/10' :
                              cat === 'exclusive' ? 'text-orange-400 bg-orange-500/10' :
                              'text-[#8b7355] bg-[#8b7355]/10'
                            }`}>
                              {cat}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                          <span className="text-[#8b7355] font-bold text-sm">
                            {p.amount ? `₹${p.amount}` : cat === 'free' ? 'FREE' : `₹${web.price || 0}`}
                          </span>
                          <div className="flex gap-2">
                            {web.deployedUrl && (
                              <a onClick={(e) => e.stopPropagation()} href={web.deployedUrl} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1.5 px-3 py-2 bg-white/5 rounded-xl text-[10px] font-bold text-white/40 hover:text-white hover:bg-white/10 transition-all">
                                <ExternalLink size={11} /> Preview
                              </a>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Open modal; don't fetch links until user chooses a file
                                setDownloadsModalOpen(true);
                                setDownloadsLoading(false);
                                setDownloadsAssets(null);
                                setDownloadsWebsite(web);
                                setDownloadsPurchase(p);
                              }}
                              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-black rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all"
                            >
                              <Download size={11} /> Downloads
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* Purchase Details Modal */}
          {purchaseDetailsOpen && selectedPurchase && selectedWebsiteDetail && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center">
              <div className="absolute inset-0 bg-black/60" onClick={() => setPurchaseDetailsOpen(false)} />
              <div className="relative bg-[#0b0b0b] border border-white/5 rounded-2xl p-6 max-w-3xl w-full mx-4 overflow-auto max-h-[80vh]">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold">{selectedWebsiteDetail.name}</h3>
                    <p className="text-[10px] text-white/30">{selectedWebsiteDetail.category?.toUpperCase() || 'PAID'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[12px] text-white/30">Paid</p>
                      <p className="text-lg font-black text-emerald-300">₹{selectedPurchase.totalPaid ?? selectedPurchase.amount ?? selectedWebsiteDetail.price ?? 0}</p>
                    </div>
                    <button onClick={() => setPurchaseDetailsOpen(false)} className="p-2 text-white/30 hover:text-white">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    {/* Preview area */}
                    <div className="aspect-video rounded-lg bg-[#111] overflow-hidden mb-4">
                      {selectedWebsiteDetail.files?.previewVideo?.url ? (
                        <video src={selectedWebsiteDetail.files.previewVideo.url} controls className="w-full h-full object-cover" />
                      ) : selectedWebsiteDetail.deployedUrl ? (
                        <a href={selectedWebsiteDetail.deployedUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center h-full">Open Live Preview</a>
                      ) : (
                        <div className="flex items-center justify-center h-full text-white/20">No preview available</div>
                      )}
                    </div>

                    <div className="bg-[#111] border border-white/5 rounded-2xl p-4 mb-4">
                      <h4 className="font-bold mb-2">About this template</h4>
                      <p className="text-white/40 text-sm">{selectedWebsiteDetail.description}</p>
                    </div>

                    <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
                      <h4 className="font-bold mb-2">Tech Stack</h4>
                      <div className="flex flex-wrap gap-2">
                        {((selectedWebsiteDetail.techStack?.frontend||[]).concat(selectedWebsiteDetail.techStack?.backend||[], selectedWebsiteDetail.techStack?.database||[], selectedWebsiteDetail.techStack?.devops||[], selectedWebsiteDetail.techStack?.other||[])||[]).map((t,i)=>(
                          <span key={i} className="px-3 py-1 bg-white/5 rounded-full text-[11px] text-white/40">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-1 space-y-4">
                    <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
                      <p className="text-[10px] text-white/30">Seller</p>
                      <p className="font-bold mt-1">{selectedWebsiteDetail.sellerId?.name || 'Creator'}</p>
                      {selectedWebsiteDetail.sellerId?.email && <p className="text-[10px] text-white/30">{selectedWebsiteDetail.sellerId.email}</p>}
                    </div>

                    <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
                      <p className="text-[10px] text-white/30">Purchase Date</p>
                      <p className="font-bold mt-1">{new Date(selectedPurchase.purchaseDate || selectedPurchase.createdAt).toLocaleString()}</p>
                    </div>

                    <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
                      <p className="text-[10px] text-white/30">Files</p>
                      <div className="mt-2 space-y-2">
                        {selectedWebsiteDetail.githubUrl && (
                          <a href={selectedWebsiteDetail.githubUrl} target="_blank" rel="noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-500/10 text-emerald-300 rounded-lg font-bold">
                            <FileCode size={14} /> Open Seller GitHub
                          </a>
                        )}
                        {selectedWebsiteDetail.deployedUrl && (
                          <a href={selectedWebsiteDetail.deployedUrl} target="_blank" rel="noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2 bg-white/5 text-white rounded-lg font-bold">
                            <ExternalLink size={14} /> Open Live Site
                          </a>
                        )}
                        {selectedWebsiteDetail.files?.previewVideo?.url && (
                          <a href={selectedWebsiteDetail.files.previewVideo.url} target="_blank" rel="noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2 bg-amber-500/10 text-amber-200 rounded-lg font-bold">
                            <Film size={14} /> Open Short Preview
                          </a>
                        )}
                        <div className="space-y-2">
                          <button onClick={() => downloadAsset(selectedWebsiteDetail._id || selectedWebsiteDetail, 'source')}
                            className="w-full py-2 bg-emerald-500 text-black rounded-lg font-bold">Download Source ZIP</button>
                          <button onClick={() => downloadAsset(selectedWebsiteDetail._id || selectedWebsiteDetail, 'docs')}
                            className="w-full py-2 bg-blue-500 text-black rounded-lg font-bold">Download Docs PDF</button>
                          {selectedWebsiteDetail.files?.video && (
                            <button onClick={() => downloadAsset(selectedWebsiteDetail._id || selectedWebsiteDetail, 'video')}
                              className="w-full py-2 bg-purple-500 text-black rounded-lg font-bold">Download Walkthrough Video</button>
                          )}
                          <p className="text-[10px] text-white/30">Seller GitHub and deployed links stay visible here. ZIP, PDF, and private videos open in a new tab when generated.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Downloads Modal */}
          {downloadsModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center">
              <div className="absolute inset-0 bg-black/60" onClick={() => setDownloadsModalOpen(false)} />
              <div className="relative bg-[#0b0b0b] border border-white/5 rounded-2xl p-6 max-w-xl w-full mx-4">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold">Downloads — {downloadsWebsite?.name || 'Template'}</h3>
                    <p className="text-[10px] text-white/30">Generate fresh links anytime from your dashboard.</p>
                    {downloadsPurchase && (
                      <div className="text-[12px] text-white/30 mt-2">
                        <div>Paid: <span className="text-emerald-300 font-bold">₹{downloadsPurchase.totalPaid ?? downloadsPurchase.amount ?? downloadsWebsite?.price ?? 0}</span></div>
                        <div>Purchased: <span className="text-white/40">{new Date(downloadsPurchase.purchaseDate || downloadsPurchase.createdAt).toLocaleString()}</span></div>
                        {downloadsPurchase.razorpayOrderId && <div>Order: <span className="text-white/40">{downloadsPurchase.razorpayOrderId}</span></div>}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setDownloadsModalOpen(false)} className="p-2 text-white/30 hover:text-white">
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-white/30">Open the seller links directly, or generate ZIP, PDF, and video downloads on demand.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {downloadsWebsite?.githubUrl && (
                      <a href={downloadsWebsite.githubUrl} target="_blank" rel="noreferrer"
                        className="py-3 bg-emerald-500/10 text-emerald-300 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-500/20 transition-all">
                        <FileCode size={16} /> Seller GitHub Repo
                      </a>
                    )}
                    {downloadsWebsite?.deployedUrl && (
                      <a href={downloadsWebsite.deployedUrl} target="_blank" rel="noreferrer"
                        className="py-3 bg-white/5 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-all">
                        <ExternalLink size={16} /> Live Deployment
                      </a>
                    )}
                    {downloadsWebsite?.files?.previewVideo?.url && (
                      <a href={downloadsWebsite.files.previewVideo.url} target="_blank" rel="noreferrer"
                        className="py-3 bg-amber-500/10 text-amber-200 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-all sm:col-span-2">
                        <Film size={16} /> Short Preview Video
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 mt-3">
                    <button onClick={() => downloadAsset(downloadsWebsite._id || downloadsWebsite, 'source')}
                      className="flex-1 py-3 bg-emerald-500 text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all">
                      <FileCode size={16} /> Download Source ZIP
                    </button>
                    <button onClick={() => downloadAsset(downloadsWebsite._id || downloadsWebsite, 'docs')}
                      className="flex-1 py-3 bg-blue-500 text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-600 transition-all">
                      <FileText size={16} /> Download Docs PDF
                    </button>
                    {downloadsWebsite?.files?.video && (
                      <button onClick={() => downloadAsset(downloadsWebsite._id || downloadsWebsite, 'video')}
                        className="flex-1 py-3 bg-purple-500 text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-purple-600 transition-all">
                        <Film size={16} /> Download Walkthrough
                      </button>
                    )}
                  </div>
                  <div className="pt-4 border-t border-white/5 flex items-center justify-end gap-2">
                    <button onClick={() => setDownloadsModalOpen(false)} className="px-4 py-2 bg-white/5 rounded-xl">Close</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'wishlist' && (
            <motion.div key="wishlist" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {wishlist.length === 0 ? (
                <EmptyState icon={Heart} title="Wishlist empty" description="Save templates you love for later" action="Browse" onAction={() => navigate('/template')} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {wishlist.map((w) => (
                    <div key={w._id} className="bg-[#111] border border-white/5 rounded-2xl p-5 group flex justify-between items-center">
                      <span className="font-bold">{w.websiteId?.name}</span>
                      <button onClick={() => handleRemoveWishlist(w.websiteId?._id)} className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg">
                        <Heart size={14} className="fill-current" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- HELPER COMPONENTS ---

function StatusBadge({ status }) {
  const config = {
    approved: { label: 'Live', color: 'text-emerald-400 bg-emerald-500/10' },
    pending_review: { label: 'Pending', color: 'text-amber-400 bg-amber-500/10' },
    changes_requested: { label: 'Changes', color: 'text-sky-300 bg-sky-500/10' },
    rejected: { label: 'Rejected', color: 'text-red-400 bg-red-500/10' },
  };
  const c = config[status] || { label: status, color: 'text-white/40 bg-white/5' };
  return <span className={`text-[8px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full ${c.color}`}>{c.label}</span>;
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
