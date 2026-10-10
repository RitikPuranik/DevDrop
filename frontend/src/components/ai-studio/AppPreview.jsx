import React, { useState, useEffect, useRef } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview as SandpackPreviewPane,
  SandpackFileExplorer,
  useSandpack,
} from '@codesandbox/sandpack-react';
import { Eye, Code2, AlertTriangle, Bot, Download, Loader2, Monitor, Tablet, Smartphone, History, Rocket, Maximize2, Minimize2 } from 'lucide-react';
import VersionHistoryPanel from './preview/VersionHistoryPanel';
import ShipProjectModal from './ShipProjectModal';
import Github from './GithubIcon';
import { PipelineSteps, PIPELINE_TITLES } from './pipelineSteps';
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

function PipelineProgress({ steps, mode = 'generate', percent = 0 }) {
  const title = PIPELINE_TITLES[mode] || PIPELINE_TITLES.generate;
  const card = (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900/95 p-5 shadow-2xl">
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-white"><Bot className="h-4 w-4 text-violet-400" /> {title}</span>
          <span className="text-[11px] text-white/40">{percent}%</span>
        </div>
        <p className="text-xs text-white/35">Each stage is updated from the real {mode === 'generate' ? 'generation' : mode === 'edit' ? 'editing' : 'debug'} pipeline.</p>
      </div>
      <PipelineSteps steps={steps} variant="detailed" />
    </div>
  );
  // A full generation has nothing to show yet, so it covers the preview. An
  // edit/debug run already has a working site on screen -- keep it visible and
  // show progress as a floating card instead of blanking it out.
  if (mode === 'generate') {
    return <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/95 px-6 backdrop-blur-sm">{card}</div>;
  }
  return <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">{card}</div>;
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
    <div className={isFullscreen ? 'fixed inset-0 z-[200] flex flex-col bg-[#050506] p-4' : 'flex h-full flex-col'}>
      <div className="mb-3 h-px w-full bg-white/[0.12]" aria-hidden="true" />
      <div className="flex items-center justify-between gap-3 pb-2.5">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-white/[0.12] bg-[#0b0b0c] p-0.5">
            <button onClick={() => setActiveTab('preview')} title="Preview" aria-label="Preview" className={`group flex items-center rounded-md px-2.5 py-1 text-[11px] ${activeTab === 'preview' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}>
              <Eye className="h-3.5 w-3.5" /><HoverLabel>Preview</HoverLabel>
            </button>
            <button onClick={() => setActiveTab('code')} title="Code" aria-label="Code" className={`group flex items-center rounded-md px-2.5 py-1 text-[11px] ${activeTab === 'code' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}>
              <Code2 className="h-3.5 w-3.5" /><HoverLabel>Code</HoverLabel>
            </button>
          </div>
          <div className="flex rounded-lg border border-white/[0.12] bg-[#0b0b0c] p-0.5">
            {[['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]].map(([id, Icon]) => (
              <button key={id} onClick={() => setDevice(id)} title={`${id[0].toUpperCase()}${id.slice(1)} view`} aria-label={`${id} preview`} className={`rounded-md px-2 py-1 ${device === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}>
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportZip} disabled={isExporting || !fileData} title="Download" aria-label="Download" className="group flex items-center rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40">
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}<HoverLabel>Download</HoverLabel>
          </button>
          <button onClick={() => setShipMode('github')} disabled={!canShip} title={canShip ? 'Push this website to a new GitHub repository' : 'Available once generation is complete'} aria-label="Push to GitHub" className="group flex items-center rounded-lg border border-white/[0.12] bg-[#0b0b0c] px-3 py-1.5 text-[12px] text-white/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Github className="h-3.5 w-3.5" /><HoverLabel>Push to GitHub</HoverLabel>
          </button>
          <button onClick={() => setShipMode('live')} disabled={!canShip} title={canShip ? 'Deploy this website live on your Vercel account' : 'Available once generation is complete'} aria-label="Publish Live" className="group flex items-center rounded-lg border border-white/[0.12] bg-[#0b0b0c] px-3 py-1.5 text-[12px] text-white/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Rocket className="h-3.5 w-3.5" /><HoverLabel>Publish Live</HoverLabel>
          </button>
          {onListVersions && (
            <div className="relative">
              <button onClick={() => { setShowVersions((v) => !v); }} disabled={!projectId} title="History" aria-label="History" className="group flex items-center rounded-lg border border-white/[0.12] bg-[#0b0b0c] px-3 py-1.5 text-[12px] text-white/80 hover:text-white disabled:opacity-40">
                <History className="h-3.5 w-3.5" /><HoverLabel>History</HoverLabel>
              </button>
              {showVersions && (
                <VersionHistoryPanel projectId={projectId} refreshKey={versionRefreshKey} disabled={isGenerating} onList={onListVersions} onRestore={async (v) => { await onRestoreVersion(v); setShowVersions(false); }} />
              )}
            </div>
          )}
          <button onClick={isFullscreen ? exitFullscreen : enterFullscreen} title={isFullscreen ? 'Exit full screen (Esc)' : 'View the website full screen'} aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'} className="group flex items-center rounded-lg border border-white/[0.12] bg-[#0b0b0c] px-2.5 py-1.5 text-[12px] text-white/80 hover:text-white">
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}<HoverLabel>{isFullscreen ? 'Exit' : 'Full screen'}</HoverLabel>
          </button>
        </div>
      </div>

      <ShipProjectModal open={Boolean(shipMode)} mode={shipMode} onClose={() => setShipMode(null)} onModeChange={setShipMode} projectId={projectId} title={appTitle} />

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/[0.12] bg-[#0b0b0c] p-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.12]">
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
          <PipelineProgress steps={pipelineSteps} mode={pipelineMode} percent={percent} />
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