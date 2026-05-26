import { useState, useEffect, useRef } from "react";

const API_BASE = "/api/admin";

// ─── Auth token helper (adjust to your auth setup) ───────────────────────────
const getToken = () => localStorage.getItem("adminToken") || "";

const apiFetch = (url, options = {}) =>
  fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  pending:  "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  changes:  "bg-blue-100  text-blue-700  ring-1 ring-blue-200",
  approved: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  rejected: "bg-red-100   text-red-700   ring-1 ring-red-200",
};
const STATUS_LABELS = {
  pending:  "Pending",
  changes:  "Changes req.",
  approved: "Approved",
  rejected: "Rejected",
};
const FILE_META = {
  sourceCode:   { label: "Source", cls: "bg-violet-100 text-violet-700" },
  docs:         { label: "Docs",   cls: "bg-sky-100    text-sky-700" },
  video:        { label: "Video",  cls: "bg-rose-100   text-rose-700" },
  previewVideo: { label: "Preview",cls: "bg-teal-100   text-teal-700" },
};
const TABS = ["all", "pending", "changes", "approved", "rejected"];

// ─── Reusable UI ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function Avatar({ initials, color = "indigo" }) {
  const colors = {
    indigo: "bg-indigo-100 text-indigo-700",
    teal:   "bg-teal-100   text-teal-700",
    rose:   "bg-rose-100   text-rose-700",
    amber:  "bg-amber-100  text-amber-700",
  };
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${colors[color] || colors.indigo}`}>
      {initials}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

function Toast({ toasts, remove }) {
  const colors = {
    success: "bg-emerald-600",
    error:   "bg-red-500",
    info:    "bg-indigo-600",
    warning: "bg-amber-500",
  };
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg animate-fade-in ${colors[t.type]}`}>
          <span>{t.message}</span>
          <button onClick={() => remove(t.id)} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = (message, type = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  };
  const remove = (id) => setToasts((p) => p.filter((t) => t.id !== id));
  return { toasts, show, remove };
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({ open, title, description, confirmLabel, confirmClass, onConfirm, onCancel, loading }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-6">{description}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm rounded-lg text-white font-medium transition-colors disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Request Changes Modal ────────────────────────────────────────────────────
function RequestChangesModal({ open, website, onClose, onSubmit, loading }) {
  const [notes, setNotes] = useState("");
  if (!open || !website) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">Request changes</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Describe what needs to be changed for <span className="font-medium text-slate-700">{website.name}</span>
        </p>
        <textarea
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
          rows={5}
          placeholder="e.g. Missing privacy policy page, broken links on contact form…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-3 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(notes)}
            disabled={loading || !notes.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Approve Modal (with file upload) ────────────────────────────────────────
function ApproveModal({ open, website, onClose, onSubmit, loading }) {
  const [files, setFiles] = useState({ sourceCode: null, docs: null, video: null, previewVideo: null });
  const refs = { sourceCode: useRef(), docs: useRef(), video: useRef(), previewVideo: useRef() };

  const handleFile = (field) => (e) => setFiles((p) => ({ ...p, [field]: e.target.files[0] || null }));
  const clearFile = (field) => { setFiles((p) => ({ ...p, [field]: null })); refs[field].current.value = ""; };

  const handleSubmit = () => {
    const fd = new FormData();
    Object.entries(files).forEach(([k, v]) => { if (v) fd.append(k, v); });
    onSubmit(fd);
  };

  if (!open || !website) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-slate-800">Approve website</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-slate-500 mb-5">
          Approving <span className="font-medium text-slate-700">{website?.name}</span>. Attach delivery files (all optional).
        </p>

        <div className="flex flex-col gap-3">
          {Object.keys(files).map((field) => (
            <div key={field}>
              <label className="text-xs font-medium text-slate-500 mb-1 block capitalize">
                {field === "sourceCode" ? "Source code" : field === "previewVideo" ? "Preview video" : field.charAt(0).toUpperCase() + field.slice(1)}
              </label>
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center gap-3 px-4 py-2.5 border border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                  <span className="text-slate-400 text-lg">📎</span>
                  <span className="text-sm text-slate-500 truncate">
                    {files[field] ? files[field].name : "Choose file…"}
                  </span>
                  <input ref={refs[field]} type="file" className="hidden" onChange={handleFile(field)} />
                </label>
                {files[field] && (
                  <button onClick={() => clearFile(field)} className="text-slate-400 hover:text-red-500 text-lg leading-none">×</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {loading ? "Approving…" : "✓ Approve website"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Website Detail Drawer ────────────────────────────────────────────────────
function WebsiteDrawer({ website, onClose, onApprove, onRequestChanges, onReject, onDelete }) {
  if (!website) return null;
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-30 w-80 bg-white shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Website details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div>
            <p className="text-lg font-semibold text-slate-800">{website.name}</p>
            <a href={`https://${website.url}`} target="_blank" rel="noopener noreferrer"
               className="text-sm text-indigo-600 hover:underline">{website.url}</a>
          </div>

          <StatusBadge status={website.status} />

          <div className="flex flex-col gap-2 text-sm">
            {[
              ["Owner",     website.owner],
              ["Email",     website.ownerEmail],
              ["Submitted", website.submittedAt],
              ["Category",  website.category],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-700 text-right">{value}</span>
              </div>
            ))}
          </div>

          {website.description && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">Description</p>
              <p className="text-sm text-slate-600 leading-relaxed">{website.description}</p>
            </div>
          )}

          {website.files && Object.keys(website.files).length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Submitted files</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(website.files).map(([k, v]) => v && (
                  <span key={k} className={`text-xs font-medium px-2.5 py-1 rounded-lg ${FILE_META[k]?.cls || "bg-slate-100 text-slate-600"}`}>
                    {FILE_META[k]?.label || k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex flex-col gap-2">
          <button onClick={() => onApprove(website)}
            className="w-full py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
            ✓ Approve
          </button>
          <button onClick={() => onRequestChanges(website)}
            className="w-full py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-sm font-medium hover:bg-blue-100 transition-colors">
            ✎ Request changes
          </button>
          <div className="flex gap-2">
            <button onClick={() => onReject(website)}
              className="flex-1 py-2 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm font-medium hover:bg-red-100 transition-colors">
              ✕ Reject
            </button>
            <button onClick={() => onDelete(website)}
              className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 text-sm font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
              🗑 Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────
export default function PendingWebsites() {
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(null);      // drawer
  const [approveTarget, setApproveTarget]   = useState(null);
  const [changesTarget, setChangesTarget]   = useState(null);
  const [rejectTarget,  setRejectTarget]    = useState(null);
  const [deleteTarget,  setDeleteTarget]    = useState(null);
  const [actionLoading, setActionLoading]   = useState(false);
  const { toasts, show: showToast, remove: removeToast } = useToast();

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchWebsites = async () => {
    setLoading(true);
    try {
      const res  = await apiFetch("/websites/pending");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setWebsites(data.websites || data);
    } catch (err) {
      showToast("Failed to load websites", "error");
      // Fallback mock for local dev
      setWebsites([
        { _id: "1", name: "DevBlog Pro",  url: "devblogpro.com",  owner: "Jake Durden",  ownerEmail: "jake@example.com",  submittedAt: "May 24, 2026", status: "pending",  files: { sourceCode: true, docs: true, video: true } },
        { _id: "2", name: "ShopLaunch",   url: "shoplaunch.io",   owner: "Sara Reyes",   ownerEmail: "sara@example.com",   submittedAt: "May 23, 2026", status: "pending",  files: { sourceCode: true, video: true } },
        { _id: "3", name: "PortfolioX",   url: "portfoliox.dev",  owner: "Ming Tao",     ownerEmail: "ming@example.com",   submittedAt: "May 22, 2026", status: "changes",  files: { sourceCode: true, docs: true } },
        { _id: "4", name: "NewsDaily",    url: "newsdaily.co",    owner: "Priya Nair",   ownerEmail: "priya@example.com",  submittedAt: "May 21, 2026", status: "pending",  files: { sourceCode: true, docs: true, video: true, previewVideo: true } },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWebsites(); }, []);

  // ── Approve (multipart) ────────────────────────────────────────────────────
  const handleApprove = async (formData) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/websites/${approveTarget._id}/approve`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error();
      setWebsites((p) => p.map((w) => w._id === approveTarget._id ? { ...w, status: "approved" } : w));
      showToast(`✓ ${approveTarget.name} approved`, "success");
      setApproveTarget(null);
      setSelected(null);
    } catch {
      showToast("Failed to approve website", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Request changes ────────────────────────────────────────────────────────
  const handleRequestChanges = async (notes) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/websites/${changesTarget._id}/request-changes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error();
      setWebsites((p) => p.map((w) => w._id === changesTarget._id ? { ...w, status: "changes" } : w));
      showToast(`✎ Changes requested for ${changesTarget.name}`, "info");
      setChangesTarget(null);
      setSelected(null);
    } catch {
      showToast("Failed to send change request", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Reject ─────────────────────────────────────────────────────────────────
  const handleReject = async () => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/websites/${rejectTarget._id}/reject`, { method: "PUT" });
      if (!res.ok) throw new Error();
      setWebsites((p) => p.map((w) => w._id === rejectTarget._id ? { ...w, status: "rejected" } : w));
      showToast(`✕ ${rejectTarget.name} rejected`, "error");
      setRejectTarget(null);
      setSelected(null);
    } catch {
      showToast("Failed to reject website", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/websites/${deleteTarget._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setWebsites((p) => p.filter((w) => w._id !== deleteTarget._id));
      showToast(`🗑 ${deleteTarget.name} deleted`, "warning");
      setDeleteTarget(null);
      setSelected(null);
    } catch {
      showToast("Failed to delete website", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Open helpers (used by drawer & table) ──────────────────────────────────
  const openApprove  = (w) => { setSelected(null); setApproveTarget(w); };
  const openChanges  = (w) => { setSelected(null); setChangesTarget(w); };
  const openReject   = (w) => { setSelected(null); setRejectTarget(w); };
  const openDelete   = (w) => { setSelected(null); setDeleteTarget(w); };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = websites
    .filter((w) => activeTab === "all" || w.status === activeTab)
    .filter((w) =>
      !search ||
      w.name?.toLowerCase().includes(search.toLowerCase()) ||
      w.owner?.toLowerCase().includes(search.toLowerCase()) ||
      w.url?.toLowerCase().includes(search.toLowerCase())
    );

  const counts = TABS.reduce((acc, t) => {
    acc[t] = t === "all" ? websites.length : websites.filter((w) => w.status === t).length;
    return acc;
  }, {});

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Pending websites</h1>
            <p className="text-sm text-slate-400 mt-1">
              {counts.pending} pending · {counts.changes} need changes · {counts.approved} approved
            </p>
          </div>
          <button
            onClick={fetchWebsites}
            className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 bg-white rounded-xl px-4 py-2 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <span className="text-base">↻</span> Refresh
          </button>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Tabs + search */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 pt-0 flex-wrap gap-2">
            <div className="flex">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3.5 text-xs font-medium border-b-2 transition-colors capitalize -mb-px
                    ${activeTab === tab
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                >
                  {tab === "all" ? "All" : STATUS_LABELS[tab]}
                  <span className="ml-1.5 opacity-50">({counts[tab]})</span>
                </button>
              ))}
            </div>
            <div className="relative my-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search websites…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 w-52"
              />
            </div>
          </div>

          {/* Table */}
          {loading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["Website", "Owner", "Submitted", "Files", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-16 text-sm text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl">📭</span>
                          <span>No websites found</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filtered.map((w) => (
                    <tr
                      key={w._id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => setSelected(w)}
                    >
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-800">{w.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{w.url}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar initials={(w.owner || "??").split(" ").map((n) => n[0]).join("").slice(0, 2)} />
                          <div>
                            <p className="text-sm text-slate-700 font-medium">{w.owner}</p>
                            <p className="text-xs text-slate-400">{w.ownerEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{w.submittedAt}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {w.files && Object.entries(w.files).filter(([, v]) => v).map(([k]) => (
                            <span key={k} className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${FILE_META[k]?.cls || "bg-slate-100 text-slate-600"}`}>
                              {FILE_META[k]?.label || k}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4"><StatusBadge status={w.status} /></td>
                      <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            title="Approve"
                            onClick={() => openApprove(w)}
                            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-colors flex items-center justify-center text-sm"
                          >✓</button>
                          <button
                            title="Request changes"
                            onClick={() => openChanges(w)}
                            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors flex items-center justify-center text-sm"
                          >✎</button>
                          <button
                            title="Reject"
                            onClick={() => openReject(w)}
                            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors flex items-center justify-center text-sm"
                          >✕</button>
                          <button
                            title="Delete"
                            onClick={() => openDelete(w)}
                            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors flex items-center justify-center text-sm"
                          >🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <ApproveModal
        open={!!approveTarget}
        website={approveTarget}
        onClose={() => setApproveTarget(null)}
        onSubmit={handleApprove}
        loading={actionLoading}
      />
      <RequestChangesModal
        open={!!changesTarget}
        website={changesTarget}
        onClose={() => setChangesTarget(null)}
        onSubmit={handleRequestChanges}
        loading={actionLoading}
      />
      <ConfirmModal
        open={!!rejectTarget}
        title="Reject website"
        description={`Are you sure you want to reject "${rejectTarget?.name}"? The owner will be notified.`}
        confirmLabel="Reject"
        confirmClass="bg-red-600 hover:bg-red-700"
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
        loading={actionLoading}
      />
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete website"
        description={`Permanently delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmClass="bg-red-600 hover:bg-red-700"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={actionLoading}
      />

      {/* Drawer */}
      <WebsiteDrawer
        website={selected}
        onClose={() => setSelected(null)}
        onApprove={openApprove}
        onRequestChanges={openChanges}
        onReject={openReject}
        onDelete={openDelete}
      />

      <Toast toasts={toasts} remove={removeToast} />
    </div>
  );
}