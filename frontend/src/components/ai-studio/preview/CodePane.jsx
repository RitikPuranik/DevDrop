import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

// Loaded lazily — Monaco is heavy and the Code tab isn't always opened.
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const LANGUAGE_BY_EXT = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', css: 'css', scss: 'scss', html: 'html', md: 'markdown',
  yml: 'yaml', yaml: 'yaml', mjs: 'javascript', cjs: 'javascript',
};

function languageFor(path) {
  const ext = path?.split('.').pop()?.toLowerCase();
  return LANGUAGE_BY_EXT[ext] || 'plaintext';
}

export default function CodePane({ files, activePath, onSelectPath }) {
  const active = files.find((f) => f.path === activePath) || files[0];

  React.useEffect(() => {
    if (!activePath && files[0]) onSelectPath(files[0].path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  if (!active) {
    return <div className="flex h-full items-center justify-center text-white/30 text-[12.5px]">No files to show.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-2 border-b border-white/8 text-[12px] font-mono text-white/50 truncate">{active.path}</div>
      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 size={18} className="animate-spin text-white/30" />
            </div>
          }
        >
          <MonacoEditor
            path={active.path}
            language={languageFor(active.path)}
            value={active.content}
            theme="vs-dark"
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, padding: { top: 12 } }}
          />
        </Suspense>
      </div>
    </div>
  );
}
