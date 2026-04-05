import React from "react";
import { Trash2, ChevronUp, ChevronDown, Copy } from "lucide-react";
import { useStore } from "../../store/useStore.js";
import ElementRenderer from "./ElementRenderer.jsx";

export default function CanvasElement({
  element, index, isSelected, onClick, totalElements,
}) {
  const { deleteElement, moveElement, duplicateElement } = useStore();

  return (
    <div
      className={`canvas-el ${isSelected ? "selected" : ""}`}
      onClick={onClick}
      style={{ position: "relative" }}
    >
      {/* ── Controls bar (only when selected) ───────────── */}
      {isSelected && (
        <div className="el-controls animate-in">
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "rgba(255,255,255,0.7)",
              padding: "0 4px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {element.type}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); moveElement(element.id, "up"); }}
            disabled={index === 0}
            title="Move Up"
            style={{ opacity: index === 0 ? 0.3 : 1 }}
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); moveElement(element.id, "down"); }}
            disabled={index === totalElements - 1}
            title="Move Down"
            style={{ opacity: index === totalElements - 1 ? 0.3 : 1 }}
          >
            <ChevronDown size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); duplicateElement(element.id); }}
            title="Duplicate"
          >
            <Copy size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); deleteElement(element.id); }}
            title="Delete"
            style={{ color: "#fca5a5" }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      <ElementRenderer element={element}/>
    </div>
  );
}
