import React, { useEffect, useCallback } from "react";
import { useStore } from "../../store/useStore.js";
import TopBar from "./TopBar.jsx";
import LeftPanel from "./LeftPanel.jsx";
import Canvas from "./Canvas.jsx";
import RightPanel from "./RightPanel.jsx";
import ExportModal from "../modals/ExportModal.jsx";
import TemplatesModal from "../modals/TemplatesModal.jsx";
import AIPanel from "../panels/AIPanel.jsx";

export default function BuilderLayout() {
  const {
    previewMode,
    showExportModal,
    showTemplatesModal,
    showAIPanel,
    undo,
    redo,
  } = useStore();

  const handleKeyDown = useCallback(
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault(); undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
        e.preventDefault(); redo();
      }
    },
    [undo, redo]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    /* 
      Single root div — full viewport height, no padding, no extra wrappers.
      This is the ONLY layout shell. Your devdrop router should render this
      component inside a route that replaces any devdrop shell entirely.
    */
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas">
      {/* ── Single top bar ─────────────────────────────────── */}
      <TopBar />

      {/* ── Main content row ───────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left panel (hidden in preview) */}
        {!previewMode && <LeftPanel />}

        {/* Canvas + optional AI overlay */}
        <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
          <Canvas />
          {showAIPanel && !previewMode && <AIPanel />}
        </div>

        {/* Right panel (hidden in preview) */}
        {!previewMode && <RightPanel />}
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      {showExportModal   && <ExportModal />}
      {showTemplatesModal && <TemplatesModal />}
    </div>
  );
}
