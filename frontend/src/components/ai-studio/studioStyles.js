// Shared look for every AI Studio details step (bento cards).
export const INPUT = 'w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/30 transition-colors focus:border-violet-400/70 focus:outline-none focus:ring-2 focus:ring-violet-500/25';
export const LABEL = 'mb-1.5 block text-[12px] font-medium text-white/75';
export const GRAD = 'bg-[linear-gradient(135deg,#3b82f6,#8b5cf6_55%,#c026d3)] text-white';
export const PAGE_BG = 'bg-neutral-950 bg-[radial-gradient(ellipse_70%_38%_at_50%_0%,rgba(124,58,237,.22),transparent)]';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
