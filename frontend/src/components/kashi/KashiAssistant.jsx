import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { kashiAPI } from '../../api/kashi';

const STORAGE_KEY = 'kashi_chat_v1';
const GREETING = {
  role: 'assistant',
  content: "Hi, I'm Kashi. Ask me anything about DevDrop, or tell me where to go — \"open AI Studio\", \"show my deployments\", \"templates\"…",
};
const SUGGESTIONS = ['Open AI Studio', 'Browse templates', 'Deploy my own project', 'Go to my workspace'];

const readSaved = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? parsed.slice(-30) : [GREETING];
  } catch {
    return [GREETING];
  }
};

/**
 * Floating assistant. Sends the question to the fast Groq model via
 * /api/kashi/chat and carries out the actions it returns:
 *   - navigate        -> react-router navigation (paths are validated server-side)
 *   - fix_deployment  -> starts the build-fix run for the deployment being viewed
 */
export default function KashiAssistant({ side = 'right' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(readSaved);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch { /* storage unavailable — chat still works */ }
  }, [messages]);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      inputRef.current?.focus();
    }
  }, [open, messages, sending]);

  const deploymentId = location.pathname.match(/^\/deployments\/([a-f0-9]{24})/i)?.[1] || null;

  const runActions = useCallback(async (actions = []) => {
    for (const action of actions) {
      if (action.type === 'navigate' && typeof action.path === 'string') {
        navigate(action.path);
      } else if (action.type === 'fix_deployment' && action.deploymentId) {
        try {
          await kashiAPI.startFix(action.deploymentId);
          window.dispatchEvent(new CustomEvent('kashi-fix-started', { detail: { deploymentId: action.deploymentId } }));
          toast.success('Kashi is fixing the build — watch the progress on this page.');
        } catch (err) {
          toast.error(err.response?.data?.message || 'Kashi could not start the fix.');
        }
      }
    }
  }, [navigate]);

  const send = async (text) => {
    const message = String(text ?? input).trim();
    if (!message || sending) return;
    const history = messages.filter((m) => m !== GREETING).slice(-8);
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    setSending(true);
    try {
      const res = await kashiAPI.chat({ message, history, context: { path: location.pathname, deploymentId } });
      const data = res.data?.data;
      setMessages((prev) => [...prev, { role: 'assistant', content: data?.reply || 'Done.' }]);
      await runActions(data?.actions);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: err.response?.data?.message || 'I could not reach my brain just now. Please try again.' }]);
    } finally {
      setSending(false);
    }
  };

  const pos = side === 'left' ? 'left-4 md:left-6' : 'right-4 md:right-6';

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Kashi assistant"
          className={`fixed bottom-4 md:bottom-6 ${pos} z-[60] h-12 pl-3.5 pr-4 rounded-full bg-[#8b7355] text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] border border-white/10 hover:bg-[#725e46] transition-colors inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em]`}
        >
          <Sparkles size={16} /> Kashi
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Kashi assistant"
          className={`fixed bottom-4 md:bottom-6 ${pos} z-[60] w-[calc(100vw-2rem)] max-w-[380px] h-[min(560px,calc(100vh-2rem))] rounded-[24px] border border-white/10 bg-[#0b0b0b]/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-[#8b7355]/20 border border-[#8b7355]/30 flex items-center justify-center"><Sparkles size={15} className="text-[#cbb392]" /></span>
              <div>
                <div className="font-bold text-sm leading-none">Kashi</div>
                <div className="text-[10px] text-white/35 mt-1">DevDrop assistant</div>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-8 h-8 rounded-lg hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center"><X size={16} /></button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#8b7355] text-white rounded-br-md' : 'bg-white/[0.05] text-white/80 border border-white/8 rounded-bl-md'}`}>{m.content}</div>
              </div>
            ))}
            {sending && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md bg-white/[0.05] border border-white/8 px-3.5 py-2.5"><Loader2 size={14} className="animate-spin text-white/40" /></div></div>}
            {messages.length <= 1 && !sending && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="px-3 py-1.5 rounded-full border border-white/10 text-[11px] text-white/60 hover:text-white hover:bg-white/5 transition-colors">{s}</button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-white/8 flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1200}
              placeholder={deploymentId ? 'Ask Kashi, or "fix this deployment"…' : 'Ask Kashi or say where to go…'}
              className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm outline-none focus:border-[#8b7355] placeholder:text-white/25"
            />
            <button type="submit" disabled={sending || !input.trim()} aria-label="Send" className="w-10 h-10 rounded-xl bg-[#8b7355] hover:bg-[#725e46] disabled:opacity-40 flex items-center justify-center transition-colors"><Send size={15} /></button>
          </form>
        </div>
      )}
    </>
  );
}
