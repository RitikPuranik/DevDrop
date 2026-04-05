import React, { useState } from "react";
import { Sparkles, X, Loader2, AlertCircle } from "lucide-react";
import { useStore } from "../../store/useStore.js";

const PROMPT_SUGGESTIONS = [
  "A modern SaaS landing page with pricing",
  "Portfolio site for a UX designer",
  "Restaurant website with menu and reservations",
  "Fitness app landing page",
  "Tech startup with features and testimonials",
];

export default function AIPanel() {
  const { setShowAIPanel, generateWithAI, isAIGenerating, aiError } = useStore();
  const [prompt, setPrompt] = useState("");

  const handleGenerate = () => {
    if (!prompt.trim() || isAIGenerating) return;
    generateWithAI(prompt);
  };

  return (
    <div
      className="absolute inset-y-0 right-0 flex flex-col animate-in"
      style={{
        width: 320,
        background: "#16161e",
        borderLeft: "1px solid #2a2a38",
        zIndex: 40,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid #2a2a38" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)" }}
          >
            <Sparkles size={13} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">AI Generate</div>
            <div className="text-[10px] text-zinc-500">Describe your website</div>
          </div>
        </div>
        <button
          onClick={() => setShowAIPanel(false)}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* Prompt textarea */}
        <div className="mb-4">
          <label className="label">Your Website Description</label>
          <textarea
            className="input-field resize-none"
            rows={5}
            placeholder="e.g. A modern SaaS landing page for a project management tool with hero, features, pricing, and testimonials..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate();
            }}
          />
          <div className="text-[10px] text-zinc-600 mt-1">Tip: Press Ctrl+Enter to generate</div>
        </div>

        {/* Suggestions */}
        <div className="mb-6">
          <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2">Quick Ideas</div>
          <div className="flex flex-col gap-1.5">
            {PROMPT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setPrompt(s)}
                className="text-left text-xs text-zinc-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                → {s}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {aiError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
            <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 leading-relaxed">{aiError}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 shrink-0" style={{ borderTop: "1px solid #2a2a38" }}>
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isAIGenerating}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff" }}
        >
          {isAIGenerating ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={15} />
              Generate Website
            </>
          )}
        </button>
        <p className="text-[10px] text-zinc-600 text-center mt-2">
          This will replace the current page content
        </p>
      </div>
    </div>
  );
}
