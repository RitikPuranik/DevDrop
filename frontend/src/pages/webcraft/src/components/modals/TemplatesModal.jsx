import React, { useState } from "react";
import { X, Check } from "lucide-react";
import { useStore } from "../../store/useStore.js";
import toast from "react-hot-toast";

const TEMPLATES = [
  {
    id: "saas",
    name: "SaaS Landing",
    category: "Business",
    preview: "🚀",
    description: "Modern SaaS product page with hero, features, pricing & CTA",
    elements: [
      { type: "navbar", props: { brand: "SaaSPro", bgColor: "#ffffff", textColor: "#1a1a2e", links: [{ label: "Features", href: "#" }, { label: "Pricing", href: "#" }, { label: "Blog", href: "#" }], ctaText: "Start Free Trial" } },
      { type: "hero", props: { title: "Ship Products 10x Faster", subtitle: "The all-in-one platform for modern development teams. Collaborate, build, and deploy in minutes.", buttonText: "Start Free Trial →", buttonLink: "#", bgColor: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", textColor: "#ffffff", height: "580px", align: "center" } },
      { type: "stats", props: { title: "Trusted by Teams Worldwide", bgColor: "#6366f1", textColor: "#ffffff", stats: [{ value: "50K+", label: "Teams", icon: "👥" }, { value: "99.9%", label: "Uptime", icon: "⚡" }, { value: "4.9★", label: "Rating", icon: "⭐" }, { value: "$2M+", label: "Saved", icon: "💰" }] } },
      { type: "features", props: { title: "Everything Your Team Needs", subtitle: "Powerful features that scale with your business", bgColor: "#f8fafc", textColor: "#1a1a2e", features: [{ icon: "⚡", title: "Lightning Deploy", desc: "Ship to production in seconds with one-click deployments." }, { icon: "🔒", title: "Enterprise Security", desc: "SOC2 compliant with end-to-end encryption built in." }, { icon: "📊", title: "Real-time Analytics", desc: "Monitor performance with beautiful dashboards." }] } },
      { type: "pricing", props: { title: "Simple, Transparent Pricing", bgColor: "#ffffff", textColor: "#1a1a2e", plans: [{ name: "Starter", price: "Free", period: "", features: ["5 projects", "3 team members", "Basic analytics", "Community support"], highlighted: false }, { name: "Pro", price: "$29", period: "/month", features: ["Unlimited projects", "25 team members", "Advanced analytics", "Priority support", "Custom domains"], highlighted: true }, { name: "Enterprise", price: "$99", period: "/month", features: ["Everything in Pro", "Unlimited members", "SLA guarantee", "Dedicated support", "SSO & SAML"], highlighted: false }] } },
      { type: "testimonials", props: { title: "Loved by Developers", bgColor: "#f8fafc", textColor: "#1a1a2e", testimonials: [{ name: "Alex Chen", role: "CTO, StartupXYZ", text: "SaaSPro cut our deployment time from hours to minutes. Game-changer.", avatar: "AC" }, { name: "Maria Rodriguez", role: "Lead Dev, TechCorp", text: "The best developer tooling I've used. Our team productivity doubled.", avatar: "MR" }, { name: "James Wilson", role: "Founder, CloudBase", text: "Finally, a platform that actually works as advertised. Love it.", avatar: "JW" }] } },
      { type: "cta", props: { title: "Ready to Ship Faster?", subtitle: "Join 50,000+ teams already using SaaSPro. No credit card required.", buttonText: "Get Started Free", bgColor: "#6366f1", textColor: "#ffffff", buttonColor: "#ffffff" } },
      { type: "footer", props: { brand: "SaaSPro", tagline: "The platform that helps teams build and deploy faster.", bgColor: "#0f0f13", textColor: "#ffffff", links: [{ label: "Privacy", href: "#" }, { label: "Terms", href: "#" }, { label: "Blog", href: "#" }, { label: "Docs", href: "#" }] } },
    ],
  },
  {
    id: "portfolio",
    name: "Creative Portfolio",
    category: "Personal",
    preview: "🎨",
    description: "Stunning portfolio for designers, developers & creatives",
    elements: [
      { type: "navbar", props: { brand: "Jane Doe", bgColor: "#0f0f13", textColor: "#ffffff", links: [{ label: "Work", href: "#" }, { label: "About", href: "#" }, { label: "Contact", href: "#" }], ctaText: "Hire Me" } },
      { type: "hero", props: { title: "I Design Digital Experiences", subtitle: "Senior UX Designer & Creative Director crafting beautiful products for startups and Fortune 500 companies.", buttonText: "View My Work ↓", buttonLink: "#", bgColor: "linear-gradient(135deg, #0f0f13 0%, #1a1a2e 100%)", textColor: "#ffffff", height: "600px", align: "left" } },
      { type: "gallery", props: { title: "Selected Work", bgColor: "#f8fafc", images: [{ src: "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&q=80", alt: "Project 1" }, { src: "https://images.unsplash.com/photo-1545665225-b23b99e4d45e?w=600&q=80", alt: "Project 2" }, { src: "https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=600&q=80", alt: "Project 3" }, { src: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&q=80", alt: "Project 4" }] } },
      { type: "features", props: { title: "What I Do", subtitle: "End-to-end design services", bgColor: "#ffffff", textColor: "#1a1a2e", features: [{ icon: "🎨", title: "UI/UX Design", desc: "User-centered designs that convert visitors into customers." }, { icon: "💻", title: "Frontend Dev", desc: "Pixel-perfect implementation of designs using modern tech." }, { icon: "📱", title: "Mobile Apps", desc: "Beautiful native and cross-platform mobile experiences." }] } },
      { type: "testimonials", props: { title: "Client Reviews", bgColor: "#f8fafc", textColor: "#1a1a2e", testimonials: [{ name: "Sarah K.", role: "CEO, DesignCo", text: "Jane's work is simply outstanding. She delivered beyond expectations.", avatar: "SK" }, { name: "Tom H.", role: "Product Lead", text: "The most talented designer I've worked with in 10 years.", avatar: "TH" }, { name: "Lisa M.", role: "Founder", text: "Jane transformed our brand completely. Highly recommend!", avatar: "LM" }] } },
      { type: "contact", props: { title: "Let's Work Together", subtitle: "Available for freelance projects and full-time opportunities", bgColor: "#0f0f13", textColor: "#ffffff", email: "jane@portfolio.com", phone: "+1 (555) 987-6543" } },
    ],
  },
  {
    id: "restaurant",
    name: "Restaurant",
    category: "Food & Drink",
    preview: "🍽️",
    description: "Elegant restaurant website with menu and reservations",
    elements: [
      { type: "navbar", props: { brand: "La Maison", bgColor: "#1a0a00", textColor: "#f5e6d0", links: [{ label: "Menu", href: "#" }, { label: "About", href: "#" }, { label: "Reservations", href: "#" }], ctaText: "Book a Table" } },
      { type: "hero", props: { title: "A Culinary Journey", subtitle: "Experience the finest French cuisine crafted with passion, seasonal ingredients, and decades of tradition.", buttonText: "Make a Reservation", buttonLink: "#", bgColor: "linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url('https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1400&q=80')", textColor: "#ffffff", height: "600px", align: "center" } },
      { type: "features", props: { title: "Our Story", subtitle: "Serving excellence since 1987", bgColor: "#fffbf5", textColor: "#2d1a0a", features: [{ icon: "👨‍🍳", title: "Master Chefs", desc: "Our culinary team trained under Michelin-starred mentors worldwide." }, { icon: "🌿", title: "Farm to Table", desc: "Fresh, seasonal ingredients sourced directly from local farms daily." }, { icon: "🍷", title: "Curated Wines", desc: "An award-winning cellar of over 500 fine wines from around the world." }] } },
      { type: "gallery", props: { title: "From Our Kitchen", bgColor: "#ffffff", images: [{ src: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80", alt: "Dish 1" }, { src: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80", alt: "Dish 2" }, { src: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80", alt: "Dish 3" }, { src: "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=600&q=80", alt: "Dish 4" }] } },
      { type: "contact", props: { title: "Reserve Your Table", subtitle: "We look forward to welcoming you", bgColor: "#1a0a00", textColor: "#f5e6d0", email: "reservations@lamaison.com", phone: "+1 (555) 234-5678", address: "123 Rue de Paris, New York, NY" } },
      { type: "footer", props: { brand: "La Maison", tagline: "Fine French Cuisine since 1987", bgColor: "#0d0500", textColor: "#f5e6d0", links: [{ label: "Menu", href: "#" }, { label: "Private Events", href: "#" }, { label: "Gift Cards", href: "#" }] } },
    ],
  },
  {
    id: "startup",
    name: "Tech Startup",
    category: "Business",
    preview: "💡",
    description: "Bold dark-themed startup landing page",
    elements: [
      { type: "navbar", props: { brand: "NeuralBase", bgColor: "#050510", textColor: "#ffffff", links: [{ label: "Product", href: "#" }, { label: "Pricing", href: "#" }, { label: "Docs", href: "#" }], ctaText: "Try Free" } },
      { type: "hero", props: { title: "AI Infrastructure for the Modern Web", subtitle: "Build intelligent applications 10x faster with our managed AI APIs. No PhD required.", buttonText: "Get API Key Free", buttonLink: "#", bgColor: "linear-gradient(135deg, #050510 0%, #1a0a3e 50%, #050510 100%)", textColor: "#ffffff", height: "620px", align: "center" } },
      { type: "stats", props: { bgColor: "#0a0520", textColor: "#ffffff", stats: [{ value: "1B+", label: "API Calls/day", icon: "⚡" }, { value: "150ms", label: "Avg. Latency", icon: "🚀" }, { value: "99.99%", label: "SLA Uptime", icon: "🛡️" }, { value: "10K+", label: "Developers", icon: "👾" }] } },
      { type: "features", props: { title: "Powerful. Simple. Fast.", bgColor: "#050510", textColor: "#ffffff", features: [{ icon: "🧠", title: "State-of-the-Art Models", desc: "Access GPT-4, Claude, Gemini, and more through a single unified API." }, { icon: "⚡", title: "Edge Inference", desc: "Run models at the edge for ultra-low latency in 50+ regions." }, { icon: "🔧", title: "One-Line Integration", desc: "Integrate in minutes with SDKs for every major language and framework." }] } },
      { type: "pricing", props: { title: "Scale Without Surprises", bgColor: "#0a0520", textColor: "#ffffff", plans: [{ name: "Dev", price: "Free", period: "", features: ["1M tokens/mo", "3 models", "Community support", "Playground access"], highlighted: false }, { name: "Growth", price: "$49", period: "/month", features: ["50M tokens/mo", "All models", "Email support", "Analytics", "Webhooks"], highlighted: true }, { name: "Scale", price: "$199", period: "/month", features: ["Unlimited tokens", "Custom models", "24/7 support", "SLA", "Dedicated infra"], highlighted: false }] } },
      { type: "cta", props: { title: "Start Building Today", subtitle: "Free tier includes 1M tokens monthly. No credit card required.", buttonText: "Create Free Account", bgColor: "linear-gradient(135deg, #6366f1, #8b5cf6)", textColor: "#ffffff", buttonColor: "#ffffff" } },
      { type: "footer", props: { brand: "NeuralBase", tagline: "AI infrastructure for developers.", bgColor: "#020208", textColor: "#aaa", links: [{ label: "Docs", href: "#" }, { label: "Status", href: "#" }, { label: "Privacy", href: "#" }, { label: "Terms", href: "#" }] } },
    ],
  },
  {
    id: "agency",
    name: "Marketing Agency",
    category: "Business",
    preview: "📈",
    description: "Professional agency website to showcase services and results",
    elements: [
      { type: "navbar", props: { brand: "GrowthLab", bgColor: "#ffffff", textColor: "#1a1a2e", links: [{ label: "Services", href: "#" }, { label: "Work", href: "#" }, { label: "About", href: "#" }], ctaText: "Get a Quote" } },
      { type: "hero", props: { title: "We Grow Your Business Online", subtitle: "Data-driven marketing strategies that deliver measurable ROI. From SEO to paid ads, we do it all.", buttonText: "Book a Strategy Call", buttonLink: "#", bgColor: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)", textColor: "#ffffff", height: "520px", align: "left" } },
      { type: "stats", props: { bgColor: "#1a1a2e", textColor: "#ffffff", stats: [{ value: "300+", label: "Clients Served", icon: "🤝" }, { value: "$50M+", label: "Revenue Generated", icon: "💰" }, { value: "4.2x", label: "Avg. ROAS", icon: "📈" }, { value: "8yr", label: "In Business", icon: "🏆" }] } },
      { type: "features", props: { title: "Full-Service Digital Marketing", bgColor: "#f8fafc", textColor: "#1a1a2e", features: [{ icon: "🔍", title: "SEO & Content", desc: "Rank higher, drive organic traffic, and build lasting authority." }, { icon: "📢", title: "Paid Advertising", desc: "Maximize ROI with precision-targeted Google and Meta campaigns." }, { icon: "📱", title: "Social Media", desc: "Build an engaged community and convert followers into customers." }] } },
      { type: "testimonials", props: { title: "Real Results from Real Clients", bgColor: "#ffffff", textColor: "#1a1a2e", testimonials: [{ name: "David Park", role: "CMO, RetailBrand", text: "GrowthLab tripled our organic traffic in just 6 months. Incredible results.", avatar: "DP" }, { name: "Emma Stone", role: "CEO, EcomStore", text: "Their paid ads strategy brought our CPA down by 60%. Absolutely worth it.", avatar: "ES" }, { name: "Ryan Clark", role: "Founder, B2BApp", text: "Professional, data-driven, and results-focused. Best agency we've worked with.", avatar: "RC" }] } },
      { type: "cta", props: { title: "Ready to Grow?", subtitle: "Get a free 30-minute strategy session. No strings attached.", buttonText: "Book Free Strategy Call", bgColor: "#f97316", textColor: "#ffffff", buttonColor: "#ffffff" } },
      { type: "footer", props: { brand: "GrowthLab", tagline: "Data-driven growth for ambitious brands.", bgColor: "#1a1a2e", textColor: "#ffffff", links: [{ label: "Services", href: "#" }, { label: "Case Studies", href: "#" }, { label: "Contact", href: "#" }] } },
    ],
  },
  {
    id: "blank",
    name: "Blank Canvas",
    category: "Starter",
    preview: "◻️",
    description: "Start from scratch with an empty canvas",
    elements: [],
  },
];

const CATEGORIES = ["All", ...new Set(TEMPLATES.map((t) => t.category))];

export default function TemplatesModal() {
  const { setShowTemplatesModal, applyTemplate } = useStore();
  const [activeCategory, setActiveCategory] = useState("All");
  const [hovered, setHovered] = useState(null);

  const filtered = activeCategory === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.category === activeCategory);

  const apply = (template) => {
    applyTemplate(template.elements);
    setShowTemplatesModal(false);
    toast && import("react-hot-toast").then(({ default: t }) => t.success(`"${template.name}" template applied!`));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#16161e] border border-[#2a2a38] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl animate-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a38]">
          <div>
            <h2 className="text-lg font-bold text-white">Templates</h2>
            <p className="text-xs text-zinc-500">Choose a starting point for your page</p>
          </div>
          <button onClick={() => setShowTemplatesModal(false)} className="text-zinc-400 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Categories */}
        <div className="flex gap-2 px-6 py-3 border-b border-[#2a2a38] overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeCategory === cat ? "bg-amber-200 text-black" : "bg-white/5 text-zinc-400 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map((template) => (
              <div
                key={template.id}
                className="group relative bg-white/5 border border-[#2a2a38] rounded-xl overflow-hidden cursor-pointer hover:border-indigo-500 transition-all duration-200 hover:-translate-y-0.5"
                onMouseEnter={() => setHovered(template.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => apply(template)}
              >
                {/* Preview */}
                <div className="aspect-video bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center text-5xl">
                  {template.preview}
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-white">{template.name}</h3>
                    <span className="text-xs text-indigo-400 bg-indigo-600/20 px-2 py-0.5 rounded-full">{template.category}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{template.description}</p>
                </div>

                {/* Hover overlay */}
                {hovered === template.id && (
                  <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center">
                    <div className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 text-sm shadow-lg">
                      <Check size={14} /> Use Template
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
