import { useState } from "react";

// ─── Mock Data ───────────────────────────────────────────────────────────────
const WEBSITES = [
  { id: 1, name: "DevBlog Pro",  url: "devblogpro.com",  owner: "Jake Durden",  email: "jake@example.com",  submitted: "May 24, 2026", status: "pending",  files: ["source","docs","video"] },
  { id: 2, name: "ShopLaunch",  url: "shoplaunch.io",   owner: "Sara Reyes",   email: "sara@example.com",   submitted: "May 23, 2026", status: "pending",  files: ["source","video"] },
  { id: 3, name: "PortfolioX",  url: "portfoliox.dev",  owner: "Ming Tao",     email: "ming@example.com",   submitted: "May 22, 2026", status: "changes",  files: ["source","docs"] },
  { id: 4, name: "NewsDaily",   url: "newsdaily.co",    owner: "Priya Nair",   email: "priya@example.com",  submitted: "May 21, 2026", status: "pending",  files: ["source","docs","video","preview"] },
];

const PAYOUTS = [
  { id: 1, name: "Jake Durden", email: "jake@example.com", initials: "JD", method: "Bank transfer", date: "May 25, 2026", amount: 840 },
  { id: 2, name: "Sara Reyes",  email: "sara@example.com", initials: "SR", method: "PayPal",        date: "May 24, 2026", amount: 1200 },
  { id: 3, name: "Ming Tao",    email: "ming@example.com", initials: "MT", method: "Bank transfer", date: "May 23, 2026", amount: 300 },
];

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  pending:  "bg-amber-100 text-amber-700 ring-amber-200",
  changes:  "bg-blue-100 text-blue-700 ring-blue-200",
  approved: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-100 text-red-700 ring-red-200",
};
const STATUS_LABELS = {
  pending: "Pending",
  changes: "Changes req.",
  approved: "Approved",
  rejected: "Rejected",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── File Icon Tags ───────────────────────────────────────────────────────────
const FILE_META = {
  source:  { label: "SRC",  cls: "bg-violet-100 text-violet-700" },
  docs:    { label: "DOC",  cls: "bg-sky-100 text-sky-700" },
  video:   { label: "VID",  cls: "bg-rose-100 text-rose-700" },
  preview: { label: "PRV",  cls: "bg-teal-100 text-teal-700" },
};

function FileTags({ files }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {files.map((f) => (
        <span key={f} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${FILE_META[f].cls}`}>
          {FILE_META[f].label}
        </span>
      ))}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ initials, size = "md" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-content-center shrink-0`}
         style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      {initials}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, subType = "neutral", icon }) {
  const subColor = subType === "up" ? "text-emerald-600" : subType === "down" ? "text-red-500" : "text-slate-400";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <span className="text-slate-300 text-lg">{icon}</span>
      </div>
      <p className="text-3xl font-semibold text-slate-800">{value}</p>
      <p className={`text-xs ${subColor}`}>{sub}</p>
    </div>
  );
}

// ─── Icon Button ─────────────────────────────────────────────────────────────
function IconBtn({ title, onClick, variant = "default", children }) {
  const base = "w-7 h-7 rounded-lg border flex items-center justify-center text-sm transition-colors";
  const variants = {
    default:  "border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600",
    success:  "border-slate-200 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200",
    danger:   "border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200",
  };
  return (
    <button title={title} onClick={onClick} className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  );
}

// ─── Website Action Buttons ───────────────────────────────────────────────────
function WebsiteActions({ website, onApprove, onRequestChanges, onReject, onDelete }) {
  return (
    <div className="flex items-center gap-1.5">
      <IconBtn title="Approve" variant="success" onClick={() => onApprove(website)}>✓</IconBtn>
      <IconBtn title="Request changes" onClick={() => onRequestChanges(website)}>✎</IconBtn>
      <IconBtn title="Reject" variant="danger" onClick={() => onReject(website)}>✕</IconBtn>
      <IconBtn title="Delete" variant="danger" onClick={() => onDelete(website)}>🗑</IconBtn>
    </div>
  );
}

// ─── Nav Item ─────────────────────────────────────────────────────────────────
function NavItem({ label, icon, active, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left
        ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="bg-red-100 text-red-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </button>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
function DashboardPage({ websites, payouts, onNav, onApprove, onRequestChanges, onReject, onDelete, onProcessPayout }) {
  const pending = websites.filter((w) => w.status === "pending").length;
  const changes = websites.filter((w) => w.status === "changes").length;
  const totalPayout = payouts.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Welcome back, Super Admin</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-sm text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
            ↻ Refresh
          </button>
          <div className="w-9 h-9 rounded-full bg-indigo-600 text-white text-sm font-semibold flex items-center justify-content-center"
               style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            SA
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Pending websites" value={pending} sub="awaiting review" icon="🌐" />
        <StatCard label="Approved this month" value={18} sub="↑ +6 from last month" subType="up" icon="✅" />
        <StatCard label="Pending payouts" value={`$${totalPayout.toLocaleString()}`} sub={`${payouts.length} requests`} icon="💰" />
        <StatCard label="Rejected" value={2} sub="this month" subType="down" icon="❌" />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Recent pending websites */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">🕐 Pending websites</h2>
            <button onClick={() => onNav("pending")} className="text-xs text-indigo-600 hover:underline">View all →</button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide px-5 py-2.5">Name</th>
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide px-5 py-2.5">Date</th>
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide px-5 py-2.5">Status</th>
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide px-5 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {websites.slice(0, 3).map((w) => (
                <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-slate-700">{w.name}</td>
                  <td className="px-5 py-3 text-xs text-slate-400">{w.submitted.split(",")[0]}</td>
                  <td className="px-5 py-3"><StatusBadge status={w.status} /></td>
                  <td className="px-5 py-3">
                    <WebsiteActions website={w} onApprove={onApprove} onRequestChanges={onRequestChanges} onReject={onReject} onDelete={onDelete} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pending payouts */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">💰 Pending payouts</h2>
            <button onClick={() => onNav("payouts")} className="text-xs text-indigo-600 hover:underline">View all →</button>
          </div>
          <div className="divide-y divide-slate-100">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar initials={p.initials} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.date} · {p.method}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-800">${p.amount.toLocaleString()}</span>
                  <button
                    onClick={() => onProcessPayout(p)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    Process
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Websites Page ────────────────────────────────────────────────────────────
const WEB_TABS = ["all", "pending", "changes", "approved", "rejected"];

function WebsitesPage({ websites, onBack, onApprove, onRequestChanges, onReject, onDelete }) {
  const [activeTab, setActiveTab] = useState("all");

  const filtered = activeTab === "all" ? websites : websites.filter((w) => w.status === activeTab);

  const counts = WEB_TABS.reduce((acc, t) => {
    acc[t] = t === "all" ? websites.length : websites.filter((w) => w.status === t).length;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Pending websites</h1>
          <p className="text-sm text-slate-400 mt-0.5">Review and manage submitted websites</p>
        </div>
        <button onClick={onBack} className="text-sm text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
          ← Back
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-2 pt-2 gap-1">
          {WEB_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs font-medium rounded-t-lg capitalize transition-colors border-b-2 -mb-px
                ${activeTab === tab
                  ? "border-indigo-600 text-indigo-700 bg-indigo-50"
                  : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              {tab === "all" ? "All" : STATUS_LABELS[tab]}
              <span className="ml-1.5 text-[10px] opacity-60">({counts[tab]})</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                {["Website", "Owner", "Submitted", "Files", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-sm text-slate-400">No websites in this category</td></tr>
              )}
              {filtered.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-semibold text-slate-700">{w.name}</p>
                    <p className="text-xs text-slate-400">{w.url}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm text-slate-700">{w.owner}</p>
                    <p className="text-xs text-slate-400">{w.email}</p>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">{w.submitted}</td>
                  <td className="px-5 py-3.5"><FileTags files={w.files} /></td>
                  <td className="px-5 py-3.5"><StatusBadge status={w.status} /></td>
                  <td className="px-5 py-3.5">
                    <WebsiteActions website={w} onApprove={onApprove} onRequestChanges={onRequestChanges} onReject={onReject} onDelete={onDelete} />
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

// ─── Payouts Page ─────────────────────────────────────────────────────────────
function PayoutsPage({ payouts, onBack, onProcessPayout }) {
  const total = payouts.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Pending payouts</h1>
          <p className="text-sm text-slate-400 mt-0.5">Total: <span className="font-semibold text-slate-700">${total.toLocaleString()}</span> across {payouts.length} requests</p>
        </div>
        <button onClick={onBack} className="text-sm text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
          ← Back
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              {["User", "Method", "Requested", "Amount", "Action"].map((h) => (
                <th key={h} className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payouts.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar initials={p.initials} size="sm" />
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-slate-600">{p.method}</td>
                <td className="px-5 py-4 text-sm text-slate-500">{p.date}</td>
                <td className="px-5 py-4 text-sm font-semibold text-slate-800">${p.amount.toLocaleString()}</td>
                <td className="px-5 py-4">
                  <button
                    onClick={() => onProcessPayout(p)}
                    className="text-xs font-semibold px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    Process →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Toast Notification ───────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  const colors = {
    success: "bg-emerald-600",
    error: "bg-red-500",
    info: "bg-indigo-600",
    warning: "bg-amber-500",
  };
  return (
    <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg ${colors[type]}`}>
      <span>{message}</span>
      <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">×</button>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [page, setPage] = useState("dashboard");
  const [websites, setWebsites] = useState(WEBSITES);
  const [payouts, setPayouts] = useState(PAYOUTS);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Handlers
  const handleApprove = (w) => {
    setWebsites((prev) => prev.map((x) => x.id === w.id ? { ...x, status: "approved" } : x));
    showToast(`✓ ${w.name} approved`, "success");
  };
  const handleRequestChanges = (w) => {
    setWebsites((prev) => prev.map((x) => x.id === w.id ? { ...x, status: "changes" } : x));
    showToast(`✎ Changes requested for ${w.name}`, "info");
  };
  const handleReject = (w) => {
    setWebsites((prev) => prev.map((x) => x.id === w.id ? { ...x, status: "rejected" } : x));
    showToast(`✕ ${w.name} rejected`, "error");
  };
  const handleDelete = (w) => {
    setWebsites((prev) => prev.filter((x) => x.id !== w.id));
    showToast(`🗑 ${w.name} deleted`, "warning");
  };
  const handleProcessPayout = (p) => {
    setPayouts((prev) => prev.filter((x) => x.id !== p.id));
    showToast(`💸 Payout of $${p.amount} to ${p.name} processed`, "success");
  };

  const pendingWebsites = websites.filter((w) => w.status === "pending").length;
  const pendingPayouts = payouts.length;

  const NAV = [
    { id: "dashboard", label: "Dashboard",  icon: "⊞",  badge: null },
    { id: "pending",   label: "Websites",   icon: "🌐", badge: pendingWebsites },
    { id: "payouts",   label: "Payouts",    icon: "💰", badge: pendingPayouts },
  ];

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-content-center text-white text-base"
               style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            ⛨
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 leading-tight">AdminPanel</p>
            <p className="text-[10px] text-slate-400">Super Admin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 px-2 pt-2 pb-1 font-medium">Overview</p>
          {NAV.map((item) => (
            <NavItem
              key={item.id}
              label={item.label}
              icon={item.icon}
              badge={item.badge}
              active={page === item.id}
              onClick={() => setPage(item.id)}
            />
          ))}
          <p className="text-[10px] uppercase tracking-widest text-slate-400 px-2 pt-4 pb-1 font-medium">System</p>
          <NavItem label="Users" icon="👥" onClick={() => showToast("Users module coming soon", "info")} />
          <NavItem label="Settings" icon="⚙️" onClick={() => showToast("Settings coming soon", "info")} />
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-content-center"
                 style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              SA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 truncate">Super Admin</p>
              <p className="text-[10px] text-slate-400 truncate">admin@system.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          {page === "dashboard" && (
            <DashboardPage
              websites={websites}
              payouts={payouts}
              onNav={setPage}
              onApprove={handleApprove}
              onRequestChanges={handleRequestChanges}
              onReject={handleReject}
              onDelete={handleDelete}
              onProcessPayout={handleProcessPayout}
            />
          )}
          {page === "pending" && (
            <WebsitesPage
              websites={websites}
              onBack={() => setPage("dashboard")}
              onApprove={handleApprove}
              onRequestChanges={handleRequestChanges}
              onReject={handleReject}
              onDelete={handleDelete}
            />
          )}
          {page === "payouts" && (
            <PayoutsPage
              payouts={payouts}
              onBack={() => setPage("dashboard")}
              onProcessPayout={handleProcessPayout}
            />
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}