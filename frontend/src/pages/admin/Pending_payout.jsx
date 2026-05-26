import { useState, useEffect } from "react";

const API_BASE = "/api/admin";
const getToken = () => localStorage.getItem("adminToken") || "";
const apiFetch = (url, options = {}) =>
  fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });

// ─── Reusable UI ──────────────────────────────────────────────────────────────
function Avatar({ initials }) {
  const COLORS = [
    "bg-indigo-100 text-indigo-700",
    "bg-teal-100   text-teal-700",
    "bg-rose-100   text-rose-700",
    "bg-amber-100  text-amber-700",
    "bg-violet-100 text-violet-700",
    "bg-sky-100    text-sky-700",
  ];
  const idx = (initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % COLORS.length;
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${COLORS[idx]}`}>
      {initials}
    </div>
  );
}

function StatCard({ label, value, sub, accent = "slate" }) {
  const accents = {
    slate:   "text-slate-800",
    emerald: "text-emerald-600",
    amber:   "text-amber-600",
    indigo:  "text-indigo-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-3xl font-semibold ${accents[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
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

function Toast({ toasts, remove }) {
  const colors = { success: "bg-emerald-600", error: "bg-red-500", info: "bg-indigo-600", warning: "bg-amber-500" };
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg ${colors[t.type]}`}>
          <span>{t.message}</span>
          <button onClick={() => remove(t.id)} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  );
}

// ─── Process Payout Modal ─────────────────────────────────────────────────────
function ProcessModal({ open, payout, onClose, onConfirm, loading }) {
  const [note, setNote] = useState("");
  const [txRef, setTxRef] = useState("");

  if (!open || !payout) return null;

  const handleSubmit = () => onConfirm({ note, txRef });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Process payout</h3>
            <p className="text-xs text-slate-400 mt-0.5">Confirm before marking as processed</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Payout summary */}
        <div className="bg-slate-50 rounded-xl p-4 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar initials={payout.initials || payout.name?.slice(0, 2).toUpperCase() || "??"} />
            <div>
              <p className="text-sm font-semibold text-slate-800">{payout.name}</p>
              <p className="text-xs text-slate-400">{payout.email}</p>
              <p className="text-xs text-slate-400">{payout.method}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-800">${(payout.amount || 0).toLocaleString()}</p>
            <p className="text-xs text-slate-400">Requested {payout.requestedAt}</p>
          </div>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Transaction reference (optional)</label>
            <input
              type="text"
              placeholder="e.g. TXN-20260526-001"
              value={txRef}
              onChange={(e) => setTxRef(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Admin note (optional)</label>
            <textarea
              rows={3}
              placeholder="Internal notes about this payout…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 text-sm rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {loading ? "Processing…" : "💸 Confirm & process"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payout Detail Drawer ─────────────────────────────────────────────────────
function PayoutDrawer({ payout, onClose, onProcess }) {
  if (!payout) return null;
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-30 w-80 bg-white shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Payout details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar initials={payout.initials || payout.name?.slice(0, 2).toUpperCase() || "??"} />
            <div>
              <p className="text-base font-semibold text-slate-800">{payout.name}</p>
              <p className="text-sm text-slate-400">{payout.email}</p>
            </div>
          </div>

          <div className="bg-emerald-50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-emerald-700">${(payout.amount || 0).toLocaleString()}</p>
            <p className="text-xs text-emerald-600 mt-1">Requested amount</p>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            {[
              ["Method",    payout.method],
              ["Requested", payout.requestedAt],
              ["Account",   payout.accountDetails],
              ["Bank",      payout.bankName],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-700 text-right font-medium">{value}</span>
              </div>
            ))}
          </div>

          {payout.websiteEarnings && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Earnings breakdown</p>
              <div className="flex flex-col gap-1.5">
                {payout.websiteEarnings.map((e, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-500">{e.website}</span>
                    <span className="text-slate-700 font-medium">${e.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => { onClose(); onProcess(payout); }}
            className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            💸 Process payout
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────
export default function PendingPayouts() {
  const [payouts, setPayouts]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState(null);
  const [processTarget, setProcessTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [sortBy, setSortBy]         = useState("date");  // "date" | "amount"
  const [processed, setProcessed]   = useState([]);      // recently processed (history)
  const { toasts, show: showToast, remove: removeToast } = useToast();

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const res  = await apiFetch("/payouts/pending");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setPayouts(data.payouts || data);
    } catch {
      showToast("Failed to load payouts, showing demo data", "warning");
      // Fallback mock
      setPayouts([
        { _id: "1", name: "Jake Durden", email: "jake@example.com", initials: "JD", method: "Bank transfer", requestedAt: "May 25, 2026", amount: 840,  bankName: "HDFC Bank",    accountDetails: "XXXX-1234", websiteEarnings: [{ website: "DevBlog Pro", amount: 840 }] },
        { _id: "2", name: "Sara Reyes",  email: "sara@example.com", initials: "SR", method: "PayPal",        requestedAt: "May 24, 2026", amount: 1200, bankName: "PayPal",       accountDetails: "sara@example.com", websiteEarnings: [{ website: "ShopLaunch", amount: 1200 }] },
        { _id: "3", name: "Ming Tao",    email: "ming@example.com", initials: "MT", method: "Bank transfer", requestedAt: "May 23, 2026", amount: 300,  bankName: "Axis Bank",    accountDetails: "XXXX-5678", websiteEarnings: [{ website: "PortfolioX", amount: 300 }] },
        { _id: "4", name: "Priya Nair",  email: "priya@example.com",initials: "PN", method: "UPI",           requestedAt: "May 22, 2026", amount: 650,  bankName: "UPI",          accountDetails: "priya@upi", websiteEarnings: [{ website: "NewsDaily", amount: 650 }] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPayouts(); }, []);

  // ── Process payout ─────────────────────────────────────────────────────────
  const handleProcess = async ({ note, txRef }) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/payouts/${processTarget._id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, txRef }),
      });
      if (!res.ok) throw new Error();
      const done = { ...processTarget, processedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), txRef };
      setPayouts((p) => p.filter((x) => x._id !== processTarget._id));
      setProcessed((p) => [done, ...p]);
      showToast(`💸 $${processTarget.amount.toLocaleString()} sent to ${processTarget.name}`, "success");
      setProcessTarget(null);
    } catch {
      showToast("Failed to process payout", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = payouts
    .filter((p) =>
      !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.method?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => sortBy === "amount" ? b.amount - a.amount : 0);

  const total    = payouts.reduce((s, p) => s + (p.amount || 0), 0);
  const highest  = payouts.reduce((m, p) => Math.max(m, p.amount || 0), 0);
  const avgAmount = payouts.length ? Math.round(total / payouts.length) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Pending payouts</h1>
            <p className="text-sm text-slate-400 mt-1">{payouts.length} requests waiting to be processed</p>
          </div>
          <button
            onClick={fetchPayouts}
            className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 bg-white rounded-xl px-4 py-2 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <span>↻</span> Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total pending"   value={`$${total.toLocaleString()}`}    sub={`${payouts.length} requests`}         accent="emerald" />
          <StatCard label="Largest request" value={`$${highest.toLocaleString()}`}  sub="single payout"                        accent="amber" />
          <StatCard label="Average amount"  value={`$${avgAmount.toLocaleString()}`} sub="per request"                         accent="indigo" />
          <StatCard label="Processed today" value={processed.length}                 sub={`$${processed.reduce((s,p)=>s+p.amount,0).toLocaleString()} released`} accent="slate" />
        </div>

        {/* Main table card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-wrap gap-3">
            <h2 className="text-sm font-semibold text-slate-700">Payout requests</h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Search payouts…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 w-44"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="date">Sort: Date</option>
                <option value="amount">Sort: Amount</option>
              </select>
            </div>
          </div>

          {loading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["User", "Method", "Account", "Requested", "Amount", "Action"].map((h) => (
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
                          <span className="text-3xl">🎉</span>
                          <span>No pending payouts — all clear!</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filtered.map((p) => (
                    <tr
                      key={p._id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => setSelected(p)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar initials={p.initials || p.name?.slice(0, 2).toUpperCase() || "??"} />
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                            <p className="text-xs text-slate-400">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                          <span>{p.method === "PayPal" ? "🅿" : p.method === "UPI" ? "🇮🇳" : "🏦"}</span>
                          {p.method}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">{p.accountDetails || "—"}</td>
                      <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{p.requestedAt}</td>
                      <td className="px-5 py-4">
                        <span className="text-base font-bold text-slate-800">${(p.amount || 0).toLocaleString()}</span>
                      </td>
                      <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setProcessTarget(p)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors whitespace-nowrap"
                        >
                          💸 Process
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recently processed section */}
        {processed.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">✅ Processed this session</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {processed.map((p) => (
                <div key={p._id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar initials={p.initials || p.name?.slice(0, 2).toUpperCase() || "??"} />
                    <div>
                      <p className="text-sm font-medium text-slate-700">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.method} · Processed {p.processedAt}</p>
                      {p.txRef && <p className="text-xs text-indigo-500 font-mono mt-0.5">{p.txRef}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-emerald-600">${(p.amount || 0).toLocaleString()}</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                      Processed
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Process Modal */}
      <ProcessModal
        open={!!processTarget}
        payout={processTarget}
        onClose={() => setProcessTarget(null)}
        onConfirm={handleProcess}
        loading={actionLoading}
      />

      {/* Detail Drawer */}
      <PayoutDrawer
        payout={selected}
        onClose={() => setSelected(null)}
        onProcess={(p) => { setSelected(null); setProcessTarget(p); }}
      />

      <Toast toasts={toasts} remove={removeToast} />
    </div>
  );
}