import { create } from "zustand";
import { v4 as uuid } from "uuid";

const defaultPages = [
  { id: "page-home",    name: "Home",    slug: "/",        isHome: true },
  { id: "page-about",   name: "About",   slug: "/about"   },
  { id: "page-contact", name: "Contact", slug: "/contact" },
];

const defaultElements = {
  "page-home": [
    {
      id: uuid(),
      type: "hero",
      props: {
        title: "Build Beautiful Websites",
        subtitle: "No code required. Drag, drop, and publish in minutes.",
        buttonText: "Get Started Free",
        buttonLink: "#",
        bgColor: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
        textColor: "#ffffff",
        height: "500px",
        align: "center",
      },
    },
    {
      id: uuid(),
      type: "features",
      props: {
        title: "Everything You Need",
        subtitle: "Powerful tools made simple",
        bgColor: "#ffffff",
        textColor: "#1a1a2e",
        features: [
          { icon: "⚡", title: "Lightning Fast",      desc: "Optimized for speed and performance." },
          { icon: "🎨", title: "Fully Customizable",  desc: "Change colors, fonts, and layouts easily." },
          { icon: "📱", title: "Mobile Responsive",   desc: "Looks great on all screen sizes." },
        ],
      },
    },
  ],
  "page-about":   [],
  "page-contact": [],
};

export const useStore = create((set, get) => ({
  // ── Pages ──────────────────────────────────────────────────
  pages: defaultPages,
  currentPageId: "page-home",

  // ── Elements ───────────────────────────────────────────────
  elements: defaultElements,

  // ── Selection ──────────────────────────────────────────────
  selectedElementId: null,

  // ── UI ─────────────────────────────────────────────────────
  previewMode:        false,
  viewportSize:       "desktop",
  showGrid:           false,
  zoom:               1,
  showAIPanel:        false,
  showExportModal:    false,
  showTemplatesModal: false,
  isAIGenerating:     false,
  aiError:            null,

  // ── History ────────────────────────────────────────────────
  history:      [],
  historyIndex: -1,

  // ── Site meta ──────────────────────────────────────────────
  siteMeta: {
    name:         "My Website",
    favicon:      "🌐",
    primaryColor: "#6366f1",
    font:         "Inter",
  },

  // ── Page actions ───────────────────────────────────────────
  setCurrentPage: (id) => set({ currentPageId: id, selectedElementId: null }),

  addPage: () => {
    const id   = "page-" + uuid().slice(0, 8);
    const name = "New Page";
    set((s) => ({
      pages:    [...s.pages, { id, name, slug: "/" + name.toLowerCase().replace(/ /g, "-") }],
      elements: { ...s.elements, [id]: [] },
    }));
  },

  renamePage: (id, name) =>
    set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, name } : p)) })),

  deletePage: (id) =>
    set((s) => {
      const pages    = s.pages.filter((p) => p.id !== id);
      const elements = { ...s.elements };
      delete elements[id];
      return { pages, elements, currentPageId: pages[0]?.id || null };
    }),

  // ── Element actions ────────────────────────────────────────
  currentElements: () => get().elements[get().currentPageId] || [],

  addElement: (type, props = {}) => {
    const el = { id: uuid(), type, props: { ...defaultProps(type), ...props } };
    set((s) => {
      const pageEls = [...(s.elements[s.currentPageId] || []), el];
      return {
        elements:          { ...s.elements, [s.currentPageId]: pageEls },
        selectedElementId: el.id,
      };
    });
    get().pushHistory();
  },

  updateElement: (id, props) => {
    set((s) => {
      const pageEls = (s.elements[s.currentPageId] || []).map((el) =>
        el.id === id ? { ...el, props: { ...el.props, ...props } } : el
      );
      return { elements: { ...s.elements, [s.currentPageId]: pageEls } };
    });
  },

  deleteElement: (id) => {
    set((s) => {
      const pageEls = (s.elements[s.currentPageId] || []).filter((el) => el.id !== id);
      return {
        elements:          { ...s.elements, [s.currentPageId]: pageEls },
        selectedElementId: s.selectedElementId === id ? null : s.selectedElementId,
      };
    });
    get().pushHistory();
  },

  duplicateElement: (id) => {
    const el = (get().elements[get().currentPageId] || []).find((e) => e.id === id);
    if (!el) return;
    const newEl = { ...el, id: uuid() };
    set((s) => {
      const pageEls = [...(s.elements[s.currentPageId] || [])];
      const idx     = pageEls.findIndex((e) => e.id === id);
      pageEls.splice(idx + 1, 0, newEl);
      return { elements: { ...s.elements, [s.currentPageId]: pageEls }, selectedElementId: newEl.id };
    });
  },

  moveElement: (id, direction) => {
    set((s) => {
      const pageEls = [...(s.elements[s.currentPageId] || [])];
      const idx     = pageEls.findIndex((e) => e.id === id);
      const newIdx  = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= pageEls.length) return {};
      [pageEls[idx], pageEls[newIdx]] = [pageEls[newIdx], pageEls[idx]];
      return { elements: { ...s.elements, [s.currentPageId]: pageEls } };
    });
  },

  reorderElements: (newOrder) => {
    set((s) => ({ elements: { ...s.elements, [s.currentPageId]: newOrder } }));
  },

  // ── Selection ──────────────────────────────────────────────
  selectElement:  (id) => set({ selectedElementId: id }),
  clearSelection: ()   => set({ selectedElementId: null }),

  // ── UI actions ─────────────────────────────────────────────
  setPreviewMode:        (v) => set({ previewMode: v, selectedElementId: null }),
  setViewportSize:       (v) => set({ viewportSize: v }),
  toggleGrid:            ()  => set((s) => ({ showGrid: !s.showGrid })),
  setZoom:               (v) => set({ zoom: v }),
  setShowAIPanel:        (v) => set({ showAIPanel: v }),
  setShowExportModal:    (v) => set({ showExportModal: v }),
  setShowTemplatesModal: (v) => set({ showTemplatesModal: v }),

  // ── History ────────────────────────────────────────────────
  pushHistory: () => {
    const { elements, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(elements)));
    set({ history: newHistory.slice(-50), historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    set({ elements: JSON.parse(JSON.stringify(history[historyIndex - 1])), historyIndex: historyIndex - 1 });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    set({ elements: JSON.parse(JSON.stringify(history[historyIndex + 1])), historyIndex: historyIndex + 1 });
  },

  // ── AI ─────────────────────────────────────────────────────
  setAIGenerating: (v) => set({ isAIGenerating: v }),
  setAIError:      (v) => set({ aiError: v }),

  generateWithAI: async (prompt) => {
    const store = get();
    store.setAIGenerating(true);
    store.setAIError(null);
    try {
      const systemPrompt = `You are a website builder AI. Given a user's description, generate website sections as JSON.
Return ONLY a JSON array of elements. Each element: { "type": string, "props": object }
Types: hero, features, text, cta, testimonials, pricing, gallery, contact, stats, faq, team, navbar, footer
Hero props: title, subtitle, buttonText, buttonLink, bgColor, textColor, height
Features props: title, subtitle, features (array of {icon, title, desc}), bgColor, textColor
CTA props: title, subtitle, buttonText, bgColor, textColor, buttonColor
Testimonials props: title, testimonials (array of {name, role, text, avatar})
Pricing props: title, plans (array of {name, price, period, features[], highlighted})
Stats props: title, stats (array of {value, label, icon}), bgColor, textColor
FAQ props: title, faqs (array of {q, a})
Footer props: brand, tagline, links (array of {label, href})
Generate 4-7 sections based on the prompt. Make content professional and relevant.`;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data      = await response.json();
      const text      = data.content?.map((c) => c.text || "").join("") || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No valid JSON returned");
      const sections = JSON.parse(jsonMatch[0]);
      const withIds  = sections.map((s) => ({ ...s, id: uuid() }));
      set((state) => ({
        elements:          { ...state.elements, [state.currentPageId]: withIds },
        selectedElementId: null,
        showAIPanel:       false,
      }));
    } catch (err) {
      store.setAIError(err.message || "AI generation failed");
    } finally {
      store.setAIGenerating(false);
    }
  },

  // ── Site meta ──────────────────────────────────────────────
  updateSiteMeta: (meta) => set((s) => ({ siteMeta: { ...s.siteMeta, ...meta } })),

  // ── Templates ──────────────────────────────────────────────
  applyTemplate: (templateElements) => {
    const withIds = templateElements.map((e) => ({ ...e, id: uuid() }));
    set((s) => ({
      elements:          { ...s.elements, [s.currentPageId]: withIds },
      selectedElementId: null,
    }));
  },
}));

// ── Default props per block type ───────────────────────────────────────────────
function defaultProps(type) {
  const map = {
    hero: {
      title: "Welcome to Your Website",
      subtitle: "Start building something amazing today.",
      buttonText: "Get Started",
      buttonLink: "#",
      bgColor: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
      textColor: "#ffffff",
      height: "500px",
      align: "center",
    },
    text: {
      content: "<h2>Your Title Here</h2><p>Add your content here. Click to edit this text block.</p>",
      bgColor: "#ffffff", textColor: "#1a1a2e", padding: "60px", align: "left", maxWidth: "800px",
    },
    image: {
      src: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80",
      alt: "Beautiful landscape", caption: "", fit: "cover", height: "400px", borderRadius: "0px",
    },
    features: {
      title: "Our Features", subtitle: "Everything you need to succeed",
      bgColor: "#f8fafc", textColor: "#1a1a2e",
      features: [
        { icon: "🚀", title: "Fast & Reliable",  desc: "Built for speed and performance at scale." },
        { icon: "🔒", title: "Secure by Default", desc: "Enterprise-grade security built in." },
        { icon: "💡", title: "Smart & Simple",   desc: "Intuitive design that anyone can use." },
      ],
    },
    cta: {
      title: "Ready to Get Started?", subtitle: "Join thousands of satisfied customers today.",
      buttonText: "Start Free Trial", bgColor: "#6366f1", textColor: "#ffffff", buttonColor: "#ffffff",
    },
    testimonials: {
      title: "What Our Customers Say", bgColor: "#ffffff", textColor: "#1a1a2e",
      testimonials: [
        { name: "Sarah Johnson", role: "CEO, TechCorp",      text: "This product transformed our business completely. Highly recommend!", avatar: "SJ" },
        { name: "Mike Chen",     role: "Designer",           text: "The best tool I've used in years. Incredibly powerful and easy to use.",  avatar: "MC" },
        { name: "Emma Davis",    role: "Marketing Lead",     text: "Our team's productivity doubled since we started using this.",           avatar: "ED" },
      ],
    },
    pricing: {
      title: "Simple, Transparent Pricing", bgColor: "#f8fafc", textColor: "#1a1a2e",
      plans: [
        { name: "Starter",  price: "Free", period: "",       features: ["5 pages", "Basic templates", "Community support"],                                                           highlighted: false },
        { name: "Pro",      price: "$29",  period: "/month", features: ["Unlimited pages", "AI generation", "Priority support", "Custom domain", "Analytics"],                        highlighted: true  },
        { name: "Business", price: "$79",  period: "/month", features: ["Everything in Pro", "Team collaboration", "White labeling", "API access", "Custom integrations"],            highlighted: false },
      ],
    },
    stats: {
      title: "Numbers That Speak", bgColor: "#6366f1", textColor: "#ffffff",
      stats: [
        { value: "50K+", label: "Happy Users",    icon: "👥" },
        { value: "99.9%", label: "Uptime",        icon: "⚡" },
        { value: "4.9★", label: "Avg. Rating",    icon: "⭐" },
        { value: "24/7",  label: "Support",       icon: "🛟" },
      ],
    },
    faq: {
      title: "Frequently Asked Questions", bgColor: "#ffffff", textColor: "#1a1a2e",
      faqs: [
        { q: "How do I get started?",     a: "Simply sign up and start building with our drag-and-drop editor." },
        { q: "Can I use my own domain?",  a: "Yes! You can connect your custom domain with any paid plan." },
        { q: "Is there a free plan?",     a: "Yes, we offer a free plan with up to 5 pages." },
      ],
    },
    contact: {
      title: "Get In Touch", subtitle: "We'd love to hear from you.",
      bgColor: "#f8fafc", textColor: "#1a1a2e",
      email: "hello@example.com", phone: "+1 (555) 123-4567", address: "123 Main Street, San Francisco, CA",
    },
    video: {
      url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      title: "Watch Our Demo", bgColor: "#000000", height: "500px",
    },
    gallery: {
      title: "Our Gallery", bgColor: "#ffffff",
      images: [
        { src: "https://images.unsplash.com/photo-1481277542470-605612bd2d61?w=600&q=80", alt: "Gallery 1" },
        { src: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&q=80", alt: "Gallery 2" },
        { src: "https://images.unsplash.com/photo-1486304873000-235643847519?w=600&q=80", alt: "Gallery 3" },
        { src: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&q=80", alt: "Gallery 4" },
      ],
    },
    team: {
      title: "Meet Our Team", bgColor: "#f8fafc", textColor: "#1a1a2e",
      members: [
        { name: "Alex Rivera",  role: "CEO & Founder",  avatar: "AR", bio: "Visionary leader with 10+ years in tech." },
        { name: "Jordan Lee",   role: "Head of Design", avatar: "JL", bio: "Award-winning designer passionate about UX." },
        { name: "Sam Taylor",   role: "Lead Engineer",  avatar: "ST", bio: "Full-stack engineer building the future." },
      ],
    },
    navbar: {
      brand: "MyBrand", bgColor: "#ffffff", textColor: "#1a1a2e",
      links: [
        { label: "Home",     href: "/" },
        { label: "About",    href: "/about" },
        { label: "Services", href: "/services" },
        { label: "Contact",  href: "/contact" },
      ],
      ctaText: "Get Started",
    },
    footer: {
      brand: "MyBrand", tagline: "Building the future, one line at a time.",
      bgColor: "#1a1a2e", textColor: "#ffffff",
      links: [
        { label: "Privacy Policy",   href: "#" },
        { label: "Terms of Service", href: "#" },
        { label: "Contact",          href: "#" },
      ],
    },
  };
  return map[type] || {};
}
