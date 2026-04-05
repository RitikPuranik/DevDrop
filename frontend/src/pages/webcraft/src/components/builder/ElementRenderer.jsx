import React, { useState } from "react";

export default function ElementRenderer({ element }) {
  const { type, props } = element;

  const renderers = {
    hero:         HeroBlock,
    text:         TextBlock,
    image:        ImageBlock,
    features:     FeaturesBlock,
    cta:          CTABlock,
    testimonials: TestimonialsBlock,
    pricing:      PricingBlock,
    stats:        StatsBlock,
    faq:          FAQBlock,
    contact:      ContactBlock,
    video:        VideoBlock,
    gallery:      GalleryBlock,
    team:         TeamBlock,
    navbar:       NavbarBlock,
    footer:       FooterBlock,
  };

  const Comp = renderers[type];
  if (!Comp) return (
    <div className="p-8 bg-gray-100 text-gray-400 text-center text-sm">
      Unknown block: <code>{type}</code>
    </div>
  );
  return <Comp {...props} />;
}

/* ── NAVBAR ────────────────────────────────────────────────── */
function NavbarBlock({ brand, bgColor, textColor, links = [], ctaText }) {
  return (
    <nav
      className="px-8 py-4 flex items-center justify-between"
      style={{ background: bgColor || "#fff", color: textColor || "#1a1a2e", borderBottom: "1px solid rgba(0,0,0,0.08)" }}
    >
      <div className="font-extrabold text-xl">{brand || "MyBrand"}</div>
      <div className="hidden md:flex items-center gap-6">
        {links.map((l, i) => (
          <a key={i} href={l.href} className="text-sm hover:opacity-60 transition-opacity">{l.label}</a>
        ))}
      </div>
      {ctaText && (
        <a href="#" className="px-5 py-2 bg-amber-100 text-black rounded-lg text-sm font-semibold hover:bg-amber-100/90 transition-colors">
          {ctaText}
        </a>
      )}
    </nav>
  );
}

/* ── HERO ──────────────────────────────────────────────────── */
function HeroBlock({ title, subtitle, buttonText, buttonLink, bgColor, textColor, height, align }) {
  return (
    <section
      style={{ background: bgColor, color: textColor, minHeight: height || "500px" }}
      className="flex items-center justify-center px-8 py-20"
    >
      <div style={{ textAlign: align || "center" }} className="max-w-3xl w-full">
        <h1 className="text-5xl font-extrabold mb-5 leading-tight">{title}</h1>
        <p className="text-xl mb-8 opacity-80 leading-relaxed">{subtitle}</p>
        {buttonText && (
          <a
            href={buttonLink || "#"}
            className="inline-block px-8 py-4 rounded-xl font-bold text-lg transition-all hover:opacity-90 hover:-translate-y-0.5"
            style={{ background: "rgba(255,255,255,0.2)", color: textColor, border: "2px solid rgba(255,255,255,0.4)", backdropFilter: "blur(8px)" }}
          >
            {buttonText}
          </a>
        )}
      </div>
    </section>
  );
}

/* ── TEXT ──────────────────────────────────────────────────── */
function TextBlock({ content, bgColor, textColor, padding, align, maxWidth }) {
  return (
    <section style={{ background: bgColor || "#fff", color: textColor || "#1a1a2e", padding: padding || "60px" }}>
      <div
        style={{ maxWidth: maxWidth || "800px", margin: "0 auto", textAlign: align || "left" }}
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </section>
  );
}

/* ── IMAGE ─────────────────────────────────────────────────── */
function ImageBlock({ src, alt, caption, fit, height, borderRadius }) {
  return (
    <section>
      <img
        src={src}
        alt={alt || ""}
        style={{ width: "100%", height: height || "400px", objectFit: fit || "cover", borderRadius: borderRadius || "0" }}
      />
      {caption && <p className="text-center text-sm text-gray-500 py-3 bg-white">{caption}</p>}
    </section>
  );
}

/* ── FEATURES ──────────────────────────────────────────────── */
function FeaturesBlock({ title, subtitle, features = [], bgColor, textColor }) {
  return (
    <section style={{ background: bgColor || "#f8fafc", color: textColor || "#1a1a2e" }} className="px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">{title}</h2>
          {subtitle && <p className="text-lg opacity-70">{subtitle}</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <div key={i} className="text-center p-6 rounded-2xl" style={{ background: "rgba(0,0,0,0.04)" }}>
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="text-xl font-bold mb-2">{f.title}</h3>
              <p className="opacity-70 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA ───────────────────────────────────────────────────── */
function CTABlock({ title, subtitle, buttonText, bgColor, textColor, buttonColor }) {
  return (
    <section style={{ background: bgColor || "#6366f1", color: textColor || "#fff" }} className="px-8 py-20 text-center">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-4xl font-extrabold mb-4">{title}</h2>
        {subtitle && <p className="text-lg opacity-85 mb-8">{subtitle}</p>}
        <a
          href="#"
          className="inline-block px-10 py-4 rounded-xl font-bold text-lg transition-all hover:opacity-90 hover:-translate-y-0.5"
          style={{ background: buttonColor || "#fff", color: bgColor || "#6366f1" }}
        >
          {buttonText}
        </a>
      </div>
    </section>
  );
}

/* ── TESTIMONIALS ──────────────────────────────────────────── */
function TestimonialsBlock({ title, testimonials = [], bgColor, textColor }) {
  return (
    <section style={{ background: bgColor || "#fff", color: textColor || "#1a1a2e" }} className="px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div key={i} className="p-6 rounded-2xl border" style={{ borderColor: "rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)" }}>
              <p className="opacity-80 mb-6 italic text-sm leading-relaxed">"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: `hsl(${i * 120}, 55%, 50%)` }}
                >
                  {t.avatar || t.name?.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-sm">{t.name}</div>
                  <div className="text-xs opacity-50">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── PRICING ───────────────────────────────────────────────── */
function PricingBlock({ title, plans = [], bgColor, textColor }) {
  return (
    <section style={{ background: bgColor || "#f8fafc", color: textColor || "#1a1a2e" }} className="px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <div
              key={i}
              className="p-8 rounded-2xl border-2 transition-transform hover:-translate-y-1 duration-200"
              style={{
                background: plan.highlighted ? "#6366f1" : "#fff",
                color: plan.highlighted ? "#fff" : textColor,
                borderColor: plan.highlighted ? "#6366f1" : "rgba(0,0,0,0.1)",
              }}
            >
              {plan.highlighted && (
                <div className="text-xs font-bold uppercase tracking-wider bg-white/20 text-white px-2 py-1 rounded-full inline-block mb-3">
                  Most Popular
                </div>
              )}
              <div className="text-sm font-bold uppercase tracking-wider opacity-70 mb-2">{plan.name}</div>
              <div className="text-4xl font-extrabold mb-1">{plan.price}</div>
              <div className="text-sm opacity-60 mb-6">{plan.period || "forever"}</div>
              <ul className="space-y-2 mb-8">
                {(plan.features || []).map((f, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm">
                    <span style={{ color: plan.highlighted ? "#a5f3fc" : "#22c55e" }} className="font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
              <a
                href="#"
                className="block text-center py-3 rounded-xl font-bold transition-colors"
                style={{ background: plan.highlighted ? "rgba(255,255,255,0.2)" : "#6366f1", color: "#fff" }}
              >
                Get Started
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── STATS ─────────────────────────────────────────────────── */
function StatsBlock({ title, stats = [], bgColor, textColor }) {
  return (
    <section style={{ background: bgColor || "#6366f1", color: textColor || "#fff" }} className="px-8 py-16">
      <div className="max-w-4xl mx-auto text-center">
        {title && <h2 className="text-2xl font-bold mb-10">{title}</h2>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <div key={i}>
              <div className="text-3xl mb-2">{s.icon}</div>
              <div className="text-4xl font-extrabold mb-1">{s.value}</div>
              <div className="opacity-75 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ───────────────────────────────────────────────────── */
function FAQBlock({ title, faqs = [], bgColor, textColor }) {
  const [open, setOpen] = useState(null);
  return (
    <section style={{ background: bgColor || "#fff", color: textColor || "#1a1a2e" }} className="px-8 py-16">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-10">{title}</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="border rounded-xl overflow-hidden" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left font-semibold hover:bg-black/5 transition-colors text-sm"
              >
                {f.q}
                <span className="text-xl ml-4 shrink-0">{open === i ? "−" : "+"}</span>
              </button>
              {open === i && (
                <div className="px-5 pb-5 opacity-70 text-sm leading-relaxed">{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CONTACT ───────────────────────────────────────────────── */
function ContactBlock({ title, subtitle, bgColor, textColor, email, phone, address }) {
  return (
    <section style={{ background: bgColor || "#f8fafc", color: textColor || "#1a1a2e" }} className="px-8 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-3">{title}</h2>
          {subtitle && <p className="opacity-70 text-lg">{subtitle}</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-4 text-sm">
            {email   && <div className="flex items-center gap-3"><span className="text-2xl">✉️</span><a href={`mailto:${email}`} className="text-indigo-600 hover:underline">{email}</a></div>}
            {phone   && <div className="flex items-center gap-3"><span className="text-2xl">📞</span><span>{phone}</span></div>}
            {address && <div className="flex items-center gap-3"><span className="text-2xl">📍</span><span>{address}</span></div>}
          </div>
          <div className="space-y-3">
            <input className="w-full border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-300" style={{ borderColor: "rgba(0,0,0,0.15)" }} placeholder="Your Name" />
            <input type="email" className="w-full border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-300" style={{ borderColor: "rgba(0,0,0,0.15)" }} placeholder="Email Address" />
            <textarea className="w-full border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-300 resize-none" rows={4} style={{ borderColor: "rgba(0,0,0,0.15)" }} placeholder="Your Message" />
            <button type="button" className="w-full bg-amber-100 hover:bg-amber-100/90 text-black py-3 rounded-xl font-bold transition-colors text-sm">Send Message</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── VIDEO ─────────────────────────────────────────────────── */
function VideoBlock({ url, title, bgColor, height }) {
  return (
    <section style={{ background: bgColor || "#000" }} className="px-8 py-12">
      <div className="max-w-4xl mx-auto">
        {title && <h2 className="text-2xl font-bold text-white text-center mb-6">{title}</h2>}
        <div className="rounded-2xl overflow-hidden" style={{ height: height || "400px" }}>
          <iframe src={url} title={title} width="100%" height="100%" frameBorder="0" allowFullScreen />
        </div>
      </div>
    </section>
  );
}

/* ── GALLERY ───────────────────────────────────────────────── */
function GalleryBlock({ title, images = [], bgColor }) {
  return (
    <section style={{ background: bgColor || "#fff" }} className="px-8 py-16">
      <div className="max-w-5xl mx-auto">
        {title && <h2 className="text-3xl font-bold text-center mb-10">{title}</h2>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {images.map((img, i) => (
            <div key={i} className="aspect-square overflow-hidden rounded-xl hover:scale-105 transition-transform duration-300">
              <img src={img.src} alt={img.alt || ""} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── TEAM ──────────────────────────────────────────────────── */
function TeamBlock({ title, members = [], bgColor, textColor }) {
  return (
    <section style={{ background: bgColor || "#f8fafc", color: textColor || "#1a1a2e" }} className="px-8 py-16">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {members.map((m, i) => (
            <div key={i} className="text-center p-6 rounded-2xl bg-white shadow-sm">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-xl font-bold text-white"
                style={{ background: `hsl(${i * 120}, 55%, 50%)` }}
              >
                {m.avatar || m.name?.slice(0, 2).toUpperCase()}
              </div>
              <div className="font-bold text-lg">{m.name}</div>
              <div className="text-amber-400text-sm mb-2">{m.role}</div>
              <p className="text-sm opacity-60">{m.bio}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FOOTER ────────────────────────────────────────────────── */
function FooterBlock({ brand, tagline, bgColor, textColor, links = [] }) {
  return (
    <footer style={{ background: bgColor || "#1a1a2e", color: textColor || "#fff" }} className="px-8 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between gap-8 mb-8">
          <div>
            <div className="font-extrabold text-xl mb-2">{brand || "MyBrand"}</div>
            {tagline && <p className="opacity-50 text-sm max-w-xs leading-relaxed">{tagline}</p>}
          </div>
          <div className="flex flex-wrap gap-6">
            {links.map((l, i) => (
              <a key={i} href={l.href} className="text-sm opacity-50 hover:opacity-100 transition-opacity">{l.label}</a>
            ))}
          </div>
        </div>
        <div className="border-t pt-6 text-center text-xs opacity-30" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          © {new Date().getFullYear()} {brand}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
