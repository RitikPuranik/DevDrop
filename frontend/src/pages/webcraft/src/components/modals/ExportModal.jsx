import React, { useState, useMemo } from "react";
import { X, Download, Copy, Check, Code2, FileText, Globe } from "lucide-react";
import { useStore } from "../../store/useStore.js";

// ─── HTML Code Generator ───────────────────────────────────────────────────────
function generateElementHTML(el) {
  const p = el.props;
  switch (el.type) {
    case "hero":
      return `  <!-- Hero Section -->
  <section style="background:${p.bgColor};color:${p.textColor};min-height:${p.height || "500px"};display:flex;align-items:center;justify-content:center;padding:64px 32px;text-align:${p.align || "center"};">
    <div style="max-width:800px;width:100%">
      <h1 style="font-size:clamp(2rem,5vw,4rem);font-weight:900;margin-bottom:16px;line-height:1.1">${p.title}</h1>
      <p style="font-size:1.25rem;opacity:0.85;margin-bottom:32px">${p.subtitle}</p>
      ${p.buttonText ? `<a href="${p.buttonLink || "#"}" style="display:inline-block;padding:16px 40px;background:rgba(255,255,255,0.2);color:${p.textColor};border:2px solid rgba(255,255,255,0.4);border-radius:12px;font-weight:700;font-size:1.1rem;text-decoration:none;backdrop-filter:blur(8px);transition:opacity 0.2s">${p.buttonText}</a>` : ""}
    </div>
  </section>`;
    case "text":
      return `  <!-- Text Section -->
  <section style="background:${p.bgColor || "#fff"};color:${p.textColor || "#1a1a2e"};padding:${p.padding || "60px"} 32px;text-align:${p.align || "left"}">
    <div style="max-width:${p.maxWidth || "800px"};margin:0 auto">
      ${p.content || ""}
    </div>
  </section>`;
    case "image":
      return `  <!-- Image Section -->
  <section>
    <img src="${p.src}" alt="${p.alt || ""}" style="width:100%;height:${p.height || "400px"};object-fit:${p.fit || "cover"};border-radius:${p.borderRadius || "0"};display:block"/>
    ${p.caption ? `<p style="text-align:center;font-size:0.875rem;color:#6b7280;padding:8px;background:#fff">${p.caption}</p>` : ""}
  </section>`;
    case "features":
      return `  <!-- Features Section -->
  <section style="background:${p.bgColor || "#f8fafc"};color:${p.textColor || "#1a1a2e"};padding:64px 32px">
    <div style="max-width:1000px;margin:0 auto">
      <div style="text-align:center;margin-bottom:48px">
        <h2 style="font-size:2rem;font-weight:800;margin-bottom:12px">${p.title}</h2>
        ${p.subtitle ? `<p style="font-size:1.125rem;opacity:0.7">${p.subtitle}</p>` : ""}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:32px">
        ${(p.features || []).map(f => `<div style="text-align:center;padding:32px;background:rgba(0,0,0,0.04);border-radius:16px">
          <div style="font-size:2.5rem;margin-bottom:16px">${f.icon}</div>
          <h3 style="font-size:1.25rem;font-weight:700;margin-bottom:8px">${f.title}</h3>
          <p style="opacity:0.7">${f.desc}</p>
        </div>`).join("\n        ")}
      </div>
    </div>
  </section>`;
    case "cta":
      return `  <!-- CTA Section -->
  <section style="background:${p.bgColor || "#6366f1"};color:${p.textColor || "#fff"};padding:80px 32px;text-align:center">
    <div style="max-width:640px;margin:0 auto">
      <h2 style="font-size:2.5rem;font-weight:900;margin-bottom:16px">${p.title}</h2>
      ${p.subtitle ? `<p style="font-size:1.125rem;opacity:0.85;margin-bottom:32px">${p.subtitle}</p>` : ""}
      <a href="#" style="display:inline-block;padding:16px 48px;background:${p.buttonColor || "#fff"};color:${p.bgColor || "#6366f1"};border-radius:12px;font-weight:700;font-size:1.1rem;text-decoration:none">${p.buttonText}</a>
    </div>
  </section>`;
    case "stats":
      return `  <!-- Stats Section -->
  <section style="background:${p.bgColor || "#6366f1"};color:${p.textColor || "#fff"};padding:64px 32px;text-align:center">
    <div style="max-width:900px;margin:0 auto">
      ${p.title ? `<h2 style="font-size:1.5rem;font-weight:700;margin-bottom:40px">${p.title}</h2>` : ""}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:32px">
        ${(p.stats || []).map(s => `<div>
          <div style="font-size:2rem;margin-bottom:8px">${s.icon}</div>
          <div style="font-size:2.5rem;font-weight:900;margin-bottom:4px">${s.value}</div>
          <div style="opacity:0.75">${s.label}</div>
        </div>`).join("\n        ")}
      </div>
    </div>
  </section>`;
    case "testimonials":
      return `  <!-- Testimonials Section -->
  <section style="background:${p.bgColor || "#fff"};color:${p.textColor || "#1a1a2e"};padding:64px 32px">
    <div style="max-width:1000px;margin:0 auto">
      <h2 style="font-size:2rem;font-weight:800;text-align:center;margin-bottom:48px">${p.title}</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px">
        ${(p.testimonials || []).map((t, i) => `<div style="padding:24px;border-radius:16px;border:1px solid rgba(0,0,0,0.08);background:rgba(0,0,0,0.02)">
          <p style="opacity:0.8;margin-bottom:24px;font-style:italic">"${t.text}"</p>
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:hsl(${i * 120},60%,50%);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.875rem">${(t.avatar || t.name?.slice(0,2) || "??").toUpperCase()}</div>
            <div>
              <div style="font-weight:700;font-size:0.875rem">${t.name}</div>
              <div style="font-size:0.75rem;opacity:0.6">${t.role}</div>
            </div>
          </div>
        </div>`).join("\n        ")}
      </div>
    </div>
  </section>`;
    case "pricing":
      return `  <!-- Pricing Section -->
  <section style="background:${p.bgColor || "#f8fafc"};color:${p.textColor || "#1a1a2e"};padding:64px 32px">
    <div style="max-width:1000px;margin:0 auto">
      <h2 style="font-size:2rem;font-weight:800;text-align:center;margin-bottom:48px">${p.title}</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px">
        ${(p.plans || []).map(plan => `<div style="padding:32px;border-radius:16px;border:2px solid ${plan.highlighted ? "#6366f1" : "rgba(0,0,0,0.1)"};background:${plan.highlighted ? "#6366f1" : "#fff"};color:${plan.highlighted ? "#fff" : "inherit"};transition:transform 0.2s">
          <div style="font-size:0.875rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;opacity:0.7;margin-bottom:8px">${plan.name}</div>
          <div style="font-size:2.5rem;font-weight:900;margin-bottom:4px">${plan.price}</div>
          <div style="font-size:0.875rem;opacity:0.6;margin-bottom:24px">${plan.period || "forever"}</div>
          <ul style="list-style:none;padding:0;margin:0 0 32px;space-y:8px">
            ${(plan.features || []).map(f => `<li style="padding:4px 0;font-size:0.875rem;display:flex;align-items:center;gap:8px"><span style="color:#4ade80">✓</span> ${f}</li>`).join("")}
          </ul>
          <a href="#" style="display:block;text-align:center;padding:12px;border-radius:10px;font-weight:700;text-decoration:none;background:${plan.highlighted ? "rgba(255,255,255,0.2)" : "#6366f1"};color:#fff">Get Started</a>
        </div>`).join("\n        ")}
      </div>
    </div>
  </section>`;
    case "navbar":
      return `  <!-- Navbar -->
  <nav style="background:${p.bgColor || "#fff"};color:${p.textColor || "#1a1a2e"};padding:16px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(0,0,0,0.08);position:sticky;top:0;z-index:100">
    <div style="font-weight:900;font-size:1.25rem">${p.brand}</div>
    <div style="display:flex;gap:24px;align-items:center">
      ${(p.links || []).map(l => `<a href="${l.href}" style="color:inherit;text-decoration:none;font-size:0.875rem;opacity:0.8;transition:opacity 0.2s">${l.label}</a>`).join("")}
      ${p.ctaText ? `<a href="#" style="padding:8px 20px;background:#6366f1;color:#fff;border-radius:8px;font-size:0.875rem;font-weight:600;text-decoration:none">${p.ctaText}</a>` : ""}
    </div>
  </nav>`;
    case "footer":
      return `  <!-- Footer -->
  <footer style="background:${p.bgColor || "#1a1a2e"};color:${p.textColor || "#fff"};padding:48px 32px">
    <div style="max-width:1000px;margin:0 auto">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:32px;margin-bottom:32px">
        <div>
          <div style="font-weight:900;font-size:1.25rem;margin-bottom:8px">${p.brand}</div>
          ${p.tagline ? `<p style="opacity:0.6;font-size:0.875rem;max-width:280px">${p.tagline}</p>` : ""}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:24px">
          ${(p.links || []).map(l => `<a href="${l.href}" style="color:inherit;text-decoration:none;font-size:0.875rem;opacity:0.6">${l.label}</a>`).join("")}
        </div>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;text-align:center;font-size:0.75rem;opacity:0.4">© ${new Date().getFullYear()} ${p.brand}. All rights reserved.</div>
    </div>
  </footer>`;
    case "contact":
      return `  <!-- Contact Section -->
  <section style="background:${p.bgColor || "#f8fafc"};color:${p.textColor || "#1a1a2e"};padding:64px 32px">
    <div style="max-width:900px;margin:0 auto">
      <div style="text-align:center;margin-bottom:40px">
        <h2 style="font-size:2rem;font-weight:800;margin-bottom:12px">${p.title}</h2>
        ${p.subtitle ? `<p style="opacity:0.7;font-size:1.125rem">${p.subtitle}</p>` : ""}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">
        <div>
          ${p.email ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><span style="font-size:1.5rem">✉️</span><a href="mailto:${p.email}" style="color:inherit;opacity:0.8">${p.email}</a></div>` : ""}
          ${p.phone ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><span style="font-size:1.5rem">📞</span><span style="opacity:0.8">${p.phone}</span></div>` : ""}
          ${p.address ? `<div style="display:flex;align-items:center;gap:12px"><span style="font-size:1.5rem">📍</span><span style="opacity:0.8">${p.address}</span></div>` : ""}
        </div>
        <form onsubmit="return false">
          <input type="text" placeholder="Your Name" style="width:100%;padding:12px 16px;border:1px solid rgba(0,0,0,0.15);border-radius:10px;margin-bottom:12px;font-size:0.875rem;outline:none"/>
          <input type="email" placeholder="Email Address" style="width:100%;padding:12px 16px;border:1px solid rgba(0,0,0,0.15);border-radius:10px;margin-bottom:12px;font-size:0.875rem;outline:none"/>
          <textarea placeholder="Your Message" rows="4" style="width:100%;padding:12px 16px;border:1px solid rgba(0,0,0,0.15);border-radius:10px;margin-bottom:12px;font-size:0.875rem;outline:none;resize:none"></textarea>
          <button type="submit" style="width:100%;padding:12px;background:#6366f1;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:0.875rem">Send Message</button>
        </form>
      </div>
    </div>
  </section>`;
    case "faq":
      return `  <!-- FAQ Section -->
  <section style="background:${p.bgColor || "#fff"};color:${p.textColor || "#1a1a2e"};padding:64px 32px">
    <div style="max-width:640px;margin:0 auto">
      <h2 style="font-size:2rem;font-weight:800;text-align:center;margin-bottom:40px">${p.title}</h2>
      <div style="space-y:12px">
        ${(p.faqs || []).map((f, i) => `<details style="border:1px solid rgba(0,0,0,0.1);border-radius:12px;overflow:hidden;margin-bottom:12px">
          <summary style="padding:20px;font-weight:600;cursor:pointer;list-style:none;display:flex;justify-content:space-between">${f.q} <span>+</span></summary>
          <div style="padding:0 20px 20px;opacity:0.75">${f.a}</div>
        </details>`).join("")}
      </div>
    </div>
  </section>`;
    default:
      return `  <!-- ${el.type} section -->`;
  }
}

function generateFullHTML(pages, elements, siteMeta) {
  const mainPageId = pages.find(p => p.isHome)?.id || pages[0]?.id;
  const mainElements = elements[mainPageId] || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${siteMeta.name}</title>
  <meta name="description" content="Built with WebCraft" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=${siteMeta.font || "Syne"}:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: '${siteMeta.font || "Syne"}', sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
    img { max-width: 100%; display: block; }
    a { transition: opacity 0.2s; }
    a:hover { opacity: 0.8; }
    @media (max-width: 768px) {
      nav > div:nth-child(2) { display: none !important; }
      section > div { padding: 0 16px !important; }
      h1 { font-size: 2rem !important; }
      h2 { font-size: 1.5rem !important; }
    }
    /* Smooth section transitions */
    section, nav, footer { transition: all 0.3s ease; }
  </style>
</head>
<body>
${mainElements.map(generateElementHTML).join("\n\n")}

  <!-- Built with WebCraft -->
  <script>
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', function(e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
      });
    });
    // FAQ accordion toggle icons
    document.querySelectorAll('details').forEach(d => {
      d.addEventListener('toggle', () => {
        const icon = d.querySelector('summary span');
        if (icon) icon.textContent = d.open ? '−' : '+';
      });
    });
  </script>
</body>
</html>`;
}

export default function ExportModal() {
  const { setShowExportModal, pages, elements, siteMeta } = useStore();
  const [tab, setTab] = useState("html");
  const [copied, setCopied] = useState(false);

  const htmlCode = useMemo(() => generateFullHTML(pages, elements, siteMeta), [pages, elements, siteMeta]);
  const jsonCode = useMemo(() => JSON.stringify({ siteMeta, pages, elements }, null, 2), [siteMeta, pages, elements]);

  const code = tab === "html" ? htmlCode : jsonCode;

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadHTML = () => {
    const blob = new Blob([htmlCode], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${siteMeta.name.replace(/\s+/g, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    const blob = new Blob([jsonCode], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${siteMeta.name.replace(/\s+/g, "-").toLowerCase()}-project.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const linesOfCode = htmlCode.split("\n").length;
  const mainPageId = pages.find(p => p.isHome)?.id || pages[0]?.id;
  const blockCount = (elements[mainPageId] || []).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#16161e] border border-[#2a2a38] rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a38]">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Code2 size={18} className="text-indigo-400" /> Export Code
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">{blockCount} blocks · {linesOfCode} lines of HTML</p>
          </div>
          <button onClick={() => setShowExportModal(false)} className="text-zinc-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-[#2a2a38]">
          <button onClick={downloadHTML} className="btn-primary">
            <Download size={14} /> Download HTML
          </button>
          <button onClick={downloadJSON} className="btn-ghost border border-[#2a2a38]">
            <FileText size={14} /> Save Project (JSON)
          </button>
          <div className="flex-1" />
          <button onClick={copy} className="btn-ghost border border-[#2a2a38]">
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy Code"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2a38] px-6">
          {[
            { id: "html", label: "HTML File", icon: Globe },
            { id: "json", label: "Project JSON", icon: FileText },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors mr-2 ${
                tab === id ? "border-brand-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {/* Code */}
        <div className="flex-1 overflow-auto p-4 bg-zinc-950">
          <pre className="text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap break-all">{code}</pre>
        </div>

        {/* Footer note */}
        <div className="px-6 py-3 border-t border-[#2a2a38]">
          <p className="text-xs text-zinc-500">
            💡 The exported HTML is a complete, self-contained file. Host it on any web server, GitHub Pages, Netlify, or Vercel for free.
          </p>
        </div>
      </div>
    </div>
  );
}
