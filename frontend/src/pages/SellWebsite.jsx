import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Upload, ArrowLeft, Loader2, Plus, X, ChevronDown } from 'lucide-react';
import { sellerAPI } from '../api/seller';
import { toast } from 'sonner';

const TECH_OPTIONS = {
  frontend: ['React', 'Vue', 'Angular', 'Next.js', 'Svelte', 'HTML/CSS', 'Tailwind', 'Bootstrap', 'Framer Motion', 'GSAP', 'Three.js'],
  backend: ['Node.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Laravel', 'Ruby on Rails'],
  database: ['MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Firebase', 'Supabase', 'SQLite'],
  devops: ['Docker', 'AWS', 'Vercel', 'Netlify', 'Heroku', 'GitHub Actions', 'CI/CD'],
};

export default function SellWebsite() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'free',
    price: 0,
    deployedUrl: '',
    githubUrl: '',
  });
  const [techStack, setTechStack] = useState({
    frontend: [],
    backend: [],
    database: [],
    devops: [],
  });
  const [openSection, setOpenSection] = useState('frontend');

  const isLoggedIn = !!localStorage.getItem('token');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'price' ? parseFloat(value) || 0 : value,
    }));
  };

  const toggleTech = (section, tech) => {
    setTechStack((prev) => ({
      ...prev,
      [section]: prev[section].includes(tech)
        ? prev[section].filter((t) => t !== tech)
        : [...prev[section], tech],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLoggedIn) { toast.error('Please login first'); return; }

    if (!form.name.trim() || !form.description.trim() || !form.deployedUrl.trim()) {
      toast.error('Please fill all required fields');
      return;
    }
    if (form.category !== 'free' && form.price <= 0) {
      toast.error('Paid/exclusive templates must have a price > 0');
      return;
    }

    try {
      setLoading(true);
      await sellerAPI.submitWebsite({
        ...form,
        price: form.category === 'free' ? 0 : form.price,
        techStack,
      });
      toast.success('Website submitted for review!');
      navigate('/profile');
    } catch (err) {
      const msg = err.response?.data?.message || 'Submission failed';
      if (err.response?.data?.requiresBankDetails) {
        toast.error('Please add bank details before listing a paid website');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#e8e2d6] pt-28 pb-20 px-6 antialiased">
      <div className="max-w-3xl mx-auto">

        {/* ── BACK ── */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/30 hover:text-white text-xs font-bold uppercase tracking-[0.2em] mb-10 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </motion.button>

        {/* ── HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
            Sell a <span className="font-serif italic text-[#8b7355]">Website</span>
          </h1>
          <p className="text-white/30 text-sm max-w-md">
            Submit your template for review. Once approved, it goes live in the marketplace.
          </p>
        </motion.div>

        {/* ── FORM ── */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Name */}
          <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
            <label className="block text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-3">Website Name *</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Kinetic Portfolio Template"
              required
              className="w-full bg-transparent text-lg font-bold tracking-tight placeholder:text-white/15 outline-none"
            />
          </div>

          {/* Description */}
          <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
            <label className="block text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-3">Description *</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Describe your website, its features, and why someone should buy it..."
              required
              rows={4}
              className="w-full bg-transparent text-sm text-white/60 placeholder:text-white/15 outline-none resize-none leading-relaxed"
            />
          </div>

          {/* Category + Price */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
              <label className="block text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-3">Category *</label>
              <div className="flex gap-2">
                {['free', 'paid', 'exclusive'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, category: cat, price: cat === 'free' ? 0 : p.price }))}
                    className={`px-5 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-[0.15em] transition-all ${
                      form.category === cat
                        ? 'bg-[#8b7355] text-white'
                        : 'bg-white/5 text-white/30 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
              <label className="block text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-3">
                Price (₹) {form.category === 'free' && <span className="text-white/20">— Free</span>}
              </label>
              <input
                name="price"
                type="number"
                value={form.category === 'free' ? 0 : form.price}
                onChange={handleChange}
                disabled={form.category === 'free'}
                min={0}
                className="w-full bg-transparent text-2xl font-black tracking-tight placeholder:text-white/15 outline-none disabled:opacity-20"
              />
            </div>
          </div>

          {/* URLs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
              <label className="block text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-3">Deployed URL *</label>
              <input
                name="deployedUrl"
                value={form.deployedUrl}
                onChange={handleChange}
                placeholder="https://your-site.vercel.app"
                required
                className="w-full bg-transparent text-sm font-medium placeholder:text-white/15 outline-none"
              />
            </div>
            <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
              <label className="block text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-3">GitHub URL <span className="text-white/20">(optional)</span></label>
              <input
                name="githubUrl"
                value={form.githubUrl}
                onChange={handleChange}
                placeholder="https://github.com/you/repo"
                className="w-full bg-transparent text-sm font-medium placeholder:text-white/15 outline-none"
              />
            </div>
          </div>

          {/* Tech Stack */}
          <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
            <label className="block text-[10px] font-bold uppercase tracking-[0.3em] text-[#8b7355] mb-5">Tech Stack</label>
            
            <div className="space-y-3">
              {Object.entries(TECH_OPTIONS).map(([section, options]) => (
                <div key={section}>
                  <button
                    type="button"
                    onClick={() => setOpenSection(openSection === section ? '' : section)}
                    className="flex items-center justify-between w-full py-2 text-xs font-bold uppercase tracking-[0.15em] text-white/40 hover:text-white transition-colors"
                  >
                    <span>{section} {techStack[section].length > 0 && `(${techStack[section].length})`}</span>
                    <ChevronDown size={14} className={`transition-transform ${openSection === section ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {openSection === section && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="flex flex-wrap gap-2 pb-3"
                    >
                      {options.map((tech) => (
                        <button
                          key={tech}
                          type="button"
                          onClick={() => toggleTech(section, tech)}
                          className={`px-4 py-2 rounded-full text-[11px] font-bold tracking-wide transition-all ${
                            techStack[section].includes(tech)
                              ? 'bg-[#8b7355]/20 text-[#8b7355] border border-[#8b7355]/40'
                              : 'bg-white/5 text-white/30 border border-white/5 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {techStack[section].includes(tech) ? <span className="mr-1">✓</span> : <Plus size={10} className="inline mr-1" />}
                          {tech}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-[#8b7355] text-white rounded-3xl font-bold text-xs uppercase tracking-[0.2em] hover:bg-[#725e46] transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Submitting...</>
            ) : (
              <><Upload size={16} /> Submit for Review</>
            )}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
