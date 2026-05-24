import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../api/admin';
import { userAPI } from '../api/user';
import { toast } from 'sonner';
import { CheckCircle, ChevronDown, ChevronUp, Loader2, PackagePlus, ShieldCheck, Upload, Wand2 } from 'lucide-react';

const defaultFoodGram = {
  sellerEmail: 'ritikpuranik28@gmail.com',
  name: 'FoodGram',
  description: 'A social food platform where users discover and share food posts, follow other food lovers, and interact with local food vendor partners. Features include a scrollable food feed, reels, explore page, likes, comments, saves, and a dual role system for regular users and food business partners.',
  category: 'paid',
  price: '5000',
  deployedLink: 'https://food-app-nine-liard.vercel.app/',
  previewUrl: 'https://food-app-nine-liard.vercel.app/',
  githubUrl: 'https://github.com/RitikPuranik/FoodGram',
  techStackText: 'React, Vite, Node.js, Express, MongoDB, Mongoose, ImageKit, JWT, Axios, Framer Motion',
};

const defaultResumeAI = {
  sellerEmail: 'ritikpuranik28@gmail.com',
  name: 'ResumeAI',
  description: 'An AI-powered resume and career platform that helps users build resumes, analyze ATS compatibility, generate cover letters, practice mock interviews with AI-generated questions, match resumes to job descriptions, and track career readiness — all with a free and Pro subscription tier.',
  category: 'paid',
  price: '5000',
  deployedLink: 'https://resume-ai-ruby-seven.vercel.app',
  previewUrl: 'https://resume-ai-ruby-seven.vercel.app',
  githubUrl: 'https://github.com/RitikPuranik/ResumeAI',
  techStackText: 'React 19, Vite, Tailwind CSS, Node.js, Express, MongoDB, Groq AI, Cloudinary, Razorpay, JWT, Puppeteer',
};

const demoTemplates = [
  { key: 'foodgram', label: 'FoodGram', preset: defaultFoodGram },
  { key: 'resumeai', label: 'ResumeAI', preset: defaultResumeAI },
];

const emptyPendingForm = () => ({ name: '', description: '', category: 'paid', price: '', deployedLink: '', previewUrl: '', githubUrl: '', techStackText: '', rejectionReason: '', sourceCode: null, docs: null, video: null, previewVideo: null });

function techStackFromText(text) {
  const values = text.split(',').map((item) => item.trim()).filter(Boolean);
  return {
    frontend: values.filter((item) => ['React', 'Vite', 'Framer Motion', 'Tailwind', 'Next.js', 'Vue'].includes(item)),
    backend: values.filter((item) => ['Node.js', 'Express', 'MongoDB', 'Mongoose'].includes(item)),
    database: values.filter((item) => ['MongoDB', 'Mongoose'].includes(item)),
    devops: values.filter((item) => ['ImageKit', 'JWT', 'Axios'].includes(item)),
    other: values.filter((item) => !['React', 'Vite', 'Framer Motion', 'Tailwind', 'Next.js', 'Vue', 'Node.js', 'Express', 'MongoDB', 'Mongoose', 'ImageKit', 'JWT', 'Axios'].includes(item)),
  };
}

export default function Admin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pending, setPending] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [activePresetKey, setActivePresetKey] = useState('foodgram');
  const [publishForm, setPublishForm] = useState(defaultFoodGram);
  const [pendingForm, setPendingForm] = useState(emptyPendingForm);

  const setPreset = (key) => {
    const nextPreset = demoTemplates.find((item) => item.key === key)?.preset || defaultFoodGram;
    setActivePresetKey(key);
    setPublishForm(nextPreset);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const res = await userAPI.getProfile();
        const role = res.data?.data?.user?.role;
        setIsAdmin(role === 'admin');
        if (role === 'admin') {
          await loadPending();
        }
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const loadPending = async () => {
    try {
      setPendingLoading(true);
      const res = await adminAPI.getPendingWebsites();
      setPending(res.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load pending websites');
      setPending([]);
    } finally {
      setPendingLoading(false);
    }
  };

  const publishPayload = useMemo(() => ({
    sellerEmail: publishForm.sellerEmail,
    name: publishForm.name,
    description: publishForm.description,
    category: publishForm.category,
    price: publishForm.price,
    deployedLink: publishForm.deployedLink,
    previewUrl: publishForm.previewUrl,
    githubUrl: publishForm.githubUrl,
    techStack: techStackFromText(publishForm.techStackText),
  }), [publishForm]);

  const handlePublish = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const formData = new FormData();
      Object.entries(publishPayload).forEach(([key, value]) => {
        formData.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
      });
      if (publishForm.sourceCode) formData.append('sourceCode', publishForm.sourceCode);
      if (publishForm.docs) formData.append('docs', publishForm.docs);
      if (publishForm.video) formData.append('video', publishForm.video);
      if (publishForm.previewVideo) formData.append('previewVideo', publishForm.previewVideo);

      await adminAPI.createWebsite(formData);
      toast.success(`${publishForm.name} published to paid templates`);
      setPreset(activePresetKey);
      await loadPending();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to publish website');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprovePending = async (id) => {
    try {
      const formData = new FormData();
      if (pendingForm.name) formData.append('name', pendingForm.name);
      if (pendingForm.description) formData.append('description', pendingForm.description);
      if (pendingForm.category) formData.append('category', pendingForm.category);
      if (pendingForm.price !== '') formData.append('price', pendingForm.price);
      if (pendingForm.deployedLink) formData.append('deployedLink', pendingForm.deployedLink);
      if (pendingForm.previewUrl) formData.append('previewUrl', pendingForm.previewUrl);
      if (pendingForm.techStackText) formData.append('techStack', JSON.stringify(techStackFromText(pendingForm.techStackText)));
      if (pendingForm.sourceCode) formData.append('sourceCode', pendingForm.sourceCode);
      if (pendingForm.docs) formData.append('docs', pendingForm.docs);
      if (pendingForm.video) formData.append('video', pendingForm.video);
      if (pendingForm.previewVideo) formData.append('previewVideo', pendingForm.previewVideo);

      if (!pendingForm.sourceCode || !pendingForm.docs) {
        toast.error('Source code ZIP and docs PDF are required. Videos stay optional.');
        return;
      }

      await adminAPI.approveWebsite(id, formData);
      toast.success('Website approved and listed');
      setExpandedId(null);
      setPendingForm(emptyPendingForm());
      await loadPending();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to approve website');
    }
  };

  const handleRejectPending = async (id) => {
    const reason = pendingForm.rejectionReason?.trim();
    if (!reason) {
      toast.error('Rejection reason is required');
      return;
    }

    try {
      await adminAPI.rejectWebsite(id, { reason });
      toast.success('Website rejected');
      setExpandedId(null);
      setPendingForm(emptyPendingForm());
      await loadPending();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reject website');
    }
  };

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
          <p className="text-white/40 text-sm leading-relaxed mb-8">This dashboard is locked to admin accounts. Sign in with an admin user to publish or approve FoodGram listings.</p>
          <button onClick={() => navigate('/')} className="px-6 py-3 rounded-full bg-[#8b7355] text-white font-bold uppercase tracking-[0.15em] text-xs">Back Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white pt-28 pb-16 px-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(139,115,85,0.28),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0.02))] p-8 md:p-10 backdrop-blur-2xl">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.25em] text-white/40 mb-5">
              <ShieldCheck size={12} /> Admin Publisher
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-none mb-4">Publish demo templates as paid listings.</h1>
            <p className="text-white/45 max-w-2xl leading-relaxed">Admin publishing adds the ZIP, docs PDF, and optional videos. Seller-submitted GitHub and deployed links stay part of the project access after purchase.</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
          <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={handlePublish} className="xl:col-span-3 rounded-[32px] border border-white/10 bg-[#0f0f0f] p-6 md:p-8 shadow-2xl shadow-black/30 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-2">New Paid Listing</p>
                <h2 className="text-2xl font-black tracking-tight">{publishForm.name} demo publish form</h2>
              </div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/35">
                <Wand2 size={14} /> Pre-filled
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {demoTemplates.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => setPreset(template.key)}
                  className={`rounded-3xl border px-4 py-4 text-left transition-all ${activePresetKey === template.key ? 'border-[#8b7355] bg-[#8b7355]/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.25em] text-white/35 mb-2">Preset</p>
                      <h3 className="font-black text-lg tracking-tight">{template.label}</h3>
                    </div>
                    {activePresetKey === template.key && <CheckCircle size={16} className="text-emerald-400" />}
                  </div>
                  <p className="text-xs text-white/35 mt-2 line-clamp-2">{template.preset.description}</p>
                </button>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Seller Email">
                <input value={publishForm.sellerEmail} onChange={(e) => setPublishForm({ ...publishForm, sellerEmail: e.target.value })} className="w-full bg-transparent outline-none" />
              </Field>
              <Field label="Project Name">
                <input value={publishForm.name} onChange={(e) => setPublishForm({ ...publishForm, name: e.target.value })} className="w-full bg-transparent outline-none" />
              </Field>
            </div>

            <Field label="Description">
              <textarea rows={5} value={publishForm.description} onChange={(e) => setPublishForm({ ...publishForm, description: e.target.value })} className="w-full bg-transparent outline-none resize-none" />
            </Field>

            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Category">
                <select value={publishForm.category} onChange={(e) => setPublishForm({ ...publishForm, category: e.target.value })} className="w-full bg-transparent outline-none text-white">
                  <option value="free" className="bg-black">Free</option>
                  <option value="paid" className="bg-black">Paid</option>
                  <option value="exclusive" className="bg-black">Exclusive</option>
                </select>
              </Field>
              <Field label="Price">
                <input type="number" value={publishForm.price} onChange={(e) => setPublishForm({ ...publishForm, price: e.target.value })} className="w-full bg-transparent outline-none" />
              </Field>
              <Field label="Deployed URL">
                <input value={publishForm.deployedLink} onChange={(e) => setPublishForm({ ...publishForm, deployedLink: e.target.value })} className="w-full bg-transparent outline-none" />
              </Field>
            </div>

            <Field label="GitHub URL">
              <input value={publishForm.githubUrl} onChange={(e) => setPublishForm({ ...publishForm, githubUrl: e.target.value })} className="w-full bg-transparent outline-none" />
            </Field>

            <Field label="Tech Stack (comma-separated)">
              <textarea rows={3} value={publishForm.techStackText} onChange={(e) => setPublishForm({ ...publishForm, techStackText: e.target.value })} className="w-full bg-transparent outline-none resize-none" />
            </Field>

            <div className="grid md:grid-cols-2 gap-4">
              <UploadField label="Source Code ZIP" accept=".zip" onChange={(file) => setPublishForm({ ...publishForm, sourceCode: file })} required />
              <UploadField label="Docs PDF" accept=".pdf" onChange={(file) => setPublishForm({ ...publishForm, docs: file })} required />
              <UploadField label="Preview Video" accept=".mp4,.webm,.mov,.avi" onChange={(file) => setPublishForm({ ...publishForm, previewVideo: file })} />
              <UploadField label="Demo Video" accept=".mp4,.webm,.mov,.avi" onChange={(file) => setPublishForm({ ...publishForm, video: file })} />
            </div>

            <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-[#8b7355] hover:bg-[#735f48] transition-all py-4 font-bold uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 disabled:opacity-60">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <><PackagePlus size={16} /> Publish Paid Listing</>}
            </button>
          </motion.form>

          <div className="xl:col-span-2 rounded-[32px] border border-white/10 bg-[#0f0f0f] p-6 md:p-8 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-2">Review Queue</p>
                <h2 className="text-2xl font-black tracking-tight">Pending websites</h2>
                <p className="text-xs text-white/35 mt-2">Creator stays locked. Approval adds ZIP, PDF, deployed link, and optional preview or walkthrough videos.</p>
              </div>
              <button onClick={loadPending} className="text-[10px] uppercase tracking-[0.2em] text-white/35 hover:text-white transition-colors">Refresh</button>
            </div>

            <div className="space-y-3 max-h-[760px] overflow-auto pr-1">
              {pendingLoading ? (
                <div className="py-16 flex items-center justify-center text-white/30"><Loader2 className="animate-spin" /></div>
              ) : pending.length === 0 ? (
                <div className="py-16 text-center text-white/30 text-sm">No pending websites right now.</div>
              ) : (
                pending.map((item) => (
                  <div key={item._id} className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-bold text-lg tracking-tight">{item.name}</h3>
                        <p className="text-[11px] text-white/35 mt-1">{item.sellerId?.email || item.sellerId?.name || 'Seller unknown'}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] bg-amber-500/10 text-amber-300">{item.category}</span>
                    </div>

                    <p className="text-xs text-white/45 line-clamp-3 leading-relaxed mb-4">{item.description}</p>

                    <button
                      onClick={() => {
                        setExpandedId(expandedId === item._id ? null : item._id);
                          setPendingForm({
                            ...emptyPendingForm(),
                            name: item.name || '',
                            description: item.description || '',
                            category: item.category || 'paid',
                            price: item.price ?? '',
                            deployedLink: item.deployedUrl || '',
                            previewUrl: item.previewUrl || item.deployedUrl || '',
                            githubUrl: item.githubUrl || '',
                            techStackText: [...(item.techStack?.frontend || []), ...(item.techStack?.backend || []), ...(item.techStack?.database || []), ...(item.techStack?.devops || []), ...(item.techStack?.other || [])].join(', '),
                          });
                      }}
                      className="w-full flex items-center justify-between rounded-2xl bg-black/30 px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/50 hover:text-white transition-colors"
                    >
                      <span>Open approval form</span>
                      {expandedId === item._id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    <AnimatePresence>
                      {expandedId === item._id && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="pt-4 space-y-3">
                            <Field label="Creator">
                              <div className="text-sm text-white/75">{item.sellerId?.name || item.sellerId?.email || 'Seller account locked for this request'}</div>
                            </Field>
                            <Field label="Seller GitHub Repo">
                              <div className="text-sm text-white/75 break-all">{pendingForm.githubUrl || 'No GitHub repo submitted by seller'}</div>
                            </Field>
                            <div className="grid md:grid-cols-2 gap-3">
                              <Field label="Name">
                                <input value={pendingForm.name} onChange={(e) => setPendingForm({ ...pendingForm, name: e.target.value })} className="w-full bg-transparent outline-none" />
                              </Field>
                              <Field label="Category">
                                <select value={pendingForm.category} onChange={(e) => setPendingForm({ ...pendingForm, category: e.target.value })} className="w-full bg-transparent outline-none text-white">
                                  <option value="free" className="bg-black">Free</option>
                                  <option value="paid" className="bg-black">Paid</option>
                                  <option value="exclusive" className="bg-black">Exclusive</option>
                                </select>
                              </Field>
                            </div>

                            <Field label="Description">
                              <textarea rows={4} value={pendingForm.description} onChange={(e) => setPendingForm({ ...pendingForm, description: e.target.value })} className="w-full bg-transparent outline-none resize-none" />
                            </Field>

                            <div className="grid md:grid-cols-2 gap-3">
                              <Field label="Price">
                                <input type="number" value={pendingForm.price} onChange={(e) => setPendingForm({ ...pendingForm, price: e.target.value })} className="w-full bg-transparent outline-none" />
                              </Field>
                              <Field label="Tech Stack">
                                <textarea rows={3} value={pendingForm.techStackText} onChange={(e) => setPendingForm({ ...pendingForm, techStackText: e.target.value })} className="w-full bg-transparent outline-none resize-none" />
                              </Field>
                            </div>

                            <Field label="Deployed URL">
                              <input value={pendingForm.deployedLink} onChange={(e) => setPendingForm({ ...pendingForm, deployedLink: e.target.value })} className="w-full bg-transparent outline-none" placeholder="https://..." />
                            </Field>
                            <Field label="Preview URL">
                              <input value={pendingForm.previewUrl} onChange={(e) => setPendingForm({ ...pendingForm, previewUrl: e.target.value })} className="w-full bg-transparent outline-none" placeholder="https://..." />
                            </Field>
                            <Field label="Rejection Reason">
                              <textarea rows={2} value={pendingForm.rejectionReason} onChange={(e) => setPendingForm({ ...pendingForm, rejectionReason: e.target.value })} className="w-full bg-transparent outline-none resize-none" placeholder="Reason for rejection..." />
                            </Field>
                            <div className="grid grid-cols-1 gap-3">
                              <UploadField label="Source Code ZIP" accept=".zip" onChange={(file) => setPendingForm({ ...pendingForm, sourceCode: file })} required />
                              <UploadField label="Docs PDF" accept=".pdf" onChange={(file) => setPendingForm({ ...pendingForm, docs: file })} required />
                              <UploadField label="Preview Video" accept=".mp4,.webm,.mov,.avi" onChange={(file) => setPendingForm({ ...pendingForm, previewVideo: file })} />
                              <UploadField label="Demo Video" accept=".mp4,.webm,.mov,.avi" onChange={(file) => setPendingForm({ ...pendingForm, video: file })} />
                            </div>

                            <div className="grid md:grid-cols-2 gap-3">
                              <button onClick={() => handleApprovePending(item._id)} className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black py-3 font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 transition-all">
                                <CheckCircle size={16} /> Approve and list
                              </button>
                              <button onClick={() => handleRejectPending(item._id)} className="w-full rounded-2xl bg-red-500/20 hover:bg-red-500/30 text-red-300 py-3 font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 transition-all">
                                Reject request
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block rounded-3xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <span className="block text-[9px] uppercase tracking-[0.25em] text-[#8b7355] font-bold mb-2">{label}</span>
      {children}
    </label>
  );
}

function UploadField({ label, accept, onChange, required = false }) {
  return (
    <label className="block rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 hover:border-[#8b7355]/50 transition-colors cursor-pointer">
      <span className="flex items-center gap-2 text-[9px] uppercase tracking-[0.25em] text-white/40 font-bold mb-3"><Upload size={12} /> {label}</span>
      <input type="file" accept={accept} required={required} onChange={(e) => onChange(e.target.files?.[0] || null)} className="block w-full text-sm text-white/30 file:mr-4 file:rounded-full file:border-0 file:bg-[#8b7355] file:px-4 file:py-2 file:text-[10px] file:font-bold file:uppercase file:tracking-[0.2em] file:text-white" />
    </label>
  );
}
