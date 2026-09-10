import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { PREVIEW_STATES } from '../../../hooks/ai-studio/useWebContainerPreview';

const LOADING_LABELS = {
  [PREVIEW_STATES.BOOTING]: 'Preparing preview…',
  [PREVIEW_STATES.MOUNTING]: 'Mounting project…',
  [PREVIEW_STATES.INSTALLING]: 'Installing dependencies…',
  [PREVIEW_STATES.STARTING]: 'Starting development server…',
};

export default function PreviewPane({ state, previewUrl, error, reloadNonce, onRetry, output }) {
  if (state === PREVIEW_STATES.ERROR) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
        <AlertTriangle size={22} className="text-[#a6603f]" />
        <p className="text-[14px] font-semibold text-white/80">Preview failed</p>
        <p className="text-white/40 text-[12.5px] max-w-sm whitespace-pre-wrap">{error || 'Something went wrong while starting the preview.'}</p>
        {output && <pre className="mt-2 w-full max-w-xl max-h-52 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-left text-[10px] leading-4 text-white/45 whitespace-pre-wrap">{output}</pre>}
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 px-5 py-2.5 rounded-lg bg-white text-black text-[12.5px] font-bold"
        >
          Retry preview
        </button>
      </div>
    );
  }

  if (state === PREVIEW_STATES.UNSUPPORTED) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
        <AlertTriangle size={22} className="text-white/40" />
        <p className="text-[14px] font-semibold text-white/80">Preview isn’t available for this project</p>
        <p className="text-white/40 text-[12.5px] max-w-sm">{error || 'This project type isn’t supported by the in-browser preview yet. You can still browse the code or download it.'}</p>
      </div>
    );
  }

  if (state !== PREVIEW_STATES.READY || !previewUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 size={22} className="animate-spin text-[#8b7355]" />
        <p className="text-white/40 text-[12.5px]">{LOADING_LABELS[state] || 'Preparing preview…'}</p>
        {state === PREVIEW_STATES.INSTALLING && output && (
          <pre className="mt-2 w-[min(720px,85%)] max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-left text-[10px] leading-4 text-white/35 whitespace-pre-wrap">{output}</pre>
        )}
      </div>
    );
  }

  return (
    <iframe
      key={reloadNonce}
      title="AI Studio live preview"
      src={previewUrl}
      className="w-full h-full bg-white"
      // WebContainer preview URLs run generated code in an isolated,
      // cross-origin-isolated sandbox origin — no DevDrop cookies, JWT,
      // or parent-window access is exposed to it (Section 27).
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );
}
