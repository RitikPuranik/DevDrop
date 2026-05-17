import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ExternalLink, Heart, ShoppingBag, Loader2, Eye, ChevronRight,
  Download, FileCode, FileText, Film, Lock, CheckCircle, Shield, Clock,
  ArrowLeft, Sparkles, Gavel, TrendingUp, Users, Timer
} from 'lucide-react';
import { websiteAPI } from '../api/website';
import { wishlistAPI } from '../api/wishlist';
import { buyerAPI } from '../api/buyer';
import { paymentAPI } from '../api/payment';
import { assetAPI } from '../api/asset';
import { auctionAPI } from '../api/auction';
import { toast } from 'sonner';

export default function WebsiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [website, setWebsite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wishlisted, setWishlisted] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [buying, setBuying] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [assets, setAssets] = useState(null);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Auction state
  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [bidAmount, setBidAmount] = useState('');
  const [placingBid, setPlacingBid] = useState(false);
  const [auctionLoading, setAuctionLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const isLoggedIn = !!localStorage.getItem('token');

  useEffect(() => { fetchWebsite(); }, [id]);

  // Auction timer
  useEffect(() => {
    const deadline = auction?.firstBidDeadline || auction?.paymentDeadline;
    if (!deadline) { setTimeLeft(auction ? 'Waiting for bids' : ''); return; }
    const tick = () => {
      const diff = new Date(deadline) - Date.now();
      if (diff <= 0) { setTimeLeft('Ended'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [auction]);

  const fetchWebsite = async () => {
    try {
      setLoading(true);
      const res = await websiteAPI.getById(id);
      const data = res.data?.data;
      setWebsite(data);
      setWishlisted(data?.isWishlisted || false);

      if (isLoggedIn) {
        try {
          const pr = await buyerAPI.checkPurchase(id);
          const has = pr.data?.data?.hasPurchased || false;
          setPurchased(has);
          if (has) fetchAssets();
        } catch {}
      }

      // Fetch auction for exclusive
      if (data?.category === 'exclusive') fetchAuction(data._id);
    } catch (err) {
      toast.error('Website not found');
      navigate('/template');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuction = async (websiteId) => {
    try {
      setAuctionLoading(true);
      const res = await auctionAPI.getByWebsite(websiteId);
      const data = res.data?.data;
      if (data?.auction) {
        setAuction(data.auction);
        setBids(data.bids || []);
        const minBid = data.minimumNextBid || data.auction.startingPrice || 0;
        setBidAmount(minBid.toString());
      }
    } catch {
      setAuction(null);
    } finally {
      setAuctionLoading(false);
    }
  };

  const fetchAssets = async () => {
    try {
      setLoadingAssets(true);
      const res = await assetAPI.getAssetUrls(id);
      setAssets(res.data?.data || null);
    } catch {
      setAssets(null);
    } finally {
      setLoadingAssets(false);
    }
  };

  const toggleWishlist = async () => {
    if (!isLoggedIn) { toast.error('Please login first'); return; }
    try {
      if (wishlisted) { await wishlistAPI.remove(id); toast.success('Removed'); }
      else { await wishlistAPI.add(id); toast.success('Added to wishlist'); }
      setWishlisted(!wishlisted);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handlePurchase = async () => {
    if (!isLoggedIn) { toast.error('Please login first'); return; }
    if (purchased) return;
    try {
      setBuying(true);
      if (website.category === 'free') {
        await buyerAPI.purchaseFree(id);
        toast.success('Website acquired!');
        setPurchased(true);
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3000);
        fetchAssets();
        return;
      }
      const orderRes = await paymentAPI.createOrder({ websiteId: id });
      const order = orderRes.data?.data;
      if (!window.Razorpay) { toast.error("Razorpay not loaded"); return; }
      const rzp = new window.Razorpay({
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount, currency: order.currency,
        name: 'DevDrop', description: `Purchase: ${website.name}`,
        order_id: order.id,
        handler: async (response) => {
          try {
            await paymentAPI.verifyPayment({ ...response, websiteId: id });
            toast.success('Payment successful!');
            setPurchased(true);
            setShowCelebration(true);
            setTimeout(() => setShowCelebration(false), 3000);
            fetchAssets();
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

  const handleBid = async () => {
    if (!isLoggedIn) { toast.error('Please login first'); return; }
    if (!auction) return;
    try {
      setPlacingBid(true);
      const res = await auctionAPI.placeBid(website._id, parseFloat(bidAmount));
      toast.success(res.data?.message || 'Bid placed!');
      fetchAuction(website._id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to place bid');
    } finally { setPlacingBid(false); }
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
  const allTech = [...(techStack.frontend||[]),...(techStack.backend||[]),...(techStack.database||[]),...(techStack.devops||[]),...(techStack.other||[])];
  const sellerName = website.sellerId?.name || 'Creator';
  const isExclusive = website.category === 'exclusive';

  return (
    <div className="min-h-screen bg-[#050505] text-[#e8e2d6] pt-24 pb-20 px-6 antialiased">
      {/* Celebration */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center">
            <motion.div initial={{scale:0}} animate={{scale:1}} exit={{scale:0}} transition={{type:"spring",bounce:0.5}}
              className="bg-[#111] border border-[#8b7355]/30 rounded-[40px] p-12 text-center shadow-2xl">
              <Sparkles size={48} className="text-[#8b7355] mx-auto mb-4" />
              <h2 className="text-3xl font-black tracking-tight mb-2">You got it!</h2>
              <p className="text-white/40 text-sm">Check below for your download links</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto">
        <motion.button initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} onClick={() => { window.scrollTo(0, 0); navigate('/template'); }}
          className="relative z-10 flex items-center gap-2 text-white/20 text-[10px] font-bold uppercase tracking-[0.2em] mb-8 hover:text-white transition-colors cursor-pointer">
          <ArrowLeft size={12} /> Back to Templates
        </motion.button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          {/* LEFT: Preview + Info */}
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="lg:col-span-3">
            <div className="aspect-video rounded-[32px] bg-[#111] border border-white/5 overflow-hidden relative group">
              {website.deployedUrl ? (
                <iframe src={website.deployedUrl} title={website.name} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Eye size={60} className="text-white/5" /></div>
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {website.deployedUrl && (
                  <a href={website.deployedUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-2xl font-bold text-xs uppercase tracking-widest">
                    <ExternalLink size={14} /> Open Live
                  </a>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="mt-8">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-4">About this Template</h3>
              <p className="text-white/50 leading-relaxed text-sm">{website.description}</p>
            </div>

            {/* Tech */}
            {allTech.length > 0 && (
              <div className="mt-8">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-4">Tech Stack</h3>
                <div className="flex flex-wrap gap-2">
                  {allTech.map((t, i) => (
                    <span key={i} className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[11px] font-bold tracking-wide text-white/60">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Download Center (post-purchase) */}
            <AnimatePresence>
              {purchased && (
                <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.2}} className="mt-10">
                  <div className="flex items-center gap-2 mb-6">
                    <CheckCircle size={14} className="text-emerald-400" />
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400">Download Center</h3>
                  </div>
                  {loadingAssets ? (
                    <div className="flex items-center gap-3 py-8"><Loader2 size={16} className="animate-spin text-white/30" /><span className="text-xs text-white/30">Loading...</span></div>
                  ) : assets ? (
                    <div className="space-y-3">
                      {assets.sourceCode?.url && (
                        <a href={assets.sourceCode.url} target="_blank" rel="noreferrer"
                          className="flex items-center justify-between px-6 py-5 bg-[#111] border border-white/5 rounded-2xl hover:border-emerald-500/20 transition-all group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center"><FileCode size={18} className="text-emerald-400" /></div>
                            <div><p className="text-sm font-bold">Source Code</p><p className="text-[10px] text-white/25 mt-0.5">{assets.sourceCode.fileName || 'source.zip'}</p></div>
                          </div>
                          <Download size={16} className="text-white/20 group-hover:text-emerald-400 transition-colors" />
                        </a>
                      )}
                      {assets.docs?.url && (
                        <a href={assets.docs.url} target="_blank" rel="noreferrer"
                          className="flex items-center justify-between px-6 py-5 bg-[#111] border border-white/5 rounded-2xl hover:border-blue-500/20 transition-all group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center"><FileText size={18} className="text-blue-400" /></div>
                            <div><p className="text-sm font-bold">Documentation</p><p className="text-[10px] text-white/25 mt-0.5">{assets.docs.fileName || 'docs.pdf'}</p></div>
                          </div>
                          <Download size={16} className="text-white/20 group-hover:text-blue-400 transition-colors" />
                        </a>
                      )}
                      {assets.video?.url && (
                        <a href={assets.video.url} target="_blank" rel="noreferrer"
                          className="flex items-center justify-between px-6 py-5 bg-[#111] border border-white/5 rounded-2xl hover:border-purple-500/20 transition-all group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center"><Film size={18} className="text-purple-400" /></div>
                            <div><p className="text-sm font-bold">Walkthrough Video</p><p className="text-[10px] text-white/25 mt-0.5">{assets.video.fileName || 'video.mp4'}</p></div>
                          </div>
                          <Download size={16} className="text-white/20 group-hover:text-purple-400 transition-colors" />
                        </a>
                      )}
                      <div className="flex items-start gap-3 pt-4">
                        <Clock size={12} className="text-white/15 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-white/15 leading-relaxed">Links expire in 7 days. Return anytime for fresh links.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#111] border border-white/5 rounded-2xl p-6 text-center">
                      <Shield size={24} className="text-white/10 mx-auto mb-3" />
                      <p className="text-sm text-white/30">Files not uploaded yet</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* RIGHT: Actions */}
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1}} className="lg:col-span-2">
            <div className="sticky top-28">
              {/* Category */}
              <div className="flex items-center gap-2 mb-4">
                {isExclusive && <Gavel size={14} className="text-orange-500" />}
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355]">{website.category} template</span>
              </div>

              <h1 className="text-4xl font-black tracking-tight mb-2">{website.name}</h1>

              <div className="flex items-center gap-4 text-white/20 text-xs mb-8">
                <span className="flex items-center gap-1"><Heart size={12} className="text-red-400 fill-red-400" /> {website.wishlistCount || 0} wishlisted</span>
              </div>

              {/* ═══ EXCLUSIVE AUCTION PANEL ═══ */}
              {isExclusive ? (
                <div className="bg-[#111] border border-orange-500/10 rounded-3xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-5">
                    <Gavel size={16} className="text-orange-400" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-orange-400">Live Auction</h3>
                  </div>

                  {auctionLoading ? (
                    <div className="py-6 flex justify-center"><Loader2 size={20} className="animate-spin text-white/30" /></div>
                  ) : auction ? (
                    <>
                      {/* Status */}
                      <div className="flex items-center gap-2 mb-4">
                        <span className={`w-2 h-2 rounded-full ${auction.status === 'active' ? 'bg-emerald-400 animate-pulse' : auction.status === 'first_bid_waiting' ? 'bg-orange-400 animate-pulse' : 'bg-red-400'}`} />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                          {auction.status === 'active' ? 'Waiting for first bid' :
                           auction.status === 'first_bid_waiting' ? 'Bidding active' :
                           auction.status === 'awaiting_payment' ? 'Winner must pay' : auction.status}
                        </span>
                      </div>

                      {/* Timer */}
                      <div className="flex items-center gap-3 bg-orange-500/5 border border-orange-500/10 rounded-2xl px-4 py-3 mb-4">
                        <Timer size={14} className="text-orange-400" />
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">
                            {auction.status === 'active' ? 'Status' : 'Time Remaining'}
                          </p>
                          <p className="text-lg font-black text-orange-400 tracking-tight">{timeLeft}</p>
                        </div>
                      </div>

                      {/* Current price */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">
                            {auction.currentBidAmount > 0 ? 'Current Bid' : 'Starting Price'}
                          </p>
                          <p className="text-3xl font-black tracking-tight">₹{auction.currentBidAmount || auction.startingPrice}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">Total Bids</p>
                          <p className="text-lg font-black">{auction.totalBids || 0}</p>
                        </div>
                      </div>

                      {/* Bid input */}
                      {timeLeft !== 'Ended' && auction.status !== 'awaiting_payment' && (
                        <div className="space-y-3">
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-bold">₹</span>
                            <input type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)}
                              placeholder="Enter bid amount"
                              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-8 pr-4 text-white font-bold outline-none focus:border-orange-500/30 transition-colors" />
                          </div>
                          <button onClick={handleBid} disabled={placingBid}
                            className="w-full py-4 bg-orange-500 text-white rounded-2xl font-bold text-xs uppercase tracking-[0.2em] hover:bg-orange-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50">
                            {placingBid ? <><Loader2 size={14} className="animate-spin" /> Placing...</> : <><Gavel size={14} /> Place Bid</>}
                          </button>
                          <p className="text-[9px] text-white/20 text-center">
                            Min: ₹{auction.currentBidAmount > 0 ? auction.currentBidAmount + (auction.minimumBidIncrement || 100) : auction.startingPrice}
                          </p>
                        </div>
                      )}

                      {/* Bid History */}
                      {bids.length > 0 && (
                        <div className="mt-5 pt-5 border-t border-white/5">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-3">Bid History</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {bids.map((bid, i) => (
                              <div key={i} className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${i === 0 ? 'bg-orange-500/5 border border-orange-500/10' : 'bg-white/[0.02]'}`}>
                                <span className="text-xs text-white/40">{i === 0 ? <><TrendingUp size={10} className="inline text-orange-400 mr-1" />Highest</> : `#${i + 1}`}</span>
                                <div className="flex items-center gap-3">
                                  <span className={`text-xs font-bold ${i === 0 ? 'text-orange-400' : 'text-white/40'}`}>₹{bid.bidAmount}</span>
                                  {bid.bidPlacedAt && <span className="text-[9px] text-white/15">{new Date(bid.bidPlacedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* How It Works */}
                      <div className="mt-5 pt-5 border-t border-white/5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-3">How It Works</p>
                        <div className="space-y-2">
                          {['Place a bid at or above the minimum price',
                            'After first bid, a 3-day waiting period starts',
                            'If outbid, the 3-day timer resets',
                            'If no one outbids within 3 days, highest bidder wins',
                            'Winner has 3 days to complete payment',
                            "If winner doesn't pay, template goes back to auction"
                          ].map((text, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-white/5 flex items-center justify-center text-[7px] font-bold text-white/30 shrink-0 mt-0.5">{i+1}</span>
                              <p className="text-[10px] text-white/25 leading-relaxed">{text}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {auction.attemptNumber > 1 && (
                        <div className="mt-4 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                          <p className="text-[9px] text-amber-400 font-bold">Re-auction #{auction.attemptNumber} — Previous winner did not pay</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-6 text-center">
                      <Gavel size={24} className="text-white/10 mx-auto mb-3" />
                      <p className="text-sm text-white/30">No active auction</p>
                      <p className="text-[10px] text-white/15 mt-1">Auction hasn't started yet</p>
                    </div>
                  )}
                </div>
              ) : (
                /* ═══ FREE / PAID PURCHASE PANEL ═══ */
                <div className="bg-[#111] border border-white/5 rounded-3xl p-4 mb-4">
                  <p className="text-3xl font-black tracking-tight mb-6">
                    {website.category === 'free' ? <span className="text-emerald-400">FREE</span> : <>₹{website.price}</>}
                  </p>
                  <button onClick={handlePurchase} disabled={purchased || buying}
                    className={`w-full py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                      purchased ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default' : 'bg-[#8b7355] text-white hover:bg-[#725e46]'
                    }`}>
                    {purchased ? <><CheckCircle size={14} /> Purchased</> :
                     buying ? <><Loader2 size={14} className="animate-spin" /> Processing...</> :
                     website.category === 'free' ? <><ShoppingBag size={14} /> Get for Free</> :
                     <><ShoppingBag size={14} /> Buy Now</>}
                  </button>
                </div>
              )}

              {/* Wishlist */}
              <button onClick={toggleWishlist}
                className="w-full mb-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl font-bold text-xs uppercase tracking-[0.15em] text-white/50 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                <Heart size={14} className={wishlisted ? 'fill-red-400 text-red-400' : ''} />
                {wishlisted ? 'Wishlisted' : 'Add to Wishlist'}
              </button>

              {/* Links */}
              <div className="space-y-2">
                {website.deployedUrl && (
                  <a href={website.deployedUrl} target="_blank" rel="noreferrer"
                    className="flex items-center justify-between px-5 py-3.5 bg-[#111] border border-white/5 rounded-2xl text-xs font-bold text-white/40 hover:text-white hover:border-white/15 transition-all group">
                    <span className="flex items-center gap-2"><ExternalLink size={14} /> Live Preview</span>
                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                )}
                {website.githubUrl && purchased ? (
                  <a href={website.githubUrl} target="_blank" rel="noreferrer"
                    className="flex items-center justify-between px-5 py-3.5 bg-[#111] border border-emerald-500/10 rounded-2xl text-xs font-bold text-emerald-400/60 hover:text-emerald-400 transition-all group">
                    <span className="flex items-center gap-2"><FileCode size={14} /> GitHub Repo</span>
                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ) : website.githubUrl ? (
                  <div className="flex items-center justify-between px-5 py-3.5 bg-[#111] border border-white/5 rounded-2xl text-xs font-bold text-white/15">
                    <span className="flex items-center gap-2"><Lock size={14} /> Source Code</span>
                    <span className="text-[9px] tracking-wide">After purchase</span>
                  </div>
                ) : null}
              </div>

              {/* Seller */}
              {website.sellerId && (
                <div className="mt-6 pt-6 border-t border-white/5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/20 mb-3">Created by</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8b7355] to-[#5a4a38] flex items-center justify-center text-sm font-serif italic text-white shadow-md">
                      {sellerName[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{sellerName}</p>
                      <p className="text-[10px] text-white/20">{website.sellerId.email}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-white/5 flex items-start gap-3">
                <Shield size={14} className="text-white/10 mt-0.5 shrink-0" />
                <p className="text-[10px] text-white/15 leading-relaxed">Secured with Razorpay. Instant delivery. All purchases final.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
