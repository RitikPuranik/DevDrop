import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Loader2, Heart, User, ChevronRight, ShoppingBag, Gavel, Sparkles, CheckCircle, ExternalLink, Eye } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { websiteAPI } from "../api/website";
import { buyerAPI } from "../api/buyer";
import { paymentAPI } from "../api/payment";
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
      // Paid: create Razorpay order
      const orderRes = await paymentAPI.createOrder({ websiteId: itemId });
      const order = orderRes.data?.data;
      if (!window.Razorpay) { toast.error("Payment gateway not loaded. Try the detail page."); return; }
      const rzp = new window.Razorpay({
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount, currency: order.currency,
        name: 'DevDrop', description: `Purchase: ${selectedId.name || selectedId.title}`,
        order_id: order.razorpayOrderId,
        handler: async (response) => {
          try {
            await paymentAPI.verifyPayment({ ...response, websiteId: itemId });
            toast.success('Payment successful! View downloads on the detail page.');
            setPurchased(true);
          } catch { toast.error('Verification failed'); }
        },
        theme: { color: '#8b7355' },
      });
      rzp.on('payment.failed', () => toast.error("Payment failed"));
      rzp.open();
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
      ? 'group/preview aspect-[12/11] rounded-[32px] mb-6 relative overflow-hidden flex items-center justify-center border border-white/5'
      : 'group/preview h-full min-h-[450px] rounded-[40px] relative flex items-center justify-center overflow-hidden border border-white/5';

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
            className="absolute inset-0 h-full w-full object-contain transition-all duration-500 group-hover/preview:scale-[1.03] group-hover/preview:blur-sm group-hover/preview:brightness-[0.45]"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_42%),linear-gradient(180deg,_rgba(255,255,255,0.03),_rgba(0,0,0,0.35))] transition-all duration-500 group-hover/preview:blur-sm group-hover/preview:brightness-[0.45]" />
        )}

        {!previewVideo && <Eye className="text-white/10 transition-all duration-500 group-hover/preview:opacity-0" size={isCard ? 54 : 80} />}

        {previewTarget && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 opacity-0 transition-all duration-500 group-hover/preview:opacity-100 backdrop-blur-[6px]">
            <a
              href={previewTarget}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.22em] text-black shadow-xl transition-transform duration-300 hover:scale-[1.06]"
            >
              <ExternalLink size={14} /> Open Live
            </a>
          </div>
        )}

        {/* Wishlist overlay */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-30">
          {(item.wishlistCount > 0) && (
            <span className="flex items-center gap-1 bg-black/60 backdrop-blur-md text-[9px] font-bold text-white/70 px-2.5 py-1 rounded-full">
              <Heart size={9} className="text-red-400 fill-red-400" /> {item.wishlistCount}
            </span>
          )}
        </div>

        {/* Category badge */}
        <div className="absolute top-3 left-3 z-30">
          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${item.category === 'exclusive' ? 'bg-orange-500/80 text-white' :
              item.category === 'paid' ? 'bg-[#8b7355]/80 text-white' :
                'bg-emerald-500/80 text-white'
            }`}>
            {item.category}
          </span>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white selection:bg-orange-500 font-sans antialiased pb-20">

      {/* --- NAV DOCK --- */}
      <nav className="top-0 z-40 flex justify-center mb-12 px-7">
        <motion.div className="flex flex-row items-center mt-20 justify-between bg-white/[0.03] border border-white/10 p-1.5 rounded-[32px] backdrop-blur-2xl shadow-2xl w-full max-w-5xl focus-within:border-[#e8e2d6] transition-all duration-500">
          <div className="relative flex items-center max-w-xs w-full ml-2">
            <Search className="absolute left-3 text-gray-500" size={16} />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent py-3 pl-10 pr-4 focus:outline-none text-sm font-medium placeholder:text-gray-600"
            />
          </div>

          <div className="flex items-center gap-2 pr-1">
            <div className="flex items-center gap-1 bg-black/40 rounded-[26px] p-1">
              {['all', 'free', 'paid', 'exclusive'].map((filter) => (
                <motion.button
                  key={filter}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveFilter(filter)}
                  className={`relative px-6 py-2 text-[10px] font-black uppercase tracking-[0.15em] transition-colors duration-300 z-10 ${activeFilter === filter ? 'text-black' : 'text-gray-500 hover:text-white'
                    }`}
                >
                  {activeFilter === filter && (
                    <motion.div
                      layoutId="activeFilter"
                      className="absolute inset-0 bg-white rounded-[22px] -z-10"
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
      <main className="max-w-7xl mx-auto px-7">
        {loading ? (
          <div className="flex flex-col justify-center items-center py-40 gap-4">
            <Loader2 className="animate-spin text-amber-100" size={40} />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500">Syncing Assets</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 gap-3">
            <Search size={40} className="text-white/10" />
            <p className="text-sm text-white/30 font-bold">No templates found</p>
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                    whileHover={{ y: -8 }}
                    whileTap={{ scale: 0.98 }}
                    transition={transition}
                    className="group cursor-pointer bg-[#111] rounded-[40px] p-4 border border-white/5 hover:border-orange-100/20 transition-colors duration-500"
                  >
                    {renderPreviewPane(item, 'card')}

                    <div className="px-2">
                      <motion.h3 layoutId={`title-${itemId}`} transition={transition} className="font-black text-xl tracking-tight">{item.title || item.name}</motion.h3>
                      <div className="flex items-center justify-between mt-1">
                        <motion.p layoutId={`price-${itemId}`} transition={transition} className="text-[#8b7355] font-bold text-sm tracking-widest uppercase">
                          {item.category === 'exclusive' ? 'Auction' : item.category === 'free' ? 'FREE' : item.price ? `₹${item.price}` : 'Paid'}
                        </motion.p>
                        <span className="flex items-center gap-1.5 text-[10px] text-white/20">
                          <User size={10} /> {sellerName}
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

      {/* --- MODAL (View Details only) --- */}
      <AnimatePresence>
        {selectedId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-3xl"
            />

            <motion.div
              layoutId={`card-${selectedId._id || selectedId.id}`}
              transition={transition}
              className="relative w-full max-w-6xl bg-[#0F0F0F] rounded-[50px] border border-white/10 shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 z-50 h-fit"
            >
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedId(null); }}
                className="absolute top-8 right-8 z-[110] p-4 bg-white/5 text-white hover:bg-[#8b7355] rounded-full transition-all active:scale-90"
              >
                <X size={24} />
              </button>

              <div className="p-4">
                {renderPreviewPane(selectedId, 'modal')}
              </div>

              <div className="p-12 md:p-20 flex flex-col justify-center">
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={{ duration: 0.4 }}
                >
                  <motion.h2 layoutId={`title-${selectedId._id || selectedId.id}`} transition={transition} className="text-6xl font-black tracking-tighter mb-4 leading-none">
                    {selectedId.title || selectedId.name}
                  </motion.h2>

                  <motion.div layoutId={`price-${selectedId._id || selectedId.id}`} transition={transition} className="text-3xl font-light italic text-gray-500 mb-4">
                    {selectedId.category === 'exclusive' ? 'Live Auction' : selectedId.category === 'free' ? 'FREE' : `₹${selectedId.price || 'Price on request'}`}
                  </motion.div>

                  {/* Seller info */}
                  {selectedId.sellerId && (
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8b7355] to-[#5a4a38] flex items-center justify-center text-xs font-serif italic text-white">
                        {(selectedId.sellerId?.name || 'C')[0]?.toUpperCase()}
                      </div>
                      <p className="text-sm font-bold text-white/60">{selectedId.sellerId?.name || 'Creator'}</p>
                      {(selectedId.wishlistCount > 0) && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] text-white/20">
                          <Heart size={10} className="text-red-400 fill-red-400" /> {selectedId.wishlistCount} wishlisted
                        </span>
                      )}
                    </div>
                  )}

                  {/* Description preview */}
                  {selectedId.description && (
                    <p className="text-white/30 text-sm mb-8 leading-relaxed line-clamp-3">{selectedId.description}</p>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {checkingPurchase ? (
                      <div className="w-full py-5 flex items-center justify-center gap-2 text-white/30 text-sm">
                        <Loader2 size={16} className="animate-spin" /> Checking…
                      </div>
                    ) : purchased ? (
                      /* Already purchased — go to downloads */
                      <button
                        onClick={() => navigate(`/website/${selectedId._id || selectedId.id}`)}
                        className="w-full py-5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-[28px] font-bold text-sm uppercase tracking-[0.15em] flex items-center justify-center gap-2 hover:bg-emerald-500/20 transition-all active:scale-[0.98]"
                      >
                        <CheckCircle size={16} /> Purchased — View Downloads
                      </button>
                    ) : selectedId.category === 'exclusive' ? (
                      /* Exclusive → Bid (navigate to detail for full auction UI) */
                      <button
                        onClick={() => navigate(`/website/${selectedId._id || selectedId.id}`)}
                        className="w-full py-5 bg-orange-500 text-white rounded-[28px] font-bold text-sm uppercase tracking-[0.15em] flex items-center justify-center gap-2 hover:bg-orange-600 transition-all active:scale-[0.98]"
                      >
                        <Gavel size={16} /> Place a Bid
                      </button>
                    ) : (
                      /* Free / Paid → Buy directly */
                      <button
                        onClick={handleQuickPurchase}
                        disabled={buying}
                        className="w-full py-5 bg-white text-black rounded-[28px] font-black text-lg uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-[#8b7355] hover:text-white transition-all active:scale-[0.98] disabled:opacity-50"
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

                    {/* View Details (secondary) */}
                    {!purchased && (
                      <button
                        onClick={() => navigate(`/website/${selectedId._id || selectedId.id}`)}
                        className="w-full py-4 bg-white/5 border border-white/10 text-white/50 rounded-[28px] font-bold text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-2 hover:text-white hover:bg-white/10 transition-all"
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
