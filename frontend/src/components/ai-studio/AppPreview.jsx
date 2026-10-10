import React, { useState, useEffect, useRef } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview as SandpackPreviewPane,
  SandpackFileExplorer,
  useSandpack,
} from '@codesandbox/sandpack-react';
import { Eye, Code2, AlertTriangle, Bot, Download, Loader2, RefreshCw, Monitor, Tablet, Smartphone, History, Rocket, GitBranch } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import VersionHistoryPanel from './preview/VersionHistoryPanel';
import ShipProjectModal from './ShipProjectModal';
import Github from './GithubIcon';
import GeneratingScreen from './GeneratingScreen';
import JSZip from 'jszip';

const PLACEHOLDER_FILES = {
  '/App.js': {
    code: `export default function App() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
        <p style={{ fontSize: 14 }}>Your app will appear here</p>
      </div>
    </div>
  );
}`,
  },
};

const RESPONSIVE_PREVIEW_CSS = `
html, body {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar,
#root::-webkit-scrollbar,
*::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}

html {
  overflow-y: auto;
  overflow-x: hidden;
}

body {
  overflow-y: auto;
  overflow-x: hidden;
  overflow-wrap: anywhere;
}

*, *::before, *::after {
  box-sizing: border-box;
}

img, picture, video, canvas, svg {
  max-width: 100%;
}

img, video {
  height: auto;
}

table {
  width: 100%;
  max-width: 100%;
  display: block;
  overflow-x: auto;
}

pre, code {
  max-width: 100%;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

iframe {
  max-width: 100%;
}

button, input, textarea, select {
  max-width: 100%;
  min-width: 0;
}

#root {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

@media (max-width: 768px) {
  h1, h2, h3, h4, h5, h6 {
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  nav, header, main, section, article, aside, footer {
    max-width: 100%;
  }

  [style*="grid-template-columns"],
  [style*="display: grid"] {
    min-width: 0;
  }
}
`;

function normalizeGeneratedFiles(sourceFiles) {
  const files = { ...(sourceFiles || {}) };
  const responsivePath = '/__devdrop-responsive.css';
  const existingResponsive = files[responsivePath];
  const appFile = files['/App.js'];

  const existingCode = typeof existingResponsive?.code === 'string' ? existingResponsive.code : '';
  files[responsivePath] = {
    ...(existingResponsive && typeof existingResponsive === 'object' ? existingResponsive : {}),
    code: existingCode.includes('DevDrop responsive runtime')
      ? existingCode
      : `${existingCode}${existingCode ? '\n\n' : ''}/* DevDrop responsive runtime */\n${RESPONSIVE_PREVIEW_CSS}`,
  };

  if (appFile && typeof appFile === 'object' && typeof appFile.code === 'string') {
    const importStatement = `import './__devdrop-responsive.css';`;
    if (!appFile.code.includes("./__devdrop-responsive.css") && !appFile.code.includes("/__devdrop-responsive.css")) {
      files['/App.js'] = {
        ...appFile,
        code: `${importStatement}\n${appFile.code}`,
      };
    }
  }

  return files;
}

const BASE_DEPENDENCIES = {
  'react-router-dom': 'latest',
  'lucide-react': 'latest',
};

// ── toolbar building blocks ──────────────────────────────────────────────
const BTN_BASE = 'inline-flex items-center justify-center gap-2 rounded-full text-[12px] font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-40';
const BTN_GHOST = `${BTN_BASE} h-9 border border-[var(--s-line)] bg-[var(--s-surface)] px-3.5 text-[var(--s-text)] hover:-translate-y-px hover:border-[var(--s-line-strong)] hover:bg-white/[0.06]`;
const BTN_ICON = `${BTN_BASE} h-9 w-9 border border-[var(--s-line)] bg-[var(--s-surface)] text-[var(--s-muted)] hover:-translate-y-px hover:border-[var(--s-line-strong)] hover:text-[var(--s-text)]`;
const BTN_PRIMARY = `${BTN_BASE} h-9 bg-[var(--s-text)] px-4 font-bold text-[#050505] hover:-translate-y-px hover:bg-white`;

// A pill-shaped switch whose highlight slides to the chosen option.
function Segmented({ id, value, onChange, options }) {
  return (
    <div className="flex items-center rounded-full border border-[var(--s-line)] bg-[var(--s-surface)] p-1">
      {options.map(({ value: v, label, icon: Icon, aria }) => {
        const on = value === v;
        return (
          <button
            key={v} type="button" onClick={() => onChange(v)} aria-pressed={on} aria-label={aria || label} title={aria || label}
            className={`relative flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors ${on ? 'text-[#050505]' : 'text-[var(--s-muted)] hover:text-[var(--s-text)]'}`}
          >
            {on && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-[var(--s-text)]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative z-10 flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Toolbar buttons show only their icon; the text label slides out on hover
// (the button needs the `group` class). Keeps the toolbar compact so the
// preview gets more room.
function HoverLabel({ children }) {
  return (
    <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:ml-1.5 group-hover:max-w-[130px] group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-[130px] group-focus-visible:opacity-100">
      {children}
    </span>
  );
}

function SandpackInner({ fileData, isGenerating, onFixError, activeTab, setActiveTab, pipelineSteps, pipelineMode, percent, onDownload, device, setDevice, projectId, appTitle, onListVersions, onRestoreVersion, versionRefreshKey }) {
  const { sandpack, listen } = useSandpack();
  const [shipMode, setShipMode] = useState(null); // 'github' | 'live' | null
  const canShip = Boolean(fileData && projectId && !isGenerating);
  const [previewError, setPreviewError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const usedNativeFullscreen = useRef(false);

  // Full screen is a CSS overlay (position: fixed) on the SAME element tree,
  // so the Sandpack iframe never unmounts/reloads when toggling. We also ask
  // the browser for real fullscreen on a best-effort basis (hides browser UI).
  const enterFullscreen = () => {
    setIsFullscreen(true);
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => { usedNativeFullscreen.current = true; }).catch(() => {});
      }
    } catch { /* overlay-only fullscreen is fine */ }
  };
  const exitFullscreen = () => {
    setIsFullscreen(false);
    try {
      if (usedNativeFullscreen.current && document.fullscreenElement) document.exitFullscreen?.();
    } catch { /* ignore */ }
    usedNativeFullscreen.current = false;
  };

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') exitFullscreen(); };
    // Browser's own Esc/exit gesture leaves native fullscreen -> leave overlay too.
    const onFsChange = () => { if (!document.fullscreenElement && usedNativeFullscreen.current) { usedNativeFullscreen.current = false; setIsFullscreen(false); } };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFsChange);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('devdrop-preview-fullscreen');
    return () => {
      document.body.classList.remove('devdrop-preview-fullscreen');
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);
  const prevFilesRef = useRef({});

  useEffect(() => {
    if (!fileData?.files) return;
    const prev = prevFilesRef.current;
    for (const [path, { code }] of Object.entries(fileData.files)) {
      if (prev[path]?.code !== code) sandpack.updateFile(path, code);
    }
    prevFilesRef.current = fileData.files;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileData?.files]);

  useEffect(() => {
    const unsubscribe = listen((msg) => {
      if (msg.type === 'action' && msg.action === 'show-error') {
        setPreviewError(msg.message || 'An error occurred in the preview.');
      } else if (msg.type === 'compile' && msg.message) {
        setPreviewError(msg.message);
      } else if (msg.type === 'success') {
        setPreviewError(null);
      }
    });
    return () => unsubscribe?.();
  }, [listen]);

  useEffect(() => {
    if (isGenerating) setPreviewError(null);
  }, [isGenerating]);

  const handleExportZip = async () => {
    if (isExporting) return;
    setIsExporting(true);
    onDownload?.();
    try {
      const filesToZip = Object.keys(sandpack.files).length > 0 ? sandpack.files : fileData?.files ?? {};
      const dependencies = { ...BASE_DEPENDENCIES, ...(fileData?.dependencies ?? {}) };
      const zip = new JSZip();
      zip.file('package.json', JSON.stringify({
        name: 'generated-app',
        version: '1.0.0',
        private: true,
        dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'react-scripts': '5.0.1', ...dependencies },
        scripts: { start: 'react-scripts start', build: 'react-scripts build' },
      }, null, 2));
      zip.file('public/index.html', `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Generated App</title>\n    <script src="https://cdn.tailwindcss.com"></script>\n  </head>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>`);
      for (const [filePath, fileObj] of Object.entries(filesToZip)) {
        const code = typeof fileObj === 'object' && fileObj !== null && 'code' in fileObj ? fileObj.code : '';
        const zipPath = filePath.startsWith('/') ? `src${filePath}` : `src/${filePath}`;
        zip.file(zipPath, code);
      }
      zip.file('src/index.js', `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nconst root = ReactDOM.createRoot(document.getElementById('root'));\nroot.render(<React.StrictMode><App /></React.StrictMode>);`);
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'generated-app.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented id="view" value={activeTab} onChange={setActiveTab} options={[{ value: 'preview', label: 'Preview', icon: Eye }, { value: 'code', label: 'Code', icon: Code2 }]} />
          <Segmented id="device" value={device} onChange={setDevice} options={[{ value: 'desktop', icon: Monitor, aria: 'Desktop preview' }, { value: 'tablet', icon: Tablet, aria: 'Tablet preview' }, { value: 'mobile', icon: Smartphone, aria: 'Mobile preview' }].map((o) => ({ ...o, label: '' }))} />
          <AnimatePresence initial={false}>
            {isGenerating && (
              <motion.span
                key="building" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2 }}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--s-hi)]/40 bg-[var(--s-surface)] pl-3 pr-3.5 text-[12px] font-semibold tabular-nums text-[var(--s-hi)]"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {percent}%
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'preview' && (
            <button onClick={onHardReload} title="Restart the preview session (fixes a stuck/blank preview)" aria-label="Reload preview" className={BTN_ICON}>
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="relative">
            <button onClick={() => setShowHistory((v) => !v)} title="Your requests" aria-label="History" aria-expanded={showHistory} className={`${BTN_ICON} ${showHistory ? '!border-[var(--s-line-strong)] !text-[var(--s-text)]' : ''}`}>
              <History className="h-3.5 w-3.5" />
            </button>
            {showHistory && (
              <div className="absolute right-0 z-30 mt-2 max-h-72 w-72 overflow-y-auto rounded-2xl border border-[var(--s-line-strong)] bg-[var(--s-surface)] p-2 shadow-none">
                {history.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-[var(--s-faint)]">No requests yet.</p>
                ) : history.map((h, i) => (
                  <p key={i} className="line-clamp-3 border-b border-[var(--s-line)] px-2 py-1.5 text-xs text-[var(--s-muted)] last:border-0">{i + 1}. {h}</p>
                ))}
              </div>
            )}
          </div>
          {onListVersions && (
            <div className="relative">
              <button onClick={() => { setShowVersions((v) => !v); setShowHistory(false); }} disabled={!projectId} title="Version history" aria-label="Versions" aria-expanded={showVersions} className={`${BTN_ICON} ${showVersions ? '!border-[var(--s-line-strong)] !text-[var(--s-text)]' : ''}`}>
                <GitBranch className="h-3.5 w-3.5" />
              </button>
              {showVersions && (
                <VersionHistoryPanel projectId={projectId} refreshKey={versionRefreshKey} disabled={isGenerating} onList={onListVersions} onRestore={async (v) => { await onRestoreVersion(v); setShowVersions(false); }} />
              )}
            </div>
          )}

          <span className="mx-0.5 hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />

          <button onClick={handleExportZip} disabled={isExporting || !fileData} title="Download the project as a ZIP" className={BTN_GHOST}>
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download
          </button>
          <button onClick={() => setShipMode('github')} disabled={!canShip} title={canShip ? 'Push this website to a new GitHub repository' : 'Available once generation is complete'} className={BTN_GHOST}>
            <Github className="h-3.5 w-3.5" /> GitHub
          </button>
          <button onClick={() => setShipMode('live')} disabled={!canShip} title={canShip ? 'Deploy this website live on your Vercel account' : 'Available once generation is complete'} className={BTN_PRIMARY}>
            <Rocket className="h-3.5 w-3.5" /> Publish
          </button>
        </div>
      </div>

      <ShipProjectModal open={Boolean(shipMode)} mode={shipMode} onClose={() => setShipMode(null)} onModeChange={setShipMode} projectId={projectId} title={appTitle} />

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--s-line)] bg-[var(--s-surface)] p-2.5">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--s-line)]">
      <div className="flex items-center gap-3 border-b border-[var(--s-line)] px-3.5 py-2">
        <span className="flex gap-1.5" aria-hidden="true"><i className="h-2 w-2 rounded-full bg-white/15" /><i className="h-2 w-2 rounded-full bg-white/15" /><i className="h-2 w-2 rounded-full bg-white/15" /></span>
        <div className="mx-auto flex max-w-[260px] flex-1 items-center justify-center gap-2 rounded-full bg-white/[0.04] px-3 py-1 text-[11px] text-[var(--s-muted)]">
          <span className={`h-1.5 w-1.5 rounded-full ${isGenerating ? 'animate-pulse bg-[var(--s-hi)]' : fileData ? 'bg-[var(--s-ok)]' : 'bg-white/25'}`} />
          {activeTab === 'preview' ? 'Live preview' : 'Source code'}
        </div>
        <span className="hidden w-[38px] shrink-0 sm:block" aria-hidden="true" />
      </div>
      <div className="relative flex-1 overflow-hidden">
        <SandpackLayout style={{ height: '100%', border: 'none', borderRadius: 0, background: 'transparent' }}>
          {/* Keep the preview iframe mounted at all times — unmounting/remounting
              SandpackPreviewPane on tab switch kills its bundler/iframe handshake
              and the remount comes back as a blank white screen. Hide with CSS instead. */}
          <div style={{ display: activeTab === 'preview' ? 'block' : 'none', height: '100%', width: device === 'desktop' ? '100%' : device === 'tablet' ? 768 : 390, maxWidth: '100%', margin: '0 auto' }}>
            <SandpackPreviewPane style={{ height: '100%', width: '100%' }} showOpenInCodeSandbox={false} showOpenNewtab />
          </div>
          {activeTab === 'code' && (
            <>
              <SandpackFileExplorer style={{ height: '100%', width: 180 }} />
              <SandpackCodeEditor style={{ height: '100%', flex: 1 }} showTabs showLineNumbers readOnly />
            </>
          )}
        </SandpackLayout>
        {isGenerating && activeTab === 'preview' && (
          <GeneratingScreen steps={pipelineSteps} mode={pipelineMode} percent={percent} />
        )}
      </div>
      </div>
      </div>

      {previewError && activeTab === 'preview' && !isGenerating && (
        <div className="border-t border-red-500/30 bg-red-950/80 p-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-red-300">Preview error</p>
              <p className="break-all text-[11px] text-red-300/70">{previewError}</p>
              {/^\s*authentication error/i.test(previewError) && (
                <p className="mt-1 text-[11px] text-red-300/50">
                  This comes from Sandpack's cloud bundler session, not your generated code.
                  Try "Reload preview" above, or allow third-party cookies for codesandbox.io / csb.app in this browser.
                </p>
              )}
            </div>
            {!/^\s*authentication error/i.test(previewError) && (
              <button onClick={() => onFixError(previewError)} className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs text-white hover:bg-red-500">
                <Bot className="h-3 w-3" /> Fix with AI
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppPreview({ fileData, isGenerating, onFixError, pipelineSteps = [], pipelineMode = 'generate', percent = 0, onDownload, projectId = null, appTitle = null, onListVersions, onRestoreVersion, versionRefreshKey = 0 }) {
  const [activeTab, setActiveTab] = useState('preview');
  const [device, setDevice] = useState('desktop');

  useEffect(() => {
    if (fileData) setActiveTab('preview');
  }, [fileData]);

  const files = normalizeGeneratedFiles(fileData?.files ?? PLACEHOLDER_FILES);
  const dependencies = { ...BASE_DEPENDENCIES, ...(fileData?.dependencies ?? {}) };
  const filePathKey = Object.keys(files).sort().join('|');


  return (
    <div className="h-full" style={{ display: 'flex', flexDirection: 'column' }}>
      <SandpackProvider
        key={filePathKey}
        template="react"
        theme="dark"
        files={files}
        customSetup={{ dependencies }}
        options={{ externalResources: ['https://cdn.tailwindcss.com'], recompileMode: 'delayed', recompileDelay: 500 }}
      >
        <SandpackInner
          fileData={fileData}
          isGenerating={isGenerating}
          onFixError={onFixError}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pipelineSteps={pipelineSteps}
          pipelineMode={pipelineMode}
          percent={percent}
          onDownload={onDownload}
          device={device}
          setDevice={setDevice}
          projectId={projectId}
          appTitle={appTitle}
          onListVersions={onListVersions}
          onRestoreVersion={onRestoreVersion}
          versionRefreshKey={versionRefreshKey}
        />
      </SandpackProvider>
    </div>
  );
}