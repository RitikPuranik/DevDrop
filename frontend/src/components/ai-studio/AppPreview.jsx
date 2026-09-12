import React, { useState, useEffect, useRef } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview as SandpackPreviewPane,
  SandpackFileExplorer,
  useSandpack,
} from '@codesandbox/sandpack-react';
import { Eye, Code2, AlertTriangle, Bot, Download, Check, Circle, Loader2 } from 'lucide-react';
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

function SandpackInner({ fileData, isGenerating, onFixError, activeTab, setActiveTab, pipeline, currentStage }) {
  const { sandpack, listen } = useSandpack();
  const [previewError, setPreviewError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
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
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="flex gap-1">
          <button onClick={() => setActiveTab('preview')} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${activeTab === 'preview' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}>
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button onClick={() => setActiveTab('code')} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${activeTab === 'code' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}>
            <Code2 className="h-3.5 w-3.5" /> Code
          </button>
        </div>
        <button onClick={handleExportZip} disabled={isExporting || !fileData} className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40">
          <Download className="h-3.5 w-3.5" /> Download
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <SandpackLayout style={{ height: '100%', border: 'none', borderRadius: 0, background: 'transparent' }}>
          {activeTab === 'preview' ? (
            <SandpackPreviewPane style={{ height: '100%', width: '100%' }} showOpenInCodeSandbox={false} />
          ) : (
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

      {previewError && activeTab === 'preview' && !isGenerating && (
        <div className="border-t border-red-500/30 bg-red-950/80 p-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-red-300">Preview error</p>
              <p className="break-all text-[11px] text-red-300/70">{previewError}</p>
            </div>
            <button onClick={() => onFixError(previewError)} className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs text-white hover:bg-red-500">
              <Bot className="h-3 w-3" /> Fix with AI
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppPreview({ fileData, isGenerating, onFixError, pipeline = {}, currentStage }) {
  const [activeTab, setActiveTab] = useState('preview');

  useEffect(() => {
    if (fileData) setActiveTab('preview');
  }, [fileData]);

  const files = fileData?.files ?? PLACEHOLDER_FILES;
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
          pipeline={pipeline}
          currentStage={currentStage}
        />
      </SandpackProvider>
    </div>
  );
}
