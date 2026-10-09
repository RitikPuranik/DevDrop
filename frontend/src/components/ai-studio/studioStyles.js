// Shared look for every AI Studio details step (bento cards).
export const INPUT = 'w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[14px] text-[var(--s-text)] placeholder:text-[var(--s-faint)] transition-colors hover:border-white/20 focus:border-[var(--s-text)]/60 focus:bg-white/[0.05] focus:outline-none';
export const LABEL = 's-label mb-1.5 block';
export const GRAD = 's-btn s-btn-primary';
export const PAGE_BG = 'studio';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
