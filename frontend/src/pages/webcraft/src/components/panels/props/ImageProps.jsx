import React from "react";
import { useStore } from "../../../store/useStore.js";

export default function ImageProps({ element }) {
  const { updateElement } = useStore();
  const p = element.props;
  const up = (key, val) => updateElement(element.id, { [key]: val });

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Image URL</label>
        <input className="input-field text-xs" value={p.src || ""} onChange={(e) => up("src", e.target.value)} placeholder="https://..." />
        {p.src && (
          <img src={p.src} alt="preview" className="mt-2 w-full h-24 object-cover rounded-lg border border-[#2a2a38]" onError={(e) => e.target.style.display = "none"} />
        )}
      </div>
      <div>
        <p className="label">Quick Images</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
            "https://images.unsplash.com/photo-1518791841217-8f162f1912da?w=800&q=80",
            "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80",
            "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80",
            "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800&q=80",
            "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80",
          ].map((src, i) => (
            <button key={i} onClick={() => up("src", src)} className="aspect-video overflow-hidden rounded-md border-2 hover:border-indigo-500 transition-all" style={{ borderColor: p.src === src ? "#6366f1" : "transparent" }}>
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Alt Text</label>
        <input className="input-field" value={p.alt || ""} onChange={(e) => up("alt", e.target.value)} placeholder="Describe the image" />
      </div>
      <div>
        <label className="label">Height</label>
        <select className="input-field" value={p.height || "400px"} onChange={(e) => up("height", e.target.value)}>
          {["200px", "300px", "400px", "500px", "600px", "100vh"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Object Fit</label>
        <select className="input-field" value={p.fit || "cover"} onChange={(e) => up("fit", e.target.value)}>
          {["cover", "contain", "fill", "none"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Border Radius</label>
        <select className="input-field" value={p.borderRadius || "0px"} onChange={(e) => up("borderRadius", e.target.value)}>
          {["0px", "8px", "16px", "24px", "50%"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Caption</label>
        <input className="input-field" value={p.caption || ""} onChange={(e) => up("caption", e.target.value)} placeholder="Optional caption..." />
      </div>
    </div>
  );
}
