import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Package, Heart, DollarSign, Upload, ShoppingBag, ExternalLink, Trash2, Loader2, LogOut, ChevronRight } from 'lucide-react';
import { userAPI } from '../api/user';
import { sellerAPI } from '../api/seller';
import { buyerAPI } from '../api/buyer';
import { wishlistAPI } from '../api/wishlist';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const TABS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'listings', label: 'My Listings', icon: Upload },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag },
  { id: 'wishlist', label: 'Wishlist', icon: Heart },
];

export default function Profile() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [listings, setListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);

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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-6"
        >
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#8b7355] to-[#5a4a38] flex items-center justify-center text-3xl font-serif italic text-white shadow-lg shadow-[#8b7355]/20">
              {profile?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">{profile?.name || 'User'}</h1>
              <p className="text-white/30 text-sm mt-1">{profile?.email}</p>
              {profile?.role && (
                <span className="inline-block mt-2 text-[9px] font-bold uppercase tracking-[0.3em] text-[#8b7355] bg-[#8b7355]/10 px-3 py-1 rounded-full">
                  {profile.role}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold uppercase tracking-[0.15em] text-white/40 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
          >
            <LogOut size={14} /> Logout
          </button>
        </motion.div>

        {/* ── TAB NAV ── */}
        <div className="flex gap-1 bg-white/[0.03] border border-white/10 p-1.5 rounded-[28px] mb-10 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-6 py-3 text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap z-10 ${
                activeTab === tab.id ? 'text-black' : 'text-gray-500 hover:text-white'
              }`}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="profileTab"
                  className="absolute inset-0 bg-white rounded-[22px] -z-10"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.6 }}
                />
              )}
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                {stats.map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="bg-[#111] border border-white/5 rounded-3xl p-6 group hover:border-white/15 transition-all"
                  >
                    <s.icon size={20} style={{ color: s.color }} className="mb-4 opacity-60 group-hover:opacity-100 transition-opacity" />
                    <p className="text-3xl font-black tracking-tight">{s.value}</p>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 mt-2 font-bold">{s.label}</p>
                  </motion.div>
                ))}
              </div>

              <div className="flex gap-4">
                <button onClick={() => navigate('/sell')} className="flex-1 bg-[#8b7355] hover:bg-[#725e46] text-white py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                  <Upload size={14} /> Sell a Website
                </button>
                <button onClick={() => navigate('/template')} className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-white py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                  <Package size={14} /> Browse Templates
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'listings' && (
            <motion.div key="listings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {listings.length === 0 ? (
                <EmptyState icon={Upload} title="No listings yet" description="Start selling your website templates" action="Sell Now" onAction={() => navigate('/sell')} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {listings.map((item) => (
                    <div key={item._id} className="bg-[#111] border border-white/5 rounded-3xl p-6 hover:border-white/15 transition-all group">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="font-bold text-lg tracking-tight">{item.name}</h3>
                          <p className="text-white/30 text-xs mt-1 line-clamp-2">{item.description}</p>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="flex items-center gap-4">
                          <span className="text-[#8b7355] font-bold text-sm">{item.category === 'free' ? 'FREE' : `₹${item.price}`}</span>
                          <span className="text-white/20 text-[10px] uppercase tracking-widest">{item.salesCount || 0} sales</span>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.deployedUrl && (
                            <a href={item.deployedUrl} target="_blank" rel="noreferrer" className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
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
                    const w = p.websiteId;
                    return (
                      <div key={p._id} className="bg-[#111] border border-white/5 rounded-3xl p-6 hover:border-white/15 transition-all group">
                        <h3 className="font-bold text-lg tracking-tight mb-1">{w?.name || 'Website'}</h3>
                        <p className="text-white/30 text-xs line-clamp-2 mb-4">{w?.description}</p>
                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                          <span className="text-[#8b7355] font-bold text-sm">{w?.category === 'free' ? 'FREE' : `₹${w?.price}`}</span>
                          <div className="flex gap-2">
                            {w?.deployedUrl && (
                              <a href={w.deployedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors">
                                Visit <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'wishlist' && (
            <motion.div key="wishlist" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {wishlist.length === 0 ? (
                <EmptyState icon={Heart} title="Wishlist empty" description="Save templates you love for later" action="Browse" onAction={() => navigate('/template')} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {wishlist.map((w) => {
                    const site = w.websiteId;
                    if (!site) return null;
                    return (
                      <div key={w._id} className="bg-[#111] border border-white/5 rounded-3xl p-5 hover:border-white/15 transition-all group cursor-pointer"
                        onClick={() => navigate(`/website/${site._id}`)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-bold tracking-tight">{site.name}</h3>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveWishlist(site._id); }}
                            className="p-1.5 rounded-xl hover:bg-red-500/20 transition-colors"
                          >
                            <Heart size={14} className="fill-red-400 text-red-400" />
                          </button>
                        </div>
                        <span className="text-[#8b7355] font-bold text-sm">{site.category === 'free' ? 'FREE' : `₹${site.price}`}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    approved: { label: 'Live', color: 'text-emerald-400 bg-emerald-500/10' },
    pending_review: { label: 'Pending', color: 'text-amber-400 bg-amber-500/10' },
    changes_requested: { label: 'Changes Req.', color: 'text-orange-400 bg-orange-500/10' },
    rejected: { label: 'Rejected', color: 'text-red-400 bg-red-500/10' },
    sold: { label: 'Sold', color: 'text-purple-400 bg-purple-500/10' },
  };
  const c = config[status] || { label: status, color: 'text-white/40 bg-white/5' };
  return <span className={`text-[9px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full ${c.color}`}>{c.label}</span>;
}

function EmptyState({ icon: Icon, title, description, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Icon size={40} className="text-white/10 mb-6" />
      <h3 className="text-xl font-bold tracking-tight mb-2">{title}</h3>
      <p className="text-white/30 text-sm mb-8 max-w-xs">{description}</p>
      <button onClick={onAction} className="px-8 py-3 bg-[#8b7355] text-white rounded-2xl font-bold text-xs uppercase tracking-[0.2em] hover:bg-[#725e46] transition-all active:scale-[0.98]">
        {action}
      </button>
    </div>
  );
}
