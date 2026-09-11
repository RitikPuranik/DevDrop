import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Loader2, Bot, User } from 'lucide-react';
import { usePostHog } from '@posthog/react';

import { aiGenerateAPI } from '../../api/aiGenerate';
import AppPreview from '../../components/ai-studio/AppPreview';

/**
 * AI Studio uses an asynchronous backend job backed by the standalone
 * top-level ai-service. The main DevDrop API returns immediately after the
 * job is queued, while the browser polls for the completed project.
 */
export default function AiStudio() {
  const navigate = useNavigate();
  const posthog = usePostHog();

  const [messages, setMessages] = useState([]);
  const [fileData, setFileData] = useState(null);
  const [appTitle, setAppTitle] = useState(null);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const aiStudioEnabled = import.meta.env.VITE_AI_STUDIO_ENABLED !== 'false';

  useEffect(() => {
    if (!aiStudioEnabled) navigate('/workspace', { replace: true });
  }, [aiStudioEnabled, navigate]);

  useEffect(() => {
    try {
      posthog?.capture('ai_studio_opened');
    } catch {
      // Analytics should never break the page.
    }
  }, [posthog]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isGenerating, generationStatus]);

  if (!aiStudioEnabled) return null;

  const waitForJob = async (jobId) => {
    const startedAt = Date.now();
    const maxWaitMs = 10 * 60 * 1000;

    while (Date.now() - startedAt < maxWaitMs) {
      const { data } = await aiGenerateAPI.getJob(jobId);
      const job = data?.data;

      if (!job) throw new Error('AI service returned an invalid job response.');

      if (job.status === 'completed' && job.result) {
        return job.result;
      }

      if (job.status === 'failed') {
        const err = new Error(job.error || 'AI generation failed.');
        err.userMessage = job.error || 'AI generation failed. Please try again.';
        throw err;
      }

      setGenerationStatus(job.status === 'queued' ? 'Queued…' : 'AI is building your app…');
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const err = new Error('AI generation timed out while waiting for the worker.');
    err.userMessage = 'AI generation took too long. The worker may still be processing it. Please try again.';
    throw err;
  };

  const runGeneration = async (nextMessages) => {
    setIsGenerating(true);
    setGenerationStatus('Queuing AI job…');
    setError(null);

    try {
      const { data } = await aiGenerateAPI.generate(nextMessages, fileData);
      const jobId = data?.data?.jobId;
      if (!jobId) throw new Error('AI service did not return a job id.');

      setGenerationStatus('AI job queued…');
      const result = await waitForJob(jobId);

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.assistantMessage || 'Done.' },
      ]);
      setFileData({ files: result.files, dependencies: result.dependencies });
      if (result.title) setAppTitle(result.title);
    } catch (err) {
      const msg = err.userMessage || err.response?.data?.message || err.message || 'Something went wrong generating your app. Please try again.';
      setError(msg);
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${msg}` }]);
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    setInput('');
    const nextMessages = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    void runGeneration(nextMessages);
  };

  const handleFixError = (previewError) => {
    if (isGenerating) return;
    const prompt = `The preview threw this error, please fix it:\n\n${previewError}`;
    const nextMessages = [...messages, { role: 'user', content: prompt }];
    setMessages(nextMessages);
    void runGeneration(nextMessages);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950 text-white">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <button
          type="button"
          onClick={() => navigate('/workspace')}
          className="inline-flex items-center gap-2 text-sm text-neutral-300 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to DevDrop
        </button>
        <span className="text-sm font-medium text-neutral-300">{appTitle || 'AI Studio'}</span>
        <span className="w-24" />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[380px] shrink-0 flex-col border-r border-neutral-800">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="mt-8 text-center text-sm text-neutral-500">
                Describe the app or website you want, e.g. "a portfolio site with a dark theme, a hero
                section, and a contact form."
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && <Bot className="mt-1 h-4 w-4 shrink-0 text-violet-400" />}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-violet-600 text-white' : 'bg-neutral-900 text-neutral-200'
                  }`}
                >
                  {m.content}
                </div>
                {m.role === 'user' && <User className="mt-1 h-4 w-4 shrink-0 text-neutral-500" />}
              </div>
            ))}
            {isGenerating && (
              <div className="flex items-center gap-2 text-sm text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {generationStatus || 'Generating…'}
              </div>
            )}
          </div>

          <div className="border-t border-neutral-800 p-3">
            <div className="flex items-end gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Describe what to build or change…"
                rows={2}
                className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isGenerating}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1">
          <AppPreview
            fileData={fileData}
            appTitle={appTitle}
            onFixError={handleFixError}
            isGenerating={isGenerating}
          />
        </div>
      </div>
    </div>
  );
}
