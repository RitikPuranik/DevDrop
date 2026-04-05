import React, { useState } from "react";
import {
  Monitor, Tablet, Smartphone, Eye, EyeOff, Undo2, Redo2,
  Download, Layout, Sparkles, Grid3x3, Globe, ChevronDown,
  ZoomIn, ZoomOut, RotateCcw,
} from "lucide-react";
import { useStore } from "../../store/useStore.js";

export default function TopBar() {
  const {
    siteMeta, updateSiteMeta,
    previewMode, setPreviewMode,
    viewportSize, setViewportSize,
    showGrid, toggleGrid,
    zoom, setZoom,
    undo, redo,
    history, historyIndex,
    setShowExportModal,
    setShowTemplatesModal,
    setShowAIPanel, showAIPanel,
  } = useStore();

  const [editingName, setEditingName] = useState(false);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <header
      className="flex items-center gap-2 px-4 shrink-0 z-50"
      style={{
        height: 48,
        background: "#12121a",
        borderBottom: "1px solid #23232f",
      }}
    >
      {/* ── Brand ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mr-2 shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-100"
        >
          <Globe size={13} className="text-black" />
        </div>
        <span className="font-bold text-white text-sm tracking-tight select-none">
          DevDrop
        </span>
      </div>

      <div className="w-px h-5 bg-zinc-700 mx-1" />

      {/* ── Site name (editable) ─────────────────────────── */}
      {editingName ? (
        <input
          autoFocus
          className="text-white text-sm px-2 py-1 rounded-md border border-indigo-500 outline-none w-36 bg-zinc-800"
          value={siteMeta.name}
          onChange={(e) => updateSiteMeta({ name: e.target.value })}
          onBlur={() => setEditingName(false)}
          onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
        />
      ) : (
        <button
          onClick={() => setEditingName(true)}
          className="flex items-center gap-1 text-zinc-300 hover:text-white text-sm px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
        >
          {siteMeta.name}
          <ChevronDown size={11} className="text-zinc-500" />
        </button>
      )}

      <div className="w-px h-5 bg-zinc-700 mx-1" />

      {/* ── Undo / Redo ──────────────────────────────────── */}
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed !px-2"
      >
        <Undo2 size={14} />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed !px-2"
      >
        <Redo2 size={14} />
      </button>

      <div className="w-px h-5 bg-zinc-700 mx-1" />

      {/* ── Templates ────────────────────────────────────── */}
      <button
        onClick={() => setShowTemplatesModal(true)}
        className="btn-ghost !text-xs"
        title="Templates"
      >
        <Layout size={14} />
        <span className="hidden lg:block">Templates</span>
      </button>

      {/* ── AI Generate ──────────────────────────────────── */}
      <button
        onClick={() => setShowAIPanel(!showAIPanel)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          showAIPanel
            ? "bg-amber-100 text-black"
            : "bg-amber-100/15 text-amber-200 hover:bg-amber-100/25 border border-amber-200/30"
        }`}
      >
        <Sparkles size={13} />
        <span className="hidden md:block">AI Generate</span>
      </button>

      {/* ── Spacer ───────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Zoom controls ────────────────────────────────── */}
      <div className="hidden lg:flex items-center gap-0.5 bg-zinc-800 rounded-lg px-1 py-1 border border-zinc-700">
        <button onClick={() => setZoom(Math.max((zoom ?? 1) - 0.1, 0.3))} className="p-1 text-zinc-400 hover:text-white transition-colors rounded">
          <ZoomOut size={13} />
        </button>
        <span className="text-xs text-zinc-400 w-9 text-center font-mono">
          {Math.round((zoom ?? 1) * 100)}%
        </span>
        <button onClick={() => setZoom(Math.min((zoom ?? 1) + 0.1, 2))} className="p-1 text-zinc-400 hover:text-white transition-colors rounded">
          <ZoomIn size={13} />
        </button>
        <button onClick={() => setZoom(1)} className="p-1 text-zinc-500 hover:text-white transition-colors rounded border-l border-zinc-700 ml-0.5 pl-1.5">
          <RotateCcw size={11} />
        </button>
      </div>

      <div className="w-px h-5 bg-zinc-700 mx-1" />

      {/* ── Viewport switcher ────────────────────────────── */}
      <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-1 border border-zinc-700">
        {[
          { id: "desktop", Icon: Monitor, label: "Desktop" },
          { id: "tablet",  Icon: Tablet,  label: "Tablet"  },
          { id: "mobile",  Icon: Smartphone, label: "Mobile" },
        ].map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => setViewportSize(id)}
            title={label}
            className={`p-1.5 rounded-md transition-all duration-150 ${
              viewportSize === id
                ? "bg-amber-100 text-black"
                : "text-zinc-500 hover:text-white"
            }`}
          >
            <Icon size={13} />
          </button>
        ))}
      </div>

      {/* ── Grid toggle ──────────────────────────────────── */}
      <button
        onClick={toggleGrid}
        title="Toggle Grid"
        className={`btn-ghost !px-2 ${showGrid ? "!text-indigo-400" : ""}`}
      >
        <Grid3x3 size={14} />
      </button>

      {/* ── Preview ──────────────────────────────────────── */}
      <button
        onClick={() => setPreviewMode(!previewMode)}
        title={previewMode ? "Exit Preview" : "Preview"}
        className={`btn-ghost !text-xs ${previewMode ? "!text-amber-200" : ""}`}
      >
        {previewMode ? <EyeOff size={14} /> : <Eye size={14} />}
        <span className="hidden md:block">{previewMode ? "Edit" : "Preview"}</span>
      </button>

      <div className="w-px h-5 bg-amber-200/30 mx-1" />

      {/* ── Export ───────────────────────────────────────── */}
      <button
        onClick={() => setShowExportModal(true)}
        className="btn-primary !text-xs !py-1.5 bg-amber-100 text-black hover:bg-amber-100/90"
      >
        <Download size={13} />
        Export
      </button>
    </header>
  );
}
