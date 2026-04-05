import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "../../../store/useStore.js";

export default function FeaturesProps({ element }) {
  const { updateElement } = useStore();
  const p = element.props;
  const up = (key, val) => updateElement(element.id, { [key]: val });

  const updateFeature = (idx, field, val) => {
    const features = [...(p.features || [])];
    features[idx] = { ...features[idx], [field]: val };
    up("features", features);
  };

  const addFeature = () => {
    up("features", [...(p.features || []), { icon: "⭐", title: "New Feature", desc: "Feature description." }]);
  };

  const removeFeature = (idx) => {
    up("features", (p.features || []).filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Section Title</label>
        <input className="input-field" value={p.title || ""} onChange={(e) => up("title", e.target.value)} />
      </div>
      <div>
        <label className="label">Subtitle</label>
        <input className="input-field" value={p.subtitle || ""} onChange={(e) => up("subtitle", e.target.value)} />
      </div>
      <div>
        <label className="label">Background Color</label>
        <input className="input-field" type="color" value={p.bgColor?.startsWith("#") ? p.bgColor : "#f8fafc"} onChange={(e) => up("bgColor", e.target.value)} />
      </div>
      <div className="border-b border-[#2a2a38] pb-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="label !mb-0">Features</label>
          <button onClick={addFeature} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
            <Plus size={11} /> Add
          </button>
        </div>
        <div className="space-y-3">
          {(p.features || []).map((f, i) => (
            <div key={i} className="bg-white/5 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-medium">Feature {i + 1}</span>
                <button onClick={() => removeFeature(i)} className="text-red-400 hover:text-red-300 p-0.5">
                  <Trash2 size={11} />
                </button>
              </div>
              <input className="input-field text-xs" value={f.icon || ""} onChange={(e) => updateFeature(i, "icon", e.target.value)} placeholder="Emoji icon" />
              <input className="input-field text-xs" value={f.title || ""} onChange={(e) => updateFeature(i, "title", e.target.value)} placeholder="Title" />
              <textarea className="input-field text-xs resize-none" rows={2} value={f.desc || ""} onChange={(e) => updateFeature(i, "desc", e.target.value)} placeholder="Description" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
