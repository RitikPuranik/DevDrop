import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { adminAPI } from "../../api/admin";
import { userAPI } from "../../api/user";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Search, RefreshCw, CheckCircle, X, Edit3, Trash2, Upload, Globe } from "lucide-react";
import AdminNav from "../../components/AdminNav";

const STATUS_STYLES = {
  pending_review: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  changes_requested: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};
const STATUS_LABELS = {
  pending_review: "Pending",
  changes_requested: "Changes Req.",
  approved: "Approved",
  rejected: "Rejected",
};

const TABS = ["all", "pending_review", "changes_requested", "approved", "rejected"];

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] border ${STATUS_STYLES[status] || "bg-white/5 text-white/40 border-white/10"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function FileTags({ files }) {
  if (!files || typeof files !== 'object') return null;
  const FILE_META = {
    sourceCode: { label: "SRC", color: "text-violet-400 bg-violet-500/15" },
    docs: { label: "DOC", color: "text-sky-400 bg-sky-500/15" },
    video: { label: "VID", color: "text-rose-400 bg-rose-500/15" },
    previewVideo: { label: "PRV", color: "text-teal-400 bg-teal-500/15" },
  };
  return (
    <div className="flex gap-1.5 flex-wrap">
      {Object.entries(files).filter(([, v]) => v).map(([k]) => (
        <span key={k} className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${FILE_META[k]?.color || "text-white/40 bg-white/5"}`}>
          {FILE_META[k]?.label || k}
        </span>
      ))}
    </div>
  );
}

// ─── Approve Modal ───────────────────────────────────────────────────────────
function ApproveModal({ open, website, onClose, onSubmit, loading }) {
  const [files, setFiles] = useState({ sourceCode: null, docs: null, video: null, previewVideo: null });
  const refs = { sourceCode: useRef(), docs: useRef(), video: useRef(), previewVideo: useRef() };

  const handleFile = (field) => (e) => setFiles((p) => ({ ...p, [field]: e.target.files[0] || null }));
  const clearFile = (field) => { setFiles((p) => ({ ...p, [field]: null })); if (refs[field].current) refs[field].current.value = ""; };

  const handleSubmit = () => {
    const fd = new FormData();
    Object.entries(files).forEach(([k, v]) => { if (v) fd.append(k, v); });
    onSubmit(fd);
  };

  if (!open || !website) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#141414] rounded-[28px] border border-white/10 shadow-2xl w-full max-w-lg mx-4 p-7">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-black tracking-tight text-white">Approve website</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors"><X size={20} /></button>
        </div>
        <p className="text-sm text-white/40 mb-6">
          Approving <span className="font-bold text-white">{website?.name}</span>. Attach delivery files.
        </p>

        <div className="flex flex-col gap-4">
          {Object.keys(files).map((field) => {
            const labels = { sourceCode: "Source Code ZIP", docs: "Documentation PDF", video: "Demo Video", previewVideo: "Preview Video" };
            const isRequired = field === "sourceCode" || field === "docs";
            return (
              <div key={field}>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2 block">
                  {labels[field]} {isRequired && <span className="text-red-400">*</span>}
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex-1 flex items-center gap-3 px-4 py-3 border border-dashed border-white/15 rounded-2xl cursor-pointer hover:border-[#8b7355]/60 hover:bg-white/[0.02] transition-colors">
                    <Upload size={14} className="text-white/30" />
                    <span className="text-sm text-white/40 truncate">{files[field] ? files[field].name : "Choose file…"}</span>
                    <input ref={refs[field]} type="file" className="hidden" onChange={handleFile(field)} />
                  </label>
                  {files[field] && (
                    <button onClick={() => clearFile(field)} className="text-white/30 hover:text-red-400 transition-colors"><X size={16} /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 justify-end mt-7">
          <button onClick={onClose} className="px-5 py-2.5 text-xs rounded-xl border border-white/10 text-white/50 hover:bg-white/5 transition-colors font-bold uppercase tracking-[0.1em]">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading} className="px-5 py-2.5 text-xs rounded-xl bg-emerald-500 text-black font-black uppercase tracking-[0.1em] hover:bg-emerald-400 transition-colors disabled:opacity-60">
            {loading ? "Approving…" : "✓ Approve"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Request Changes Modal ───────────────────────────────────────────────────
function RequestChangesModal({ open, website, onClose, onSubmit, loading }) {
  const [comment, setComment] = useState("");
  if (!open || !website) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#141414] rounded-[28px] border border-white/10 shadow-2xl w-full max-w-md mx-4 p-7">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black tracking-tight text-white">Request changes</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors"><X size={20} /></button>
        </div>
        <p className="text-sm text-white/40 mb-5">
          Describe what needs to change for <span className="font-bold text-white">{website.name}</span>
        </p>
        <textarea
          className="w-full border border-white/10 bg-white/[0.03] rounded-2xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-[#8b7355]/50 focus:border-transparent placeholder:text-white/20"
          rows={5}
          placeholder="e.g. Missing privacy policy page, broken links..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="px-5 py-2.5 text-xs rounded-xl border border-white/10 text-white/50 hover:bg-white/5 transition-colors font-bold uppercase tracking-[0.1em]">Cancel</button>
          <button
            onClick={() => onSubmit(comment)}
            disabled={loading || !comment.trim()}
            className="px-5 py-2.5 text-xs rounded-xl bg-blue-500 text-white font-black uppercase tracking-[0.1em] hover:bg-blue-400 transition-colors disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send request"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Confirm Modal ───────────────────────────────────────────────────────────
function ConfirmModal({ open, title, description, confirmLabel, confirmColor, onConfirm, onCancel, loading }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#141414] rounded-[28px] border border-white/10 shadow-2xl w-full max-w-sm mx-4 p-7">
        <h3 className="text-lg font-black tracking-tight text-white mb-2">{title}</h3>
        <p className="text-sm text-white/40 mb-6">{description}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-5 py-2.5 text-xs rounded-xl border border-white/10 text-white/50 hover:bg-white/5 transition-colors font-bold uppercase tracking-[0.1em]">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className={`px-5 py-2.5 text-xs rounded-xl text-white font-black uppercase tracking-[0.1em] transition-colors disabled:opacity-60 ${confirmColor}`}>
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function PendingWebsites() {
  const navigate = useNavigate();
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [approveTarget, setApproveTarget] = useState(null);
  const [changesTarget, setChangesTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Auth + Fetch ─────────────────────────────────────────────────────────
  const fetchWebsites = async () => {
    try {
      const res = await adminAPI.getAllWebsites('all');
      setWebsites(res.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load websites");
      setWebsites([]);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const profileRes = await userAPI.getProfile();
        const role = profileRes.data?.data?.user?.role;
        setIsAdmin(role === "admin");
        if (role === "admin") await fetchWebsites();
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleApprove = async (formData) => {
    setActionLoading(true);
    try {
      await adminAPI.approveWebsite(approveTarget._id, formData);
      toast.success(`✓ ${approveTarget.name} approved`);
      setApproveTarget(null);
      await fetchWebsites();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to approve website");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestChanges = async (comment) => {
    setActionLoading(true);
    try {
      await adminAPI.requestChanges(changesTarget._id, { comment });
      toast.success(`✎ Changes requested for ${changesTarget.name}`);
      setChangesTarget(null);
      await fetchWebsites();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send change request");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      await adminAPI.rejectWebsite(rejectTarget._id, { reason: "Rejected by admin" });
      toast.success(`✕ ${rejectTarget.name} rejected`);
      setRejectTarget(null);
      await fetchWebsites();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to reject website");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await adminAPI.deleteWebsite(deleteTarget._id);
      toast.success(`🗑 ${deleteTarget.name} deleted`);
      setDeleteTarget(null);
      await fetchWebsites();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete website");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = websites
    .filter((w) => activeTab === "all" || w.status === activeTab)
    .filter((w) =>
      !search ||
      w.name?.toLowerCase().includes(search.toLowerCase()) ||
      w.sellerId?.email?.toLowerCase().includes(search.toLowerCase()) ||
      w.sellerId?.name?.toLowerCase().includes(search.toLowerCase())
    );

  const counts = TABS.reduce((acc, t) => {
    acc[t] = t === "all" ? websites.length : websites.filter((w) => w.status === t).length;
    return acc;
  }, {});
  // ── Loading / Auth Guard ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center text-white">
        <Loader2 className="animate-spin text-[#8b7355]" size={36} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#080808] text-white flex items-center justify-center px-6">
        <div className="max-w-lg w-full rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-2xl">
          <ShieldCheck className="mx-auto mb-5 text-[#8b7355]" size={44} />
          <h1 className="text-3xl font-black tracking-tight mb-3">Admin access required</h1>
          <p className="text-white/40 text-sm leading-relaxed mb-8">Sign in with an admin account.</p>
          <button onClick={() => navigate("/")} className="px-6 py-3 rounded-full bg-[#8b7355] text-white font-bold uppercase tracking-[0.15em] text-xs">Back Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white pt-24 md:pt-32 pb-16 px-4 md:px-6">
      <div className="max-w-6xl mx-auto space-y-8">

        <AdminNav />

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(139,115,85,0.28),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0.02))] p-6 md:p-10 backdrop-blur-2xl">
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
            <button onClick={fetchWebsites} className="w-full sm:w-auto flex justify-center items-center gap-2 px-5 py-3 rounded-2xl border border-white/10 text-xs text-white/50 hover:text-white hover:bg-white/5 font-bold uppercase tracking-[0.1em] transition-all">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </motion.div>

        {/* Table Card */}
        <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] shadow-2xl shadow-black/30 overflow-hidden">
          {/* Tabs + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 px-4 pt-2 gap-4 pb-2 sm:pb-0">
            <div className="flex overflow-x-auto w-full custom-scrollbar">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3.5 text-xs font-bold uppercase tracking-[0.1em] border-b-2 transition-all whitespace-nowrap ${
                    activeTab === tab
                      ? "border-[#8b7355] text-[#8b7355]"
                      : "border-transparent text-white/30 hover:text-white/60"
                  }`}
                >
                  {tab === "all" ? "All" : STATUS_LABELS[tab]}
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

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["Website", "Seller", "Category", "Files", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left text-[10px] font-bold text-white/25 uppercase tracking-[0.2em] px-6 py-4">{h}</th>
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
                {filtered.map((w) => (
                  <tr key={w._id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-white tracking-tight">{w.name}</p>
                      <p className="text-xs text-white/30 mt-1 line-clamp-1">{w.description?.slice(0, 60)}...</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm text-white/70 font-medium">{w.sellerId?.name || "—"}</p>
                      <p className="text-xs text-white/30">{w.sellerId?.email || "—"}</p>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em] ${
                        w.category === 'exclusive' ? 'bg-purple-500/15 text-purple-400' :
                        w.category === 'paid' ? 'bg-amber-500/15 text-amber-400' :
                        'bg-emerald-500/15 text-emerald-400'
                      }`}>{w.category}</span>
                    </td>
                    <td className="px-6 py-5"><FileTags files={w.files} /></td>
                    <td className="px-6 py-5"><StatusBadge status={w.status} /></td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-1.5">
                        <button
                          title="Approve"
                          onClick={() => setApproveTarget(w)}
                          className="w-8 h-8 rounded-xl border border-white/10 text-white/30 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30 transition-all flex items-center justify-center"
                        ><CheckCircle size={14} /></button>
                        <button
                          title="Request changes"
                          onClick={() => setChangesTarget(w)}
                          className="w-8 h-8 rounded-xl border border-white/10 text-white/30 hover:bg-blue-500/20 hover:text-blue-400 hover:border-blue-500/30 transition-all flex items-center justify-center"
                        ><Edit3 size={14} /></button>
                        <button
                          title="Reject"
                          onClick={() => setRejectTarget(w)}
                          className="w-8 h-8 rounded-xl border border-white/10 text-white/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center justify-center"
                        ><X size={14} /></button>
                        <button
                          title="Delete"
                          onClick={() => setDeleteTarget(w)}
                          className="w-8 h-8 rounded-xl border border-white/10 text-white/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center justify-center"
                        ><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ApproveModal open={!!approveTarget} website={approveTarget} onClose={() => setApproveTarget(null)} onSubmit={handleApprove} loading={actionLoading} />
      <RequestChangesModal open={!!changesTarget} website={changesTarget} onClose={() => setChangesTarget(null)} onSubmit={handleRequestChanges} loading={actionLoading} />
      <ConfirmModal
        open={!!rejectTarget}
        title="Reject website"
        description={`Are you sure you want to reject "${rejectTarget?.name}"? The seller will be notified.`}
        confirmLabel="Reject"
        confirmColor="bg-red-500 hover:bg-red-400"
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
        loading={actionLoading}
      />
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete website"
        description={`Permanently delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="bg-red-500 hover:bg-red-400"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={actionLoading}
      />
    </div>
  );
}

export {PendingWebsites};
