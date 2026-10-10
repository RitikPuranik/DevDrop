import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Loader2, Heart, User, ChevronRight, ShoppingBag, Gavel, Sparkles, CheckCircle, ExternalLink, Eye } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { websiteAPI } from "../../api/website";
import { buyerAPI } from "../../api/buyer";
import { toast } from 'sonner';

const transition = {
  type: "spring",
  stiffness: 220,
  damping: 28,
  mass: 1.2
};

export default function SmoothEliteGallery() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState(() => {
    const urlFilter = searchParams.get('filter');
    return ['free', 'paid', 'exclusive'].includes(urlFilter) ? urlFilter : 'all';
  });

  // Purchase state for modal
  const [purchased, setPurchased] = useState(false);
  const [buying, setBuying] = useState(false);
  const [checkingPurchase, setCheckingPurchase] = useState(false);
  const isLoggedIn = !!localStorage.getItem('token');

  // Check purchase status when modal opens
  useEffect(() => {
    if (!selectedId || !isLoggedIn) { setPurchased(false); return; }
    const itemId = selectedId._id || selectedId.id;
    setCheckingPurchase(true);
    buyerAPI.checkPurchase(itemId)
      .then(res => setPurchased(res.data?.data?.hasPurchased || false))
      .catch(() => setPurchased(false))
      .finally(() => setCheckingPurchase(false));
  }, [selectedId]);

  const handleQuickPurchase = async () => {
    if (!isLoggedIn) { toast.error('Please login first'); return; }
    if (!selectedId || purchased) return;
    const itemId = selectedId._id || selectedId.id;
    try {
      setBuying(true);
      if (selectedId.category === 'free') {
        await buyerAPI.purchaseFree(itemId);
        toast.success('Template acquired! View downloads on the detail page.');
        setPurchased(true);
        return;
      }
      navigate(`/checkout/${itemId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Purchase failed');
    } finally { setBuying(false); }
  };

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const res = await websiteAPI.getAll();
        const data = res.data?.websites || res.data?.data || res.data || [];
        setTemplates(data);
      } catch (error) {
        console.error("Error fetching websites:", error);
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  useEffect(() => {
    document.body.style.overflow = selectedId ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [selectedId]);

  const filteredItems = useMemo(() => {
    return templates.filter(item => {
      const title = item.title || item.name || "";
      const type = item.type || item.category || "free";
      const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = activeFilter === "all" || type === activeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [searchQuery, activeFilter, templates]);

  const renderPreviewPane = (item, mode = 'card') => {
    const previewVideo = item.files?.previewVideo?.url || null;
    const previewTarget = item.previewUrl || item.deployedUrl || null;
    const isCard = mode === 'card';
    const containerClasses = isCard
      ? 'group/preview aspect-[4/3] rounded-xl mb-4 relative overflow-hidden flex items-center justify-center border border-white/5'
      : 'group/preview h-full min-h-[200px] sm:min-h-[260px] lg:min-h-[340px] rounded-xl relative flex items-center justify-center overflow-hidden border border-white/5';

    return (
      <motion.div
        layoutId={`image-box-${item._id || item.id}`}
        transition={transition}
        style={{ backgroundColor: item.color || '#1a1a1a' }}
        className={containerClasses}
      >
        {previewVideo ? (
          <video
            src={previewVideo}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-contain transition-all duration-500 group-hover/preview:scale-[1.03] group-hover/preview:brightness-[0.45]"
          />
        ) : (
          <div className="absolute inset-0 bg-white/[0.02] transition-all duration-500 group-hover/preview:brightness-[0.45]" />
        )}

        {!previewVideo && <Eye className="text-white/10 transition-all duration-500 group-hover/preview:opacity-0" size={isCard ? 54 : 80} />}

        {previewTarget && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 opacity-0 transition-all duration-500 group-hover/preview:opacity-100">
            <a
              href={previewTarget}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-2 rounded-full bg-[#e8e2d6] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-black  transition-transform duration-300 hover:scale-[1.06]"
            >
              <ExternalLink size={14} /> Open Live
            </a>
          </div>
        )}

        {/* Wishlist overlay */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-30">
          {(item.wishlistCount > 0) && (
            <span className="flex items-center gap-1 bg-black/60 text-[11px] font-bold text-white/80 px-2.5 py-1 rounded-full">
              <Heart size={9} className="text-red-400 fill-red-400" /> {item.wishlistCount}
            </span>
          )}
        </div>

        {/* Category badge */}
        <div className="absolute top-3 left-3 z-30">
          <span className={`px-3 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wider ${item.category === 'exclusive' ? 'bg-[#cbb392] text-[#050505]' :
              item.category === 'paid' ? 'bg-[#8b7355] text-white' :
                'bg-emerald-500/90 text-white'
            }`}>
            {item.category}
          </span>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="tpl min-h-screen pb-20">

      {/* --- NAV DOCK (Clean, Dynamic Positioning) --- */}
      {/* Changed: Non-sticky on mobile (`relative pt-32`), stays sticky on desktop (`md:sticky md:top-0 md:pt-4`) to drop down beautifully without merging with the header navbar */}
      <nav className="relative md:sticky top-0 z-40 flex justify-center mb-8 lg:mb-12 px-4 sm:px-7 pt-32 md:pt-4 bg-[#050505]">
        <motion.div className="flex flex-col md:flex-row items-stretch md:items-center mt-4 md:mt-20 justify-between bg-white/[0.03] border border-white/10 p-2 md:p-1.5 rounded-2xl md:rounded-full w-full max-w-5xl focus-within:border-[#e8e2d6] transition-all duration-500 gap-3 md:gap-0">
          <div className="relative flex items-center w-full md:max-w-xs ml-0 md:ml-2">
            <Search className="absolute left-3 text-white/50" size={16} />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent py-2.5 md:py-3 pl-10 pr-4 focus:outline-none text-sm font-medium placeholder:text-white/40"
            />
          </div>

          <div className="flex items-center justify-start overflow-x-auto no-scrollbar md:justify-end gap-2 pr-0 md:pr-1">
            <div className="flex items-center gap-1 bg-white/[0.04] rounded-full p-1 w-full md:w-auto whitespace-nowrap">
              {['all', 'free', 'paid', 'exclusive'].map((filter) => (
                <motion.button
                  key={filter}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveFilter(filter)}
                  className={`relative flex-1 md:flex-none px-2 sm:px-4 md:px-6 py-2 text-[10.5px] sm:text-[11px] md:text-xs font-bold uppercase tracking-[0.08em] sm:tracking-[0.16em] transition-colors duration-300 z-10 ${activeFilter === filter ? 'text-[#050505]' : 'text-white/55 hover:text-white'
                    }`}
                >
                  {activeFilter === filter && (
                    <motion.div
                      layoutId="activeFilter"
                      className="absolute inset-0 bg-[#e8e2d6] rounded-full -z-10"
                      transition={transition}
                    />
                  )}
                  {filter}
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      </nav>

      {/* --- MAIN GRID --- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-7">
        {loading ? (
          <div className="flex flex-col justify-center items-center py-40 gap-4">
            <Loader2 className="animate-spin text-[#cbb392]" size={40} />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">Syncing Assets</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 gap-3">
            <Search size={40} className="text-white/10" />
            <p className="text-[15px] text-white/55 font-semibold">No templates found</p>
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            <AnimatePresence mode="popLayout">
              {filteredItems.map((item) => {
                const itemId = item._id || item.id;
                const sellerName = item.sellerId?.name || 'Creator';
                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    layoutId={`card-${itemId}`}
                    key={itemId}
                    onClick={() => setSelectedId(item)}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    transition={transition}
                    className="group cursor-pointer bg-white/[0.03] rounded-2xl p-3 border border-white/[0.08] hover:border-white/20 transition-colors duration-300"
                  >
                    {renderPreviewPane(item, 'card')}

                    <div className="px-2">
                      <motion.h3 layoutId={`title-${itemId}`} transition={transition} className="tpl-display text-[19px] truncate">{item.title || item.name}</motion.h3>
                      <div className="flex items-center justify-between mt-1">
                        <motion.p layoutId={`price-${itemId}`} transition={transition} className="text-[#cbb392] font-bold text-[13px] tracking-[0.12em] uppercase">
                          {item.category === 'exclusive' ? 'Exclusive' : item.category === 'free' ? 'FREE' : item.price ? `₹${item.price}` : 'Paid'}
                        </motion.p>
                        <span className="flex items-center gap-1.5 text-xs text-white/50">
                          {item.sellerId?.avatar ? (
                            <img src={item.sellerId.avatar} alt={sellerName} className="w-4 h-4 rounded-full object-cover" />
                          ) : (
                            <User size={10} />
                          )}
                          <span className="truncate max-w-[110px]">{sellerName}</span>
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* --- MODAL (View Details) --- */}
      <AnimatePresence>
        {selectedId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
              className="absolute inset-0 bg-black/80"
            />

            <motion.div
              layoutId={`card-${selectedId._id || selectedId.id}`}
              transition={transition}
              className="relative w-full max-w-4xl bg-[#0a0a0a] rounded-2xl border border-white/10 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-2 z-50 max-h-[92vh] lg:max-h-none h-fit"
            >
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedId(null); }}
                className="absolute top-3 right-3 z-[110] p-2 bg-white/10 text-white hover:bg-[#8b7355] rounded-full transition-all active:scale-90"
              >
                <X size={16} />
              </button>

              <div className="p-3">
                {renderPreviewPane(selectedId, 'modal')}
              </div>

              <div className="p-6 sm:p-8 lg:p-9 flex flex-col justify-center">
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={{ duration: 0.4 }}
                >
                  <motion.h2 layoutId={`title-${selectedId._id || selectedId.id}`} transition={transition} className="tpl-display text-2xl sm:text-[28px] lg:text-[32px] leading-tight mb-2">
                    {selectedId.title || selectedId.name}
                  </motion.h2>

                  <motion.div layoutId={`price-${selectedId._id || selectedId.id}`} transition={transition} className="text-lg font-semibold text-[#cbb392] mb-4">
                    {selectedId.category === 'exclusive' ? 'Exclusive Listing' : selectedId.category === 'free' ? 'FREE' : `₹${selectedId.price || 'Price on request'}`}
                  </motion.div>

                  {/* Seller info */}
                  {selectedId.sellerId && (
                    <div className="flex items-center gap-3 mb-5">
                      {selectedId.sellerId.avatar ? (
                        <img src={selectedId.sellerId.avatar} alt={selectedId.sellerId?.name || 'Creator'} className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[#8b7355] flex items-center justify-center text-xs font-bold text-white">
                          {(selectedId.sellerId?.name || 'C')[0]?.toUpperCase()}
                        </div>
                      )}
                      <p className="text-sm font-semibold text-white/70">{selectedId.sellerId?.name || 'Creator'}</p>
                      {(selectedId.wishlistCount > 0) && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-white/50">
                          <Heart size={10} className="text-red-400 fill-red-400" /> {selectedId.wishlistCount} wishlisted
                        </span>
                      )}
                    </div>
                  )}

                  {/* Description preview */}
                  {selectedId.description && (
                    <p className="text-white/60 text-[14.5px] mb-6 leading-relaxed line-clamp-3 md:line-clamp-none">{selectedId.description}</p>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {checkingPurchase ? (
                      <div className="w-full py-3 flex items-center justify-center gap-2 text-white/50 text-sm">
                        <Loader2 size={16} className="animate-spin" /> Checking…
                      </div>
                    ) : purchased ? (
                      <button
                        onClick={() => navigate(`/website/${selectedId._id || selectedId.id}`)}
                        className="w-full py-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-bold text-[13px] uppercase tracking-[0.12em] flex items-center justify-center gap-2 hover:bg-emerald-500/20 transition-all active:scale-[0.98]"
                      >
                        <CheckCircle size={16} /> Purchased — View Downloads
                      </button>
                    ) : selectedId.category === 'exclusive' ? (
                      <button
                        onClick={() => navigate(`/website/${selectedId._id || selectedId.id}`)}
                        className="w-full py-3 bg-[#8b7355] text-white rounded-full font-bold text-[13px] uppercase tracking-[0.12em] flex items-center justify-center gap-2 hover:bg-[#725e46] transition-all active:scale-[0.98]"
                      >
                        <Gavel size={16} /> Make an Offer
                      </button>
                    ) : (
                      <button
                        onClick={handleQuickPurchase}
                        disabled={buying}
                        className="w-full py-3 bg-[#e8e2d6] text-[#050505] rounded-full font-bold text-[13px] uppercase tracking-[0.12em] flex items-center justify-center gap-2 hover:bg-white transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        {buying ? (
                          <><Loader2 size={16} className="animate-spin" /> Processing…</>
                        ) : selectedId.category === 'free' ? (
                          <><Sparkles size={16} /> Get for Free</>
                        ) : (
                          <><ShoppingBag size={16} /> Buy Now — ₹{selectedId.price}</>
                        )}
                      </button>
                    )}

                    {!purchased && (
                      <button
                        onClick={() => navigate(`/website/${selectedId._id || selectedId.id}`)}
                        className="w-full py-3 bg-white/5 border border-white/15 text-white/75 rounded-full font-bold text-[13px] uppercase tracking-[0.12em] flex items-center justify-center gap-2 hover:text-white hover:bg-white/10 transition-all"
                      >
                        View Full Details <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
