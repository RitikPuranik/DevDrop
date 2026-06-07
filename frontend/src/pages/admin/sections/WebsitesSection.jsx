import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { adminAPI } from '../../../api/admin';

const STATUS_STYLES = {
  pending_review: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  changes_requested: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const STATUS_LABELS = {
  pending_review: 'Pending',
  changes_requested: 'Changes Req.',
  approved: 'Approved',
  rejected: 'Rejected',
};

const TABS = ['all', 'pending_review', 'changes_requested', 'approved', 'rejected'];

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] border ${STATUS_STYLES[status] || 'bg-white/5 text-white/40 border-white/10'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function FileTags({ files }) {
  if (!files || typeof files !== 'object') {
    return null;
  }

  const fileMeta = {
    sourceCode: { label: 'SRC', color: 'text-violet-400 bg-violet-500/15' },
    docs: { label: 'DOC', color: 'text-sky-400 bg-sky-500/15' },
    video: { label: 'VID', color: 'text-rose-400 bg-rose-500/15' },
    previewVideo: { label: 'PRV', color: 'text-teal-400 bg-teal-500/15' },
  };

  return (
    <div className="flex gap-1.5 flex-wrap">
      {Object.entries(files).filter(([, value]) => value).map(([key]) => (
        <span key={key} className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${fileMeta[key]?.color || 'text-white/40 bg-white/5'}`}>
          {fileMeta[key]?.label || key}
        </span>
      ))}
    </div>
  );
}

export default function WebsitesSection() {
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');

  const fetchWebsites = async () => {
    try {
      const res = await adminAPI.getAllWebsites('all');
      setWebsites(res.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load websites');
      setWebsites([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebsites();
  }, []);

  const filtered = websites
    .filter((website) => activeTab === 'all' || website.status === activeTab)
    .filter((website) => {
      if (!search) {
        return true;
      }

      const query = search.toLowerCase();
      return (
        website.name?.toLowerCase().includes(query) ||
        website.sellerId?.email?.toLowerCase().includes(query) ||
        website.sellerId?.name?.toLowerCase().includes(query)
      );
    });

  const counts = TABS.reduce((acc, tab) => {
    acc[tab] = tab === 'all' ? websites.length : websites.filter((website) => website.status === tab).length;
    return acc;
  }, {});

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
              <ShieldCheck size={12} /> Website Management
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-none mb-3">All Websites</h1>
            <p className="text-white/45 max-w-lg leading-relaxed text-sm">
              {counts.pending_review} pending · {counts.changes_requested} need changes · {counts.approved} approved
            </p>
          </div>
          <button
            onClick={fetchWebsites}
            className="w-full sm:w-auto flex justify-center items-center gap-2 px-5 py-3 rounded-2xl border border-white/10 text-xs text-white/50 hover:text-white hover:bg-white/5 font-bold uppercase tracking-[0.1em] transition-all"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </motion.div>

      <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] shadow-2xl shadow-black/30 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 px-4 pt-2 gap-4 pb-2 sm:pb-0">
          <div className="flex overflow-x-auto w-full custom-scrollbar">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3.5 text-xs font-bold uppercase tracking-[0.1em] border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-[#8b7355] text-[#8b7355]'
                    : 'border-transparent text-white/30 hover:text-white/60'
                }`}
              >
                {tab === 'all' ? 'All' : STATUS_LABELS[tab]}
                <span className="ml-1.5 opacity-50">({counts[tab]})</span>
              </button>
            ))}
          </div>
          <div className="relative my-2 w-full sm:w-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-4 py-2 text-sm bg-white/[0.03] border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b7355]/40 text-white placeholder:text-white/20 w-full sm:w-48"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Website', 'Seller', 'Category', 'Files', 'Status', 'Logs'].map((heading) => (
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
                      <Globe size={36} />
                      <span className="text-sm">No websites found</span>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((website) => (
                <tr key={website._id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-white tracking-tight">{website.name}</p>
                    <p className="text-xs text-white/30 mt-1 line-clamp-1">{website.description?.slice(0, 60)}...</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-sm text-white/70 font-medium">{website.sellerId?.name || '—'}</p>
                    <p className="text-xs text-white/30">{website.sellerId?.email || '—'}</p>
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em] ${
                        website.category === 'exclusive'
                          ? 'bg-purple-500/15 text-purple-400'
                          : website.category === 'paid'
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-emerald-500/15 text-emerald-400'
                      }`}
                    >
                      {website.category}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <FileTags files={website.files} />
                  </td>
                  <td className="px-6 py-5">
                    <StatusBadge status={website.status} />
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-xs text-white/50 max-w-[200px] whitespace-pre-wrap">{website.adminComment || '—'}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
