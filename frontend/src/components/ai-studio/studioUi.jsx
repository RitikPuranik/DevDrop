import React, { useRef, useState } from 'react';
import { Upload, Video, X, Sparkles, Zap, MousePointerClick, Palette } from 'lucide-react';
import { INPUT, LABEL, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, formatFileSize } from './studioStyles';

export function Card({ title, className = '', children }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-[linear-gradient(150deg,rgba(255,255,255,.055),rgba(12,12,18,.92))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] ${className}`}>
      <h2 className="mb-4 text-[15px] font-semibold tracking-tight text-white">{title}</h2>
      {children}
    </section>
  );
}

export function Field({ label, value, onChange, placeholder, multiline = false, error, type = 'text', rows = 4 }) {
  const Component = multiline ? 'textarea' : 'input';
  return (
    <div className="min-w-0">
      <label className={LABEL}>{label}</label>
      <Component
        type={multiline ? undefined : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? rows : undefined}
        aria-invalid={error ? 'true' : undefined}
        className={`${INPUT} ${multiline ? 'resize-none' : ''} ${error ? '!border-red-500/60' : ''}`}
      />
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

export function StepHeader({ lead = 'Build your ', accent, subtitle }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-[34px]">
          {lead}<span className="bg-[linear-gradient(90deg,#c4b5fd,#a78bfa,#e9d5ff)] bg-clip-text text-transparent">{accent}</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/45">{subtitle}</p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white/80">
        <Sparkles size={13} className="text-violet-400" /> AI Assisted
      </span>
    </div>
  );
}

export function MediaDrop({ kind, list, onChange }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const isImage = kind === 'image';
  const max = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  const Icon = isImage ? Upload : Video;

  const add = (files) => {
    const next = [...list];
    let rejected = 0;
    Array.from(files || []).forEach((file) => {
      const okType = isImage ? file.type.startsWith('image/') : file.type.startsWith('video/');
      if (!okType || file.size > max) { rejected += 1; return; }
      if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file);
    });
    setError(rejected ? `${rejected} file${rejected > 1 ? 's' : ''} skipped (wrong type or over ${isImage ? '10' : '50'}MB).` : '');
    onChange(next);
  };

  return (
    <div className="min-w-0">
      <p className={LABEL}>{isImage ? 'Images' : 'Videos'}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
        onDragOver={(e) => e.preventDefault()}
        className="flex h-[116px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 bg-black/20 text-center transition-colors hover:border-violet-400/60"
      >
        <Icon size={24} strokeWidth={1.4} className="text-white/55" />
        <span className="text-[13px] font-semibold text-violet-300">Browse files</span>
        <span className="text-[10px] text-white/40">{list.length} selected / max {isImage ? '10' : '50'}MB</span>
      </button>
      <input ref={inputRef} type="file" multiple accept={isImage ? 'image/*' : 'video/*'} onChange={(e) => { add(e.target.files); e.target.value = ''; }} className="hidden" />
      {error && <p className="mt-1.5 text-[11px] text-amber-300/90">{error}</p>}
      {list.length > 0 && (
        <div className="mt-2 space-y-1">
          {list.map((file, index) => (
            <div key={file.name + file.size + index} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] text-white/70">{file.name}</span>
              <span className="text-[10px] text-white/30">{formatFileSize(file.size)}</span>
              <button type="button" onClick={() => onChange(list.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`} className="text-white/35 hover:text-white"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const QUICK_PROMPTS = [
  { label: 'Make it interactive', text: 'Make it interactive with rich hover and click micro-interactions.', icon: Zap },
  { label: 'Add smooth scrolling', text: 'Add smooth scrolling and scroll-linked reveal animations.', icon: MousePointerClick },
  { label: 'Warm pastel colors', text: 'Use a warm pastel color palette.', icon: Palette },
];

export function SpecialRequestsCard({ value = '', onChange, placeholder, side = null, className = '' }) {
  const addPrompt = (text) => {
    const current = value.trim();
    if (current.includes(text)) return;
    onChange(current ? `${current}\n${text}` : text);
  };
  return (
    <section className={`relative rounded-2xl border border-fuchsia-400/30 bg-[linear-gradient(135deg,rgba(124,58,237,.16),rgba(192,38,211,.10)_60%,rgba(12,12,18,.9))] p-5 shadow-[0_0_40px_rgba(168,85,247,.10)] ${className}`}>
      <Sparkles size={22} className="absolute right-5 top-5 text-fuchsia-300/80" />
      <div className={`grid gap-4 ${side ? 'lg:grid-cols-3' : ''}`}>
        <div className={side ? 'lg:col-span-2' : ''}>
          <label className="mb-2 block text-[15px] font-semibold text-white">Anything else you want? <span className="text-[13px] font-normal text-white/45">(optional)</span></label>
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={placeholder} className={`${INPUT} resize-none !border-violet-400/30`} />
        </div>
        {side && <div className="space-y-3 lg:pr-8">{side}</div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map(({ label, text, icon: Icon }) => (
          <button key={label} type="button" onClick={() => addPrompt(text)} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-black/25 px-3.5 py-1.5 text-xs font-medium text-white/80 transition-colors hover:border-violet-400/60 hover:text-white">
            <Icon size={13} className="text-violet-300" /> {label}
          </button>
        ))}
      </div>
    </section>
  );
}
