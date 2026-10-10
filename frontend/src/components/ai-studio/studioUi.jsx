import React, { useRef, useState } from 'react';
import { Upload, Video, X, Zap, MousePointerClick, Palette } from 'lucide-react';
import { INPUT, LABEL, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, formatFileSize } from './studioStyles';

export function Card({ title, className = '', children }) {
  return (
    <section className={`s-card p-5 md:p-6 ${className}`}>
      <h2 className="s-display mb-5 text-[19px] text-[var(--s-text)]">{title}</h2>
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
        className={`${INPUT} ${multiline ? 'resize-none' : ''} ${error ? '!border-[var(--s-err)]' : ''}`}
      />
      {error && <p className="mt-1 text-[11px] text-[var(--s-err)]">{error}</p>}
    </div>
  );
}

export function StepHeader({ lead = 'Build your ', accent, subtitle }) {
  return (
    <div className="mb-10 text-center">
      <h1 className="s-display text-3xl font-bold tracking-tight md:text-5xl">
        {lead}<span className="text-[var(--s-hi)]">{accent}</span>
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-7 text-[var(--s-muted)]">{subtitle}</p>
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
        className="flex h-[116px] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--s-line-strong)] bg-[var(--s-bg)] text-center transition-colors hover:border-[var(--s-accent)]"
      >
        <Icon size={24} strokeWidth={1.4} className="text-[var(--s-muted)]" />
        <span className="text-[13px] font-semibold text-[var(--s-accent)]">Browse files</span>
        <span className="text-[10.5px] text-[var(--s-faint)]">{list.length} selected / max {isImage ? '10' : '50'}MB</span>
      </button>
      <input ref={inputRef} type="file" multiple accept={isImage ? 'image/*' : 'video/*'} onChange={(e) => { add(e.target.files); e.target.value = ''; }} className="hidden" />
      {error && <p className="mt-1.5 text-[11px] text-[var(--s-accent)]">{error}</p>}
      {list.length > 0 && (
        <div className="mt-2 space-y-1">
          {list.map((file, index) => (
            <div key={file.name + file.size + index} className="flex items-center gap-2 rounded-md border border-[var(--s-line)] bg-[var(--s-bg)] px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--s-text)]">{file.name}</span>
              <span className="text-[10.5px] text-[var(--s-faint)]">{formatFileSize(file.size)}</span>
              <button type="button" onClick={() => onChange(list.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`} className="text-[var(--s-faint)] hover:text-[var(--s-text)]"><X size={12} /></button>
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
    onChange(current ? `${current}
${text}` : text);
  };
  return (
    <section className={`s-card p-5 md:p-6 ${className}`}>
      <div className={`grid gap-4 ${side ? 'lg:grid-cols-3' : ''}`}>
        <div className={side ? 'lg:col-span-2' : ''}>
          <label className="mb-2 block text-[15px] font-semibold">Anything else you want? <span className="text-[13px] font-normal text-[var(--s-muted)]">(optional)</span></label>
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={placeholder} className={`${INPUT} resize-none`} />
        </div>
        {side && <div className="space-y-3 lg:pr-8">{side}</div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map(({ label, text, icon: Icon }) => (
          <button key={label} type="button" onClick={() => addPrompt(text)} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-[var(--s-text)] transition-colors hover:bg-white/10">
            <Icon size={13} className="text-[var(--s-hi)]" /> {label}
          </button>
        ))}
      </div>
    </section>
  );
}
