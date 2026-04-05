import React from "react";
import { useStore } from "../../../store/useStore.js";

export default function HeroProps({ element }) {
  const { updateElement } = useStore();
  const p = element.props;
  const upd = (key, val) => updateElement(element.id, { [key]: val });

  return (
    <div className="space-y-4">
      <Field label="Heading">
        <input className="input-field" value={p.title || ""} onChange={(e) => upd("title", e.target.value)} />
      </Field>
      <Field label="Subtitle">
        <textarea className="input-field resize-none" rows={3} value={p.subtitle || ""} onChange={(e) => upd("subtitle", e.target.value)} />
      </Field>
      <Field label="Button Text">
        <input className="input-field" value={p.buttonText || ""} onChange={(e) => upd("buttonText", e.target.value)} />
      </Field>
      <Field label="Button Link">
        <input className="input-field" value={p.buttonLink || "#"} onChange={(e) => upd("buttonLink", e.target.value)} />
      </Field>
      <Field label="Min Height">
        <input className="input-field" value={p.height || "500px"} onChange={(e) => upd("height", e.target.value)} />
      </Field>
      <Field label="Text Align">
        <select className="input-field" value={p.align || "center"} onChange={(e) => upd("align", e.target.value)}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </Field>
      <ColorField label="Background" value={p.bgColor} onChange={(v) => upd("bgColor", v)} />
      <ColorField label="Text Color" value={p.textColor} onChange={(v) => upd("textColor", v)} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value?.startsWith("#") ? value : "#6366f1"}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-zinc-700 bg-transparent p-0.5"
        />
        <input className="input-field" value={value || ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
