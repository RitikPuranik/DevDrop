import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Globe,
  Loader2,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';

import { adminAPI } from '../../../api/admin';

function StatCard({ label, value, sub, icon, accentColor = 'rgba(139,115,85,0.5)' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md hover:border-white/20 transition-all group"
    >
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
    </motion.div>
  );
}

function ActivityRow({ purchase }) {
  const websiteName = purchase.websiteId?.name || 'Unknown';
  const buyerEmail = purchase.buyerId?.email || 'Unknown buyer';
  const amount = purchase.totalPaid || 0;
  const date = purchase.purchaseDate
    ? new Date(purchase.purchaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.02] px-4 -mx-4 rounded-xl transition-colors gap-3">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0">
          <ShoppingCart size={16} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-white tracking-tight">{websiteName}</p>
          <p className="text-xs text-white/35 mt-0.5 break-all">{buyerEmail}</p>
        </div>
      </div>
      <div className="text-left sm:text-right sm:ml-auto">
        <p className="text-sm font-bold text-emerald-400">₹{amount.toLocaleString()}</p>
        <p className="text-[10px] text-white/30 mt-0.5">{date}</p>
      </div>
    </div>
  );
}

export default function DashboardSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const dashRes = await adminAPI.getDashboard();
        setData(dashRes.data?.data || null);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) {
    return (
      <div className="py-20 flex items-center justify-center text-white/30">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  const websites = data?.websites || {};
  const revenue = data?.revenue || {};
  const pendingPayouts = data?.pendingPayouts || {};
  const users = data?.users || {};
  const recentActivity = data?.recentActivity || [];

  const pendingCount = websites.pending_review || 0;
  const approvedCount = websites.approved || 0;
  const rejectedCount = websites.rejected || 0;
  const totalWebsites = Object.values(websites).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(139,115,85,0.28),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0.02))] p-6 md:p-10 backdrop-blur-2xl"
      >
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.25em] text-white/40 mb-5">
            <ShieldCheck size={12} /> Admin Dashboard
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-none mb-4">Platform Overview</h1>
          <p className="text-white/45 max-w-2xl leading-relaxed">
            Real-time stats for users, websites, revenue, and payouts across the DevDrop marketplace.
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard
          label="Total Users"
          value={users.total || 0}
          sub="Registered accounts"
          icon={<Users size={18} />}
          accentColor="rgba(99,102,241,0.5)"
        />
        <StatCard
          label="Approved Websites"
          value={approvedCount}
          sub={`${pendingCount} pending reviews`}
          icon={<Globe size={18} />}
          accentColor="rgba(139,115,85,0.5)"
        />
        <StatCard
          label="Platform Revenue"
          value={`₹${(revenue.platformFees || 0).toLocaleString()}`}
          sub={`${revenue.totalTransactions || 0} transactions`}
          icon={<TrendingUp size={18} />}
          accentColor="rgba(16,185,129,0.5)"
        />
        <StatCard
          label="Pending Payouts"
          value={`₹${(pendingPayouts.amount || 0).toLocaleString()}`}
          sub={`${pendingPayouts.count || 0} requests`}
          icon={<DollarSign size={18} />}
          accentColor="rgba(245,158,11,0.5)"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-6 md:p-8 shadow-2xl shadow-black/30"
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-2">Financials</p>
          <h2 className="text-2xl font-black tracking-tight mb-6">Revenue Breakdown</h2>

          <div className="space-y-4">
            {[
              { label: 'Gross Revenue', value: revenue.totalGrossRevenue, icon: <ArrowUpRight size={14} />, color: 'text-emerald-400' },
              { label: 'Platform Fees', value: revenue.platformFees, icon: <TrendingUp size={14} />, color: 'text-[#8b7355]' },
              { label: 'Tax Collected', value: revenue.taxCollected, icon: <DollarSign size={14} />, color: 'text-amber-400' },
              { label: 'Seller Payments', value: revenue.totalSellerPayments, icon: <ArrowDownRight size={14} />, color: 'text-blue-400' },
              { label: 'Net Profit', value: revenue.netProfit, icon: <TrendingUp size={14} />, color: 'text-emerald-400' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={item.color}>{item.icon}</span>
                  <span className="text-sm text-white/60">{item.label}</span>
                </div>
                <span className={`text-sm font-bold ${item.color}`}>₹{(item.value || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-6 md:p-8 shadow-2xl shadow-black/30"
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-2">Websites</p>
          <h2 className="text-2xl font-black tracking-tight mb-6">Status Breakdown</h2>

          <div className="space-y-3">
            {[
              { label: 'Pending Review', count: pendingCount, color: 'bg-amber-500' },
              { label: 'Approved', count: approvedCount, color: 'bg-emerald-500' },
              { label: 'Changes Requested', count: websites.changes_requested || 0, color: 'bg-blue-500' },
              { label: 'Rejected', count: rejectedCount, color: 'bg-red-500' },
            ].map((item) => {
              const pct = totalWebsites > 0 ? (item.count / totalWebsites) * 100 : 0;

              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/60">{item.label}</span>
                    <span className="text-sm font-bold text-white">{item.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${item.color} transition-all`} style={{ width: `${Math.max(pct, 1)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-6 md:p-8 shadow-2xl shadow-black/30"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-2">Activity</p>
            <h2 className="text-2xl font-black tracking-tight">Recent Purchases</h2>
          </div>
          <span className="text-xs text-white/30 uppercase tracking-[0.15em]">Last 10</span>
        </div>

        {recentActivity.length === 0 ? (
          <div className="py-12 text-center text-white/25 text-sm">No recent purchases yet.</div>
        ) : (
          <div>
            {recentActivity.map((purchase, index) => (
              <ActivityRow key={purchase._id || index} purchase={purchase} />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
