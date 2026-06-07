import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, DollarSign, Loader2, RefreshCw, Search, ShieldCheck, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';

import { adminAPI } from '../../../api/admin';

function StatCard({ label, value, sub, icon, accentColor = 'rgba(139,115,85,0.5)' }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md hover:border-white/20 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-bold">{label}</p>
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-white/60 group-hover:text-white transition-colors"
          style={{ background: `linear-gradient(135deg, ${accentColor}, transparent)` }}
        >
          {icon}
        </div>
      </div>
      <p className="text-3xl font-black tracking-tight text-white mb-1">{value}</p>
      {sub && <p className="text-xs text-white/35">{sub}</p>}
    </div>
  );
}

function ProcessModal({ open, payout, onClose, onConfirm, loading }) {
  const [utr, setUtr] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    if (!open) {
      setUtr('');
      setAdminNotes('');
    }
  }, [open]);

  if (!open || !payout) {
    return null;
  }

  const sellerEmail = payout.sellerId?.email || 'Unknown';
  const websiteName = payout.websiteId?.name || 'Unknown';

  const handleSubmit = () => {
    if (!utr.trim()) {
      toast.error('UTR (transaction reference) is required');
      return;
    }

    onConfirm({ utr: utr.trim(), adminNotes: adminNotes.trim() });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#141414] rounded-[28px] border border-white/10 shadow-2xl w-full max-w-md mx-4 p-7"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-black tracking-tight text-white">Process Payout</h3>
            <p className="text-xs text-white/35 mt-1">Confirm before marking as processed</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">{sellerEmail}</p>
              <p className="text-xs text-white/35 mt-1">Website: {websiteName}</p>
              {payout.bankDetails?.bankName && (
                <p className="text-xs text-white/35 mt-0.5">Bank: {payout.bankDetails.bankName}</p>
              )}
              {payout.bankDetails?.upiId && (
                <p className="text-xs text-white/35 mt-0.5">UPI: {payout.bankDetails.upiId}</p>
              )}
            </div>
            <p className="text-3xl font-black text-emerald-400">₹{(payout.amount || 0).toLocaleString()}</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">
              UTR / Transaction Reference <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. TXN-20260526-001"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              className="w-full border border-white/10 bg-white/[0.03] rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder:text-white/20"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Admin Notes (optional)</label>
            <textarea
              rows={3}
              placeholder="Internal notes..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full border border-white/10 bg-white/[0.03] rounded-2xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder:text-white/20"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-xs rounded-xl border border-white/10 text-white/50 hover:bg-white/5 transition-colors font-bold uppercase tracking-[0.1em]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2.5 text-xs rounded-xl bg-emerald-500 text-black font-black uppercase tracking-[0.1em] hover:bg-emerald-400 transition-colors disabled:opacity-60"
          >
            {loading ? 'Processing…' : 'Confirm and Process'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function PayoutsSection() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [processTarget, setProcessTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [sortBy, setSortBy] = useState('date');

  const fetchPayouts = async () => {
    try {
      const res = await adminAPI.getPendingPayouts();
      setPayouts(res.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load payouts');
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
  }, []);

  const handleProcess = async ({ utr, adminNotes }) => {
    setActionLoading(true);
    try {
      await adminAPI.processPayout(processTarget._id, { utr, adminNotes });
      toast.success(`₹${processTarget.amount.toLocaleString()} payout processed`);
      setProcessTarget(null);
      await fetchPayouts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to process payout');
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = payouts
    .filter((payout) => {
      if (!search) {
        return true;
      }

      const query = search.toLowerCase();
      return (
        payout.sellerId?.email?.toLowerCase().includes(query) ||
        payout.websiteId?.name?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => (sortBy === 'amount' ? (b.amount || 0) - (a.amount || 0) : 0));

  const total = payouts.reduce((sum, payout) => sum + (payout.amount || 0), 0);
  const highest = payouts.reduce((max, payout) => Math.max(max, payout.amount || 0), 0);
  const avgAmount = payouts.length ? Math.round(total / payouts.length) : 0;

  if (loading) {
    return (
      <div className="py-20 flex items-center justify-center text-white/30">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(139,115,85,0.28),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0.02))] p-6 md:p-10 backdrop-blur-2xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.25em] text-white/40 mb-5">
              <ShieldCheck size={12} /> Payout Management
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-none mb-3">Pending Payouts</h1>
            <p className="text-white/45 max-w-lg leading-relaxed text-sm">{payouts.length} payout requests waiting to be processed</p>
          </div>
          <button
            onClick={fetchPayouts}
            className="w-full sm:w-auto flex justify-center items-center gap-2 px-5 py-3 rounded-2xl border border-white/10 text-xs text-white/50 hover:text-white hover:bg-white/5 font-bold uppercase tracking-[0.1em] transition-all"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <StatCard label="Total Pending" value={`₹${total.toLocaleString()}`} sub={`${payouts.length} requests`} icon={<DollarSign size={18} />} accentColor="rgba(16,185,129,0.5)" />
        <StatCard label="Largest Request" value={`₹${highest.toLocaleString()}`} sub="Single payout" icon={<ArrowUpRight size={18} />} accentColor="rgba(245,158,11,0.5)" />
        <StatCard label="Average Amount" value={`₹${avgAmount.toLocaleString()}`} sub="Per request" icon={<TrendingUp size={18} />} accentColor="rgba(99,102,241,0.5)" />
      </div>

      <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] shadow-2xl shadow-black/30 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 border-b border-white/5 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-1">Queue</p>
            <h2 className="text-xl font-black tracking-tight">Payout Requests</h2>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-4 py-2 text-sm bg-white/[0.03] border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b7355]/40 text-white placeholder:text-white/20 w-full sm:w-44"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white/50 focus:outline-none focus:ring-2 focus:ring-[#8b7355]/40 w-full sm:w-auto"
            >
              <option value="date" className="bg-black">Sort: Date</option>
              <option value="amount" className="bg-black">Sort: Amount</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Seller', 'Website', 'Bank Details', 'Amount', 'Requested', 'Action'].map((heading) => (
                  <th key={heading} className="text-left text-[10px] font-bold text-white/25 uppercase tracking-[0.2em] px-6 py-4">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3 text-white/20">
                      <DollarSign size={36} />
                      <span className="text-sm">No pending payouts - all clear!</span>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((payout) => {
                const sellerEmail = payout.sellerId?.email || 'Unknown';
                const websiteName = payout.websiteId?.name || '—';
                const websiteCategory = payout.websiteId?.category || '';
                const bankInfo = payout.bankDetails?.bankName || payout.bankDetails?.upiId || '—';
                const accountInfo = payout.bankDetails?.accountNumber
                  ? `****${payout.bankDetails.accountNumber.slice(-4)}`
                  : payout.bankDetails?.upiId || '—';
                const requestedDate = payout.createdAt
                  ? new Date(payout.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—';

                return (
                  <tr key={payout._id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-white">{sellerEmail}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm text-white/70">{websiteName}</p>
                      {websiteCategory && (
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-[0.15em] ${
                            websiteCategory === 'exclusive'
                              ? 'bg-purple-500/15 text-purple-400'
                              : websiteCategory === 'paid'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-emerald-500/15 text-emerald-400'
                          }`}
                        >
                          {websiteCategory}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm text-white/60">{bankInfo}</p>
                      <p className="text-xs text-white/30 mt-0.5">{accountInfo}</p>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-lg font-black text-emerald-400">₹{(payout.amount || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-5 text-sm text-white/40 whitespace-nowrap">{requestedDate}</td>
                    <td className="px-6 py-5">
                      <button
                        onClick={() => setProcessTarget(payout)}
                        className="flex items-center gap-2 text-xs font-black px-5 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all uppercase tracking-[0.1em] whitespace-nowrap"
                      >
                        Process
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ProcessModal
        open={!!processTarget}
        payout={processTarget}
        onClose={() => setProcessTarget(null)}
        onConfirm={handleProcess}
        loading={actionLoading}
      />
    </div>
  );
}
