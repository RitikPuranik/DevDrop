import React, { useState, useEffect, useRef } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview as SandpackPreviewPane,
  SandpackFileExplorer,
  useSandpack,
} from '@codesandbox/sandpack-react';
import { Eye, Code2, AlertTriangle, Bot, Download } from 'lucide-react';
import JSZip from 'jszip';

// Adapted from https://github.com/piyush-eon/ai-app-builder (components/CodePanel.tsx),
// trimmed down to just generate + preview + code + export-to-zip -- no
// Pro/Cline "Improve with Agent" step, no credits gating.

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
        <div style={{ fontSize: 40, marginBottom: 16 }}>&#9889;</div>
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

function SandpackInner({ fileData, isGenerating, onFixError, activeTab, setActiveTab }) {
  const { sandpack, listen } = useSandpack();
  const [previewError, setPreviewError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const prevFilesRef = useRef({});

  // Push updated file contents into the live Sandpack instance without
  // remounting the provider (the provider is only re-keyed when the set of
  // file paths changes -- see AppPreview below).
  useEffect(() => {
    if (!fileData?.files) return;
    const prev = prevFilesRef.current;
    for (const [path, { code }] of Object.entries(fileData.files)) {
      if (prev[path]?.code !== code) {
        sandpack.updateFile(path, code);
      }
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
      zip.file(
        'package.json',
        JSON.stringify(
          {
            name: 'generated-app',
            version: '1.0.0',
            private: true,
            dependencies: {
              react: '^18.2.0',
              'react-dom': '^18.2.0',
              'react-scripts': '5.0.1',
              ...dependencies,
            },
            scripts: { start: 'react-scripts start', build: 'react-scripts build' },
          },
          null,
          2
        )
      );
      zip.file(
        'public/index.html',
        `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Generated App</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`
      );
      for (const [filePath, fileObj] of Object.entries(filesToZip)) {
        const code = typeof fileObj === 'object' && fileObj !== null && 'code' in fileObj ? fileObj.code : '';
        const zipPath = filePath.startsWith('/') ? `src${filePath}` : `src/${filePath}`;
        zip.file(zipPath, code);
      }
      zip.file(
        'src/index.js',
        `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);`
      );

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
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
              activeTab === 'preview' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
              activeTab === 'code' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            Code
          </button>
        </div>
        <button
          onClick={handleExportZip}
          disabled={isExporting || !fileData}
          className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          Download
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
      </div>

      {previewError && activeTab === 'preview' && !isGenerating && (
        <div className="border-t border-red-500/30 bg-red-950/80 p-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-red-300">Preview error</p>
              <p className="break-all text-[11px] text-red-300/70">{previewError}</p>
            </div>
            <button
              onClick={() => onFixError(previewError)}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs text-white hover:bg-red-500"
            >
              <Bot className="h-3 w-3" />
              Fix with AI
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppPreview({ fileData, isGenerating, onFixError }) {
  const [activeTab, setActiveTab] = useState('preview');

  useEffect(() => {
    if (fileData) setActiveTab('preview');
  }, [fileData]);

  const files = fileData?.files ?? PLACEHOLDER_FILES;
  const dependencies = { ...BASE_DEPENDENCIES, ...(fileData?.dependencies ?? {}) };

  // Re-key (remount) only when the SET of file paths changes -- content
  // updates flow through sandpack.updateFile() inside SandpackInner so
  // typing/generation doesn't cause a full remount + reload every time.
  const filePathKey = Object.keys(files).sort().join('|');

  return (
    <div className="h-full" style={{ display: 'flex', flexDirection: 'column' }}>
      <SandpackProvider
        key={filePathKey}
        template="react"
        theme="dark"
        files={files}
        customSetup={{ dependencies }}
        options={{
          externalResources: ['https://cdn.tailwindcss.com'],
          recompileMode: 'delayed',
          recompileDelay: 500,
        }}
      >
        <SandpackInner
          fileData={fileData}
          isGenerating={isGenerating}
          onFixError={onFixError}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      </SandpackProvider>
    </div>
  );
}
