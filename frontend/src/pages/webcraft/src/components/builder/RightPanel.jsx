import React from "react";
import { useStore } from "../../store/useStore.js";
import HeroProps from "../panels/props/HeroProps.jsx";
import TextProps from "../panels/props/TextProps.jsx";
import ImageProps from "../panels/props/ImageProps.jsx";
import FeaturesProps from "../panels/props/FeaturesProps.jsx";
import GenericProps from "../panels/props/GenericProps.jsx";
import SiteSettings from "../panels/SiteSettings.jsx";

const PROP_EDITORS = {
  hero:     HeroProps,
  text:     TextProps,
  image:    ImageProps,
  features: FeaturesProps,
};

export default function RightPanel() {
  const { selectedElementId, elements, currentPageId } = useStore();
  const pageEls = elements[currentPageId] || [];
  const selected = pageEls.find((e) => e.id === selectedElementId);
  const Editor = selected ? (PROP_EDITORS[selected.type] || GenericProps) : null;

  return (
    <aside
      className="flex flex-col shrink-0 overflow-hidden"
      style={{
        width: 240,
        background: "#12121a",
        borderLeft: "1px solid #23232f",
      }}
    >
      {/* ── Header ───────────────────────────────────────── */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid #23232f" }}
      >
        <div className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold mb-0.5">
          {selected ? "Properties" : "Site Settings"}
        </div>
        <div className="text-sm font-semibold text-white">
          {selected ? `${selected.type.charAt(0).toUpperCase() + selected.type.slice(1)} Block` : "Global"}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {selected ? (
          <Editor element={selected} />
        ) : (
          <>
            <div
              className="flex flex-col items-center justify-center text-center py-8 mb-4"
              style={{ borderBottom: "1px solid #23232f" }}
            >
              <div className="text-3xl mb-3 opacity-20">↖</div>
              <p className="text-xs text-zinc-600">
                Click any element on the canvas to edit its properties
              </p>
            </div>
            <SiteSettings />
          </>
        )}
      </div>
    </aside>
  );
}
