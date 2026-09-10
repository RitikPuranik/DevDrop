import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Code2, Download, ExternalLink, Eye, Loader2, RefreshCw, Undo2,
} from 'lucide-react';

import { aiStudioAPI } from '../../api/ai';
import { useWebContainerPreview } from '../../hooks/ai-studio/useWebContainerPreview';
import { useModifyPolling } from '../../hooks/ai-studio/useModifyPolling';
import FileTree from '../../components/ai-studio/preview/FileTree';
import PreviewPane from '../../components/ai-studio/preview/PreviewPane';
import CodePane from '../../components/ai-studio/preview/CodePane';
import EditWithAIPanel from '../../components/ai-studio/preview/EditWithAIPanel';
import { downloadZip } from '../../utils/zipFiles';

export default function PreviewWorkspace() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState('preview'); // 'preview' | 'code'
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [files, setFiles] = useState(null);
  const [history, setHistory] = useState([]);
  const [activePath, setActivePath] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [lastEditError, setLastEditError] = useState(null);

  const preview = useWebContainerPreview();
  const bootedOnce = useRef(false);

  const loadProject = useCallback(async () => {
    setLoadingProject(true);
    setLoadError(null);
    try {
      const statusRes = await aiStudioAPI.getJobStatus(jobId);
      const job = statusRes.data;
      if (job.status !== 'completed' || !job.hasFiles) {
        setLoadError('This project has not finished generating yet.');
        setLoadingProject(false);
        return;
      }
      setCanUndo(Boolean(job.canUndo));

      const filesRes = await aiStudioAPI.getJobFiles(jobId);
      setFiles(filesRes.data.files);
      setHistory(filesRes.data.editHistory || []);

      if (!bootedOnce.current) {
        bootedOnce.current = true;
        preview.boot(filesRes.data.files);
      }

      // Resume polling if an edit was already in flight (e.g. page reload).
      if (job.activeChatJobId) {
        modify.start(job.activeChatJobId);
      }
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Could not load this project.');
    } finally {
      setLoadingProject(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const handleApplied = useCallback(
    async (data) => {
      setLastEditError(null);
      if (data.filesChanged) {
        try {
          const filesRes = await aiStudioAPI.getJobFiles(jobId);
          setFiles(filesRes.data.files);
          setHistory(filesRes.data.editHistory || []);
          preview.updateFiles(filesRes.data.files);
          setCanUndo(true);
        } catch {
          // Files still applied server-side; the next load will pick them up.
        }
      } else if (data.summary) {
        setHistory((h) => [...h, { role: 'assistant', message: data.summary }]);
      }
    },
    [jobId, preview]
  );

  const handleFailed = useCallback((message) => {
    setLastEditError(message);
    toast.error(message);
  }, []);

  const modify = useModifyPolling({ jobId, onApplied: handleApplied, onFailed: handleFailed });

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const handleSubmitEdit = async (message) => {
    setLastEditError(null);
    setHistory((h) => [...h, { role: 'user', message }]);
    try {
      const res = await aiStudioAPI.modifyJob(jobId, message);
      modify.start(res.data.chatJobId);
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not apply this change.';
      setLastEditError(msg);
      toast.error(msg);
    }
  };

  const handleUndo = async () => {
    setUndoing(true);
    try {
      const res = await aiStudioAPI.undoLastChange(jobId);
      setFiles(res.data.files);
      setCanUndo(false);
      preview.updateFiles(res.data.files);
      toast.success('Reverted to the previous version.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Nothing to undo.');
    } finally {
      setUndoing(false);
    }
  };

  const handleDownload = () => {
    if (!files) return;
    downloadZip(files, `devdrop-project-${jobId.slice(0, 8)}.zip`);
  };

  if (loadingProject) {
    return (
      <div className="min-h-screen bg-[#08090a] flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-white/30" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#08090a] flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-white/70 text-[14px]">{loadError}</p>
        <button
          type="button"
          onClick={() => navigate('/ai-studio')}
          className="px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-[12.5px] font-bold text-white"
        >
          Back to AI Studio
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#08090a] text-[#e7e9ea] overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 h-14 border-b border-white/8 shrink-0">
        <button type="button" onClick={() => navigate('/ai-studio')} className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <span className="text-[13px] font-bold">DevDrop</span>
        <span className="text-white/20">/</span>
        <span className="text-[13px] text-white/50 font-mono truncate max-w-[160px]">{jobId.slice(0, 12)}</span>

        <div className="ml-4 flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
              tab === 'preview' ? 'bg-white text-black' : 'text-white/50 hover:text-white'
            }`}
          >
            <Eye size={13} /> Preview
          </button>
          <button
            type="button"
            onClick={() => setTab('code')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
              tab === 'code' ? 'bg-white text-black' : 'text-white/50 hover:text-white'
            }`}
          >
            <Code2 size={13} /> Code
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {canUndo && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoing}
              title="Undo last change"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/60 hover:text-white disabled:opacity-40"
            >
              {undoing ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Undo
            </button>
          )}
          <button
            type="button"
            onClick={preview.refresh}
            title="Refresh preview"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/60 hover:text-white"
          >
            <RefreshCw size={13} />
          </button>
          {preview.previewUrl && (
            <a
              href={preview.previewUrl}
              target="_blank"
              rel="noreferrer"
              title="Open in new tab"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/60 hover:text-white"
            >
              <ExternalLink size={13} />
            </a>
          )}
          <button
            type="button"
            onClick={handleDownload}
            title="Download project"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-[12px] font-bold"
          >
            <Download size={13} /> Download
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '220px 1fr 320px' }}>
        <aside className="border-r border-white/8 overflow-y-auto">
          {files && <FileTree files={files} activePath={activePath} onSelect={setActivePath} />}
        </aside>

        <main className="min-w-0 bg-black">
          {tab === 'preview' ? (
            <PreviewPane
              state={preview.state}
              previewUrl={preview.previewUrl}
              error={preview.error}
              reloadNonce={preview.reloadNonce}
              onRetry={preview.retry}
            />
          ) : (
            files && <CodePane files={files} activePath={activePath} onSelectPath={setActivePath} />
          )}
        </main>

        <aside className="min-h-0">
          <EditWithAIPanel
            history={history}
            isApplying={modify.isActive}
            applyStatus={modify.status}
            lastError={lastEditError}
            onSubmit={handleSubmitEdit}
          />
        </aside>
      </div>
    </div>
  );
}
