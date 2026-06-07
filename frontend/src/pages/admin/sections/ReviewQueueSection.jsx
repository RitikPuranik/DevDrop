import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, ChevronDown, ChevronUp, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { adminAPI } from '../../../api/admin';

const emptyPendingForm = () => ({
  name: '',
  description: '',
  category: 'paid',
  price: '',
  deployedLink: '',
  previewUrl: '',
  githubUrl: '',
  techStackText: '',
  rejectionReason: '',
  sourceCode: null,
  docs: null,
  video: null,
  previewVideo: null,
});

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

function Field({ label, children }) {
  return (
    <label className="block rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 focus-within:border-[#8b7355]/50 transition-colors">
      <span className="block text-[10px] uppercase tracking-[0.25em] text-[#8b7355] font-bold mb-3">{label}</span>
      {children}
    </label>
  );
}

function UploadField({ label, accept, onChange, required = false }) {
  return (
    <label className="block rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-5 hover:border-[#8b7355]/70 transition-colors cursor-pointer group">
      <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/50 font-bold mb-3 group-hover:text-[#8b7355] transition-colors">
        <Upload size={14} />
        {label}
        {required && <span className="text-red-400">*</span>}
      </span>
      <input
        type="file"
        accept={accept}
        required={required}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="block w-full text-sm text-white/40 file:mr-4 file:rounded-full file:border-0 file:bg-white/10 hover:file:bg-[#8b7355] file:px-5 file:py-2.5 file:text-[10px] file:font-bold file:uppercase file:tracking-[0.2em] file:text-white file:transition-colors cursor-pointer"
      />
    </label>
  );
}

export default function ReviewQueueSection() {
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pending, setPending] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [pendingForm, setPendingForm] = useState(emptyPendingForm);

  const loadPending = async () => {
    try {
      setPendingLoading(true);
      const res = await adminAPI.getAllWebsites('pending_review');
      setPending(res.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load pending websites');
      setPending([]);
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

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

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(139,115,85,0.28),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0.02))] p-6 md:p-10 backdrop-blur-2xl"
      >
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.25em] text-white/40 mb-5">
            <ShieldCheck size={12} /> Admin Dashboard
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-none mb-4">Review Queue</h1>
          <p className="text-white/45 max-w-2xl leading-relaxed">
            Select from the pending websites queue, add required files like ZIP and Docs PDF, and approve or reject seller submissions.
          </p>
        </div>
      </motion.div>

      <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-5 md:p-8 shadow-2xl shadow-black/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-2">Queue</p>
            <h2 className="text-xl md:text-2xl font-black tracking-tight">Pending submissions</h2>
            <p className="text-xs text-white/35 mt-2">
              Creator stays locked. Approval adds ZIP, PDF, deployed link, and optional preview or walkthrough videos.
            </p>
          </div>
          <button
            onClick={loadPending}
            className="w-full sm:w-auto text-center text-[10px] uppercase tracking-[0.2em] text-[#8b7355] hover:text-[#a0896c] transition-colors font-bold px-4 py-3 sm:py-2 border border-[#8b7355]/30 rounded-xl sm:rounded-full hover:bg-[#8b7355]/10"
          >
            Refresh Queue
          </button>
        </div>

        <div className="space-y-4 max-h-[760px] overflow-auto pr-2 custom-scrollbar">
          {pendingLoading ? (
            <div className="py-20 flex items-center justify-center text-white/30">
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : pending.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-white/30 space-y-4">
              <CheckCircle size={48} className="text-white/10" />
              <p className="text-sm">No pending websites right now. Queue is clear.</p>
            </div>
          ) : (
            pending.map((item) => (
              <div key={item._id} className="rounded-3xl border border-white/8 bg-white/[0.03] p-4 md:p-5 hover:border-white/20 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-bold text-xl tracking-tight">{item.name}</h3>
                    <p className="text-[11px] text-white/40 mt-1 uppercase tracking-[0.05em]">
                      {item.sellerId?.email || item.sellerId?.name || 'Seller unknown'}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] ${
                      item.category === 'exclusive'
                        ? 'bg-purple-500/10 text-purple-400'
                        : item.category === 'paid'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                    }`}
                  >
                    {item.category}
                  </span>
                </div>

                <p className="text-sm text-white/50 line-clamp-2 leading-relaxed mb-5">{item.description}</p>

                <button
                  onClick={() => {
                    if (expandedId === item._id) {
                      setExpandedId(null);
                      return;
                    }

                    setExpandedId(item._id);
                    setPendingForm({
                      ...emptyPendingForm(),
                      name: item.name || '',
                      description: item.description || '',
                      category: item.category || 'paid',
                      price: item.price ?? '',
                      deployedLink: item.deployedUrl || '',
                      previewUrl: item.previewUrl || item.deployedUrl || '',
                      githubUrl: item.githubUrl || '',
                      techStackText: [
                        ...(item.techStack?.frontend || []),
                        ...(item.techStack?.backend || []),
                        ...(item.techStack?.database || []),
                        ...(item.techStack?.devops || []),
                        ...(item.techStack?.other || []),
                      ].join(', '),
                    });
                  }}
                  className={`w-full flex items-center justify-between rounded-2xl px-5 py-4 text-xs uppercase tracking-[0.2em] transition-all font-bold ${
                    expandedId === item._id
                      ? 'bg-[#8b7355] text-white'
                      : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span>{expandedId === item._id ? 'Close form' : 'Open approval form'}</span>
                  {expandedId === item._id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                <AnimatePresence>
                  {expandedId === item._id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-6 space-y-4">
                        <Field label="Creator">
                          <div className="text-sm text-white/75 px-1">
                            {item.sellerId?.name || item.sellerId?.email || 'Seller account locked for this request'}
                          </div>
                        </Field>

                        <Field label="Seller GitHub Repo">
                          <div className="text-sm text-white/75 px-1 break-all">
                            {pendingForm.githubUrl || 'No GitHub repo submitted by seller'}
                          </div>
                        </Field>

                        <div className="grid md:grid-cols-2 gap-4">
                          <Field label="Name">
                            <input
                              value={pendingForm.name}
                              onChange={(e) => setPendingForm({ ...pendingForm, name: e.target.value })}
                              className="w-full bg-transparent outline-none"
                            />
                          </Field>

                          <Field label="Category">
                            <select
                              value={pendingForm.category}
                              onChange={(e) => setPendingForm({ ...pendingForm, category: e.target.value })}
                              className="w-full bg-transparent outline-none text-white"
                            >
                              <option value="free" className="bg-black">Free</option>
                              <option value="paid" className="bg-black">Paid</option>
                              <option value="exclusive" className="bg-black">Exclusive</option>
                            </select>
                          </Field>
                        </div>

                        <Field label="Description">
                          <textarea
                            rows={4}
                            value={pendingForm.description}
                            onChange={(e) => setPendingForm({ ...pendingForm, description: e.target.value })}
                            className="w-full bg-transparent outline-none resize-none"
                          />
                        </Field>

                        <div className="grid md:grid-cols-2 gap-4">
                          <Field label="Price">
                            <input
                              type="number"
                              value={pendingForm.price}
                              onChange={(e) => setPendingForm({ ...pendingForm, price: e.target.value })}
                              className="w-full bg-transparent outline-none"
                            />
                          </Field>

                          <Field label="Tech Stack">
                            <textarea
                              rows={3}
                              value={pendingForm.techStackText}
                              onChange={(e) => setPendingForm({ ...pendingForm, techStackText: e.target.value })}
                              className="w-full bg-transparent outline-none resize-none"
                            />
                          </Field>
                        </div>

                        <Field label="Deployed URL">
                          <input
                            value={pendingForm.deployedLink}
                            onChange={(e) => setPendingForm({ ...pendingForm, deployedLink: e.target.value })}
                            className="w-full bg-transparent outline-none"
                            placeholder="https://..."
                          />
                        </Field>

                        <Field label="Preview URL">
                          <input
                            value={pendingForm.previewUrl}
                            onChange={(e) => setPendingForm({ ...pendingForm, previewUrl: e.target.value })}
                            className="w-full bg-transparent outline-none"
                            placeholder="https://..."
                          />
                        </Field>

                        <Field label="Rejection Reason">
                          <textarea
                            rows={2}
                            value={pendingForm.rejectionReason}
                            onChange={(e) => setPendingForm({ ...pendingForm, rejectionReason: e.target.value })}
                            className="w-full bg-transparent outline-none resize-none"
                            placeholder="Reason for rejection (if rejecting)..."
                          />
                        </Field>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <UploadField label="Source Code ZIP" accept=".zip" onChange={(file) => setPendingForm({ ...pendingForm, sourceCode: file })} required />
                          <UploadField label="Docs PDF" accept=".pdf" onChange={(file) => setPendingForm({ ...pendingForm, docs: file })} required />
                          <UploadField label="Preview Video" accept=".mp4,.webm,.mov,.avi" onChange={(file) => setPendingForm({ ...pendingForm, previewVideo: file })} />
                          <UploadField label="Demo Video" accept=".mp4,.webm,.mov,.avi" onChange={(file) => setPendingForm({ ...pendingForm, video: file })} />
                        </div>

                        <div className="grid md:grid-cols-2 gap-4 pt-2">
                          <button
                            onClick={() => handleApprovePending(item._id)}
                            className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black py-4 font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_25px_rgba(16,185,129,0.25)]"
                          >
                            <CheckCircle size={18} /> Approve and list
                          </button>
                          <button
                            onClick={() => handleRejectPending(item._id)}
                            className="w-full rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-4 font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 transition-all"
                          >
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
  );
}
