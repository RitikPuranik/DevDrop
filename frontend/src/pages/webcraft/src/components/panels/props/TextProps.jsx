import React from "react";
import { useStore } from "../../../store/useStore.js";

export default function TextProps({ element }) {
  const { updateElement } = useStore();
  const p = element.props;
  const upd = (key, val) => updateElement(element.id, { [key]: val });

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Content (HTML)</label>
        <textarea
          className="input-field resize-none font-mono text-xs"
          rows={8}
          value={p.content || ""}
          onChange={(e) => upd("content", e.target.value)}
        />
      </div>
      <div>
        <label className="label">Text Align</label>
        <select className="input-field" value={p.align || "left"} onChange={(e) => upd("align", e.target.value)}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div>
        <label className="label">Padding</label>
        <input className="input-field" value={p.padding || "60px"} onChange={(e) => upd("padding", e.target.value)} />
      </div>
      <div>
        <label className="label">Max Width</label>
        <input className="input-field" value={p.maxWidth || "800px"} onChange={(e) => upd("maxWidth", e.target.value)} />
      </div>
      <div>
        <label className="label">Background Color</label>
        <div className="flex items-center gap-2">
          <input type="color" value={p.bgColor || "#ffffff"} onChange={(e) => upd("bgColor", e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-zinc-700 bg-transparent p-0.5" />
          <input className="input-field" value={p.bgColor || "#ffffff"} onChange={(e) => upd("bgColor", e.target.value)} />
        </div>
      </div>
    </div>
  );
}
