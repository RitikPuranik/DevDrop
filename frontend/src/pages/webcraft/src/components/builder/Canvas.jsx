import React, { useRef } from "react";
import { useStore } from "../../store/useStore.js";
import ElementRenderer from "./ElementRenderer.jsx";
import CanvasElement from "./CanvasElement.jsx";

const VIEWPORT_WIDTHS = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

export default function Canvas() {
  const {
    currentElements,
    selectedElementId,
    selectElement,
    clearSelection,
    previewMode,
    viewportSize,
    showGrid,
    zoom,
    addElement,
  } = useStore();

  const elements = currentElements();
  const canvasRef = useRef(null);
  const width = VIEWPORT_WIDTHS[viewportSize];
  const scale = zoom ?? 1;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const blockType = e.dataTransfer.getData("blockType");
    if (blockType) addElement(blockType);
  };

  return (
    <div
      className={`flex-1 overflow-auto flex justify-center ${showGrid ? "grid-bg" : ""}`}
      style={{ background: "#111115" }}
      onClick={(e) => { if (e.target === e.currentTarget) clearSelection(); }}
    >
      {/* Zoom wrapper */}
      <div
        style={{
          transformOrigin: "top center",
          transform: `scale(${scale})`,
          width: width === "100%" ? "100%" : width,
          minWidth: width === "100%" ? undefined : width,
          maxWidth: width,
          transition: "transform 0.2s ease, width 0.3s ease",
          alignSelf: "flex-start",
        }}
      >
        <div
          ref={canvasRef}
          className="bg-white shadow-2xl relative min-h-screen"
          style={{ width: "100%" }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={(e) => {
            if (e.target === e.currentTarget || e.target.dataset.canvas) clearSelection();
          }}
        >
          {elements.length === 0 ? (
            <EmptyCanvas />
          ) : (
            elements.map((el, idx) =>
              previewMode ? (
                <ElementRenderer key={el.id} element={el} />
              ) : (
                <CanvasElement
                  key={el.id}
                  element={el}
                  index={idx}
                  isSelected={selectedElementId === el.id}
                  onClick={(e) => { e.stopPropagation(); selectElement(el.id); }}
                  totalElements={elements.length}
                />
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyCanvas() {
  const { addElement, setShowAIPanel, setShowTemplatesModal } = useStore();
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen text-center px-8"
      data-canvas="true"
    >
      <div className="text-5xl mb-5 opacity-30">✦</div>
      <h2 className="text-xl font-bold text-zinc-700 mb-2">Canvas is Empty</h2>
      <p className="text-zinc-400 text-sm mb-8 max-w-xs">
        Drag blocks from the left, pick a template, or let AI do it.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => setShowTemplatesModal(true)}
          className="px-5 py-2.5 bg-amber-100 hover:bg-amber-100/90 text-black rounded-xl text-sm font-semibold transition-all"
        >
          🎨 Choose a Template
        </button>
        <button
          onClick={() => setShowAIPanel(true)}
          className="px-5 py-2.5 border border-amber-200/40 text-amber-200 hover:bg-amber-200/10 rounded-xl text-sm font-semibold transition-all"
        >
          ✨ Generate with AI
        </button>
        <button
          onClick={() => addElement("hero")}
          className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl text-sm font-semibold transition-all"
        >
          + Add Hero Block
        </button>
      </div>
    </div>
  );
}
