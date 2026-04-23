import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { ExternalLink, Heart, ShoppingBag, ArrowLeft, Loader2, Eye, Github, Zap, Clock, ChevronRight } from 'lucide-react';
import { websiteAPI } from '../api/website';
import { wishlistAPI } from '../api/wishlist';
import { buyerAPI } from '../api/buyer';
import { paymentAPI } from '../api/payment';
import { toast } from 'sonner';

export default function WebsiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [website, setWebsite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wishlisted, setWishlisted] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [buying, setBuying] = useState(false);

  const isLoggedIn = !!localStorage.getItem('token');

  useEffect(() => {
    fetchWebsite();
  }, [id]);

  const fetchWebsite = async () => {
    try {
      setLoading(true);
      const res = await websiteAPI.getById(id);
      const data = res.data?.data;
      setWebsite(data);
      setWishlisted(data?.isWishlisted || false);

      if (isLoggedIn) {
        try {
          const purchaseRes = await buyerAPI.checkPurchase(id);
          setPurchased(purchaseRes.data?.data?.hasPurchased || false);
        } catch {}
      }
    } catch (err) {
      toast.error('Website not found');
      navigate('/template');
    } finally {
      setLoading(false);
    }
  };

  const toggleWishlist = async () => {
    if (!isLoggedIn) { toast.error('Please login first'); return; }
    try {
      if (wishlisted) {
        await wishlistAPI.remove(id);
        toast.success('Removed from wishlist');
      } else {
        await wishlistAPI.add(id);
        toast.success('Added to wishlist');
      }
      setWishlisted(!wishlisted);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const handlePurchase = async () => {
    if (!isLoggedIn) { toast.error('Please login first'); return; }
    if (purchased) { toast.info('Already purchased!'); return; }

    try {
      setBuying(true);
      if (website.category === 'free') {
        await buyerAPI.purchaseFree(id);
        toast.success('Website acquired successfully!');
        setPurchased(true);
      } else {
        // Paid flow — create Razorpay order
        const orderRes = await paymentAPI.createOrder({ websiteId: id });
        const order = orderRes.data?.data;

        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: 'DevDrop',
          description: `Purchase: ${website.name}`,
          order_id: order.id,
          handler: async (response) => {
            try {
              await paymentAPI.verifyPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                websiteId: id,
              });
              toast.success('Payment successful! Website purchased.');
              setPurchased(true);
            } catch {
              toast.error('Payment verification failed');
            }
          },
          prefill: { email: '' },
          theme: { color: '#8b7355' },
        };

        const razorpay = new window.Razorpay(options);
        razorpay.open();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Purchase failed');
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#8b7355]" size={40} />
      </div>
    );
  }

  if (!website) return null;

  const techStack = website.techStack || {};
  const allTech = [
    ...(techStack.frontend || []),
    ...(techStack.backend || []),
    ...(techStack.database || []),
    ...(techStack.devops || []),
    ...(techStack.other || []),
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-[#e8e2d6] pt-24 pb-20 px-6 antialiased">
      <div className="max-w-6xl mx-auto">

        {/* ── BACK ── */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate('/template')}
          className="flex items-center gap-2 text-white/30 hover:text-white text-xs font-bold uppercase tracking-[0.2em] mb-10 transition-colors"
        >
          <ArrowLeft size={14} /> Back to gallery
        </motion.button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">

          {/* ── LEFT: PREVIEW ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-3"
          >
            {/* Preview card */}
            <div className="aspect-video rounded-[32px] bg-[#111] border border-white/5 overflow-hidden relative group">
              {website.deployedUrl ? (
                <iframe
                  src={website.deployedUrl}
                  title={website.name}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Eye size={60} className="text-white/5" />
                </div>
              )}
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <a href={website.deployedUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[#e8e2d6] transition-colors"
                >
                  <ExternalLink size={14} /> Open Live
                </a>
              </div>
            </div>

            {/* ── Description Section ── */}
            <div className="mt-8">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-4">About this Template</h3>
              <p className="text-white/50 leading-relaxed text-sm">{website.description}</p>
            </div>

            {/* ── Tech Stack ── */}
            {allTech.length > 0 && (
              <div className="mt-8">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-4">Tech Stack</h3>
                <div className="flex flex-wrap gap-2">
                  {allTech.map((tech, i) => (
                    <span key={i} className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[11px] font-bold tracking-wide text-white/60">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* ── RIGHT: INFO + ACTIONS ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2"
          >
            <div className="sticky top-28">
              {/* Category badge */}
              <div className="flex items-center gap-2 mb-4">
                {website.category === 'exclusive' && <Zap size={14} className="text-orange-500 fill-orange-500" />}
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355]">
                  {website.category} template
                </span>
              </div>

              {/* Title */}
              <h1 className="text-4xl font-black tracking-tight mb-2">{website.name}</h1>

              {/* Stats line */}
              <div className="flex items-center gap-4 text-white/20 text-xs mb-8">
                <span className="flex items-center gap-1"><Eye size={12} /> {website.viewCount || 0} views</span>
                <span className="flex items-center gap-1"><Heart size={12} /> {website.wishlistCount || 0}</span>
              </div>

              {/* Price card */}
              <div className="bg-[#111] border border-white/5 rounded-3xl p-8 mb-4">
                <p className="text-4xl font-black tracking-tight mb-6">
                  {website.category === 'free' ? (
                    <span className="text-emerald-400">FREE</span>
                  ) : (
                    <>₹{website.price}</>
                  )}
                </p>

                {/* Purchase button */}
                <button
                  onClick={handlePurchase}
                  disabled={purchased || buying}
                  className={`w-full py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                    purchased
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                      : 'bg-[#8b7355] text-white hover:bg-[#725e46]'
                  }`}
                >
                  {purchased ? (
                    <><ShoppingBag size={14} /> Purchased</>
                  ) : buying ? (
                    <><Loader2 size={14} className="animate-spin" /> Processing...</>
                  ) : website.category === 'free' ? (
                    <><ShoppingBag size={14} /> Get for Free</>
                  ) : (
                    <><ShoppingBag size={14} /> Buy Now</>
                  )}
                </button>

                {/* Wishlist button */}
                <button
                  onClick={toggleWishlist}
                  className="w-full mt-3 py-3.5 bg-white/5 border border-white/10 rounded-2xl font-bold text-xs uppercase tracking-[0.15em] text-white/50 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <Heart size={14} className={wishlisted ? 'fill-red-400 text-red-400' : ''} />
                  {wishlisted ? 'Wishlisted' : 'Add to Wishlist'}
                </button>
              </div>

              {/* Links */}
              <div className="space-y-2">
                {website.deployedUrl && (
                  <a href={website.deployedUrl} target="_blank" rel="noreferrer"
                    className="flex items-center justify-between px-5 py-3.5 bg-[#111] border border-white/5 rounded-2xl text-xs font-bold text-white/40 hover:text-white hover:border-white/15 transition-all group"
                  >
                    <span className="flex items-center gap-2"><ExternalLink size={14} /> Live Preview</span>
                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                )}
                {website.githubUrl && (
                  <a href={website.githubUrl} target="_blank" rel="noreferrer"
                    className="flex items-center justify-between px-5 py-3.5 bg-[#111] border border-white/5 rounded-2xl text-xs font-bold text-white/40 hover:text-white hover:border-white/15 transition-all group"
                  >
                    <span className="flex items-center gap-2"><Github size={14} /> GitHub Repo</span>
                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                )}
              </div>

              {/* Seller info */}
              {website.sellerId && (
                <div className="mt-6 pt-6 border-t border-white/5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/20 mb-2">Sold by</p>
                  <p className="text-sm font-bold text-white/50">{website.sellerId.email || 'Seller'}</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
