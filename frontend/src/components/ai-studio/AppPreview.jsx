import React, { useState, useEffect, useRef } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview as SandpackPreviewPane,
  SandpackFileExplorer,
  useSandpack,
} from '@codesandbox/sandpack-react';
import { Eye, Code2, AlertTriangle, Bot, Download, Check, Circle, Loader2, RefreshCw, Monitor, Tablet, Smartphone, History } from 'lucide-react';
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

const PIPELINE_STAGES = [
  ['requirements', 'Requirements', 'Understanding your website requirements'],
  ['design', 'Design', 'Creating the visual design system'],
  ['architecture', 'Architecture', 'Planning pages, components and dependencies'],
  ['code-generation', 'Code Generation', 'Writing the React application files'],
  ['integration', 'Integration', 'Connecting and checking generated files'],
  ['build-validator', 'Validation', 'Running final syntax and build checks'],
];

function PipelineProgress({ pipeline = {}, currentStage, isGenerating }) {
  const getStatus = (key) => {
    if (key === 'code-generation') {
      const entries = Object.entries(pipeline).filter(([name]) => name.startsWith('code:'));
      if (entries.some(([, status]) => status === 'processing' || status === 'started')) return 'processing';
      if (entries.length > 0 && entries.every(([, status]) => status === 'completed')) return 'completed';
      return pipeline[key] || 'pending';
    }
    return pipeline[key] || 'pending';
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/95 px-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900/95 p-5 shadow-2xl">
        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <Bot className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold text-white">AI is building your website</span>
          </div>
          <p className="text-xs text-white/35">Each stage is updated from the real generation pipeline.</p>
        </div>

        <div className="space-y-3">
          {PIPELINE_STAGES.map(([key, label, description]) => {
            const status = getStatus(key);
            const active = status === 'processing' || status === 'started' || currentStage === key;
            const completed = status === 'completed';
            return (
              <div key={key} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                  {completed ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                  ) : (
                    <Circle className="h-2.5 w-2.5 text-white/20" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-medium ${completed ? 'text-white/70' : active ? 'text-white' : 'text-white/30'}`}>
                    {label}
                    {active && !completed ? <span className="ml-1 text-violet-400">in progress</span> : null}
                    {completed ? <span className="ml-1 text-emerald-400/80">done</span> : null}
                  </div>
                  <p className="mt-0.5 text-[10px] text-white/20">{description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SandpackInner({ fileData, isGenerating, onFixError, activeTab, setActiveTab, pipeline, currentStage, onHardReload, onDownload, device, setDevice, history = [] }) {
  const { sandpack, listen } = useSandpack();
  const [previewError, setPreviewError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
      <div className="flex items-center justify-between gap-3 pb-2.5">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-white/[0.12] bg-[#0b0b0c] p-0.5">
            <button onClick={() => setActiveTab('preview')} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] ${activeTab === 'preview' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}>
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <button onClick={() => setActiveTab('code')} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] ${activeTab === 'code' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}>
              <Code2 className="h-3.5 w-3.5" /> Code
            </button>
          </div>
          <div className="flex rounded-lg border border-white/[0.12] bg-[#0b0b0c] p-0.5">
            {[['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]].map(([id, Icon]) => (
              <button key={id} onClick={() => setDevice(id)} aria-label={`${id} preview`} className={`rounded-md px-2 py-1 ${device === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}>
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'preview' && (
            <button onClick={onHardReload} title="Restart the preview session (fixes a stuck/blank preview)" aria-label="Reload preview" className="rounded-lg border border-white/[0.12] bg-[#0b0b0c] p-1.5 text-white/55 hover:text-white">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={handleExportZip} disabled={isExporting || !fileData} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3.5 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40">
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {fileData && !isGenerating ? 'Download ZIP (Complete)' : 'Download ZIP'}
          </button>
          <div className="relative">
            <button onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-2 rounded-lg border border-white/[0.12] bg-[#0b0b0c] px-3 py-1.5 text-[12px] text-white/80 hover:text-white">
              <History className="h-3.5 w-3.5" /> History
            </button>
            {showHistory && (
              <div className="absolute right-0 z-30 mt-2 max-h-72 w-72 overflow-y-auto rounded-xl border border-white/[0.12] bg-[#0b0b0c] p-2 shadow-2xl">
                {history.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-white/40">No requests yet.</p>
                ) : history.map((h, i) => (
                  <p key={i} className="line-clamp-3 border-b border-white/[0.06] px-2 py-1.5 text-xs text-white/70 last:border-0">{i + 1}. {h}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/[0.12] bg-[#0b0b0c] p-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.12]">
      <div className="border-b border-white/[0.12] px-3 py-1.5 text-[11px] text-white/70">{activeTab === 'preview' ? 'Live Preview' : 'Source Code'}</div>
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
          <PipelineProgress pipeline={pipeline} currentStage={currentStage} isGenerating={isGenerating} />
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

export default function AppPreview({ fileData, isGenerating, onFixError, pipeline = {}, currentStage, onDownload, history = [] }) {
  const [activeTab, setActiveTab] = useState('preview');
  const [sessionNonce, setSessionNonce] = useState(0);
  const [device, setDevice] = useState('desktop');

  useEffect(() => {
    if (fileData) setActiveTab('preview');
  }, [fileData]);

  const files = normalizeGeneratedFiles(fileData?.files ?? PLACEHOLDER_FILES);
  const dependencies = { ...BASE_DEPENDENCIES, ...(fileData?.dependencies ?? {}) };
  const filePathKey = Object.keys(files).sort().join('|');

  // A full remount (new SandpackProvider instance) opens a brand-new bundler
  // session. That's the reliable recovery for Sandpack's cloud-bundler
  // "Authentication error" / stuck-white-screen state — a CSS-hide/show
  // toggle alone can't fix a broken bundler session, only a broken tab switch.
  const handleHardReload = () => setSessionNonce((n) => n + 1);

  return (
    <div className="h-full" style={{ display: 'flex', flexDirection: 'column' }}>
      <SandpackProvider
        key={`${filePathKey}::${sessionNonce}`}
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
          pipeline={pipeline}
          currentStage={currentStage}
          onHardReload={handleHardReload}
          onDownload={onDownload}
          device={device}
          setDevice={setDevice}
          history={history}
        />
      </SandpackProvider>
    </div>
  );
}