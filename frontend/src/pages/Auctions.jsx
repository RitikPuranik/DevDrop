import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Gavel, Clock, Flame, ArrowRight, Loader2, ExternalLink, Zap } from 'lucide-react';
import { auctionAPI } from '../api/auction';
import { toast } from 'sonner';

export default function Auctions() {
  const navigate = useNavigate();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);

  const isLoggedIn = !!localStorage.getItem('token');

  useEffect(() => {
    fetchAuctions();
  }, []);

  const fetchAuctions = async () => {
    try {
      setLoading(true);
      const res = await auctionAPI.getActive();
      setAuctions(res.data?.data || []);
    } catch {
      setAuctions([]);
    } finally {
      setLoading(false);
    }
  };

  const openBidModal = async (auction) => {
    try {
      const res = await auctionAPI.getByWebsite(auction.websiteId?._id || auction.websiteId);
      setSelectedAuction(res.data?.data);
      setBidAmount(res.data?.data?.minimumNextBid || '');
    } catch {
      toast.error('Failed to load auction details');
    }
  };

  const handleBid = async () => {
    if (!isLoggedIn) { toast.error('Please login first'); return; }
    if (!bidAmount || isNaN(bidAmount)) { toast.error('Enter a valid amount'); return; }

    try {
      setBidding(true);
      const websiteId = selectedAuction?.auction?.websiteId?._id || selectedAuction?.auction?.websiteId;
      const res = await auctionAPI.placeBid(websiteId, parseFloat(bidAmount));
      toast.success(res.data?.message || 'Bid placed!');
      setSelectedAuction(null);
      fetchAuctions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bid failed');
    } finally {
      setBidding(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#e8e2d6] pt-28 pb-20 px-6 antialiased">
      <div className="max-w-6xl mx-auto">

        {/* ── HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-14 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Zap size={14} className="text-orange-500 fill-orange-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-orange-500">Live Auctions</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight">
            Exclusive <span className="font-serif italic text-[#8b7355]">Drops</span>
          </h1>
          <p className="text-white/30 text-sm mt-4 max-w-md mx-auto">
            One-of-a-kind templates. First bid gets priority — outbid or lose.
          </p>
        </motion.div>

        {/* ── LOADING ── */}
        {loading && (
          <div className="flex flex-col items-center py-32 gap-4">
            <Loader2 className="animate-spin text-orange-500" size={40} />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500">Loading auctions</span>
          </div>
        )}

        {/* ── EMPTY ── */}
        {!loading && auctions.length === 0 && (
          <div className="flex flex-col items-center py-32 text-center">
            <Gavel size={50} className="text-white/5 mb-6" />
            <h3 className="text-xl font-bold tracking-tight mb-2">No active auctions</h3>
            <p className="text-white/30 text-sm max-w-xs">Check back soon for exclusive template drops.</p>
          </div>
        )}

        {/* ── AUCTION GRID ── */}
        {!loading && auctions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {auctions.map((auction, i) => {
              const website = auction.websiteId;
              return (
                <motion.div
                  key={auction._id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="bg-[#111] border border-white/5 rounded-[32px] p-5 hover:border-orange-500/20 transition-all group cursor-pointer"
                  onClick={() => openBidModal(auction)}
                >
                  {/* Preview */}
                  <div className="aspect-[4/3] rounded-[24px] bg-[#0a0a0a] border border-white/5 mb-5 overflow-hidden relative">
                    <div className="w-full h-full flex items-center justify-center">
                      <Gavel size={40} className="text-white/5 group-hover:text-orange-500/15 transition-colors" />
                    </div>
                    {/* Status badge */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-orange-500/90 text-white text-[9px] font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-full">
                      <Flame size={10} /> {auction.status === 'first_bid_waiting' ? 'Bid Active' : 'Open'}
                    </div>
                  </div>

                  {/* Info */}
                  <h3 className="font-bold text-lg tracking-tight mb-1">{website?.name || 'Exclusive Template'}</h3>
                  <p className="text-white/25 text-xs line-clamp-2 mb-4">{website?.description}</p>

                  {/* Bid info */}
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.2em] text-white/20 mb-0.5">
                        {auction.totalBids > 0 ? 'Current Bid' : 'Starting Price'}
                      </p>
                      <p className="text-xl font-black text-orange-500">
                        ₹{auction.currentBidAmount > 0 ? auction.currentBidAmount : auction.startingPrice}
                      </p>
                    </div>
                    <div className="text-right">
                      {auction.totalBids > 0 ? (
                        <div className="flex items-center gap-1 text-[10px] text-white/30">
                          <Clock size={10} />
                          <span>{auction.timeInfo}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">No bids yet</span>
                      )}
                      <p className="text-[9px] text-white/15 mt-1">{auction.totalBids} bid{auction.totalBids !== 1 ? 's' : ''} · {auction.uniqueBidders || 0} bidder{(auction.uniqueBidders || 0) !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── BID MODAL ── */}
      <AnimatePresence>
        {selectedAuction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAuction(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-[#111] border border-white/10 rounded-[40px] p-8 z-10"
            >
              <div className="flex items-center gap-2 text-orange-500 mb-6">
                <Gavel size={16} />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Place a Bid</span>
              </div>

              <h2 className="text-2xl font-black tracking-tight mb-2">
                {selectedAuction.auction?.websiteId?.name || 'Auction'}
              </h2>

              {selectedAuction.auction?.timeInfo && (
                <div className="flex items-center gap-2 text-white/30 text-xs mb-6">
                  <Clock size={12} />
                  <span>{selectedAuction.auction.timeInfo.message}</span>
                </div>
              )}

              {/* Current bid info */}
              <div className="bg-white/5 rounded-2xl p-5 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-white/20 mb-1">Current Bid</p>
                    <p className="text-2xl font-black text-orange-500">
                      ₹{selectedAuction.auction?.currentBidAmount || selectedAuction.auction?.startingPrice || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-white/20 mb-1">Minimum Bid</p>
                    <p className="text-2xl font-black">₹{selectedAuction.minimumNextBid || 0}</p>
                  </div>
                </div>
              </div>

              {/* Bid input */}
              <div className="relative mb-4">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 font-bold">₹</span>
                <input
                  type="number"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  min={selectedAuction.minimumNextBid}
                  placeholder={String(selectedAuction.minimumNextBid)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-5 py-4 text-xl font-black outline-none focus:border-orange-500/40 transition-colors"
                />
              </div>

              {/* Bid history */}
              {selectedAuction.bids?.length > 0 && (
                <div className="mb-6 max-h-32 overflow-y-auto">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-white/20 mb-2">Recent Bids</p>
                  {selectedAuction.bids.slice(0, 5).map((bid, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 text-xs border-b border-white/5">
                      <span className={`font-bold ${bid.status === 'winning' ? 'text-orange-500' : 'text-white/20'}`}>
                        ₹{bid.bidAmount}
                      </span>
                      <span className="text-white/15">{new Date(bid.bidPlacedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedAuction(null)}
                  className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl font-bold text-xs uppercase tracking-[0.15em] text-white/40 hover:text-white hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBid}
                  disabled={bidding}
                  className="flex-[2] py-4 bg-orange-500 text-white rounded-2xl font-bold text-xs uppercase tracking-[0.2em] hover:bg-orange-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {bidding ? (
                    <><Loader2 size={14} className="animate-spin" /> Bidding...</>
                  ) : (
                    <><Gavel size={14} /> Place Bid</>
                  )}
                </button>
              </div>

              {/* How it works */}
              <div className="mt-6 pt-4 border-t border-white/5">
                <p className="text-[9px] uppercase tracking-[0.2em] text-white/15 mb-2">How it works</p>
                <p className="text-[11px] text-white/20 leading-relaxed">
                  First bidder gets priority. After a bid, others have 72 hours to outbid. If no one does, you win. Winner must pay within 3 days.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
