import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "../../../store/useStore.js";

function renderField(key, value, onChange) {
  if (typeof value === "boolean") {
    return (
      <label key={key} className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={value} onChange={(e) => onChange(key, e.target.checked)} className="rounded" />
        <span className="text-xs text-zinc-300 capitalize">{key}</span>
      </label>
    );
  }
  if (key.toLowerCase().includes("color") && typeof value === "string" && value.startsWith("#") && value.length <= 9) {
    return (
      <div key={key}>
        <label className="label">{key}</label>
        <div className="flex gap-2 items-center">
          <input type="color" className="w-10 h-8 rounded cursor-pointer bg-transparent border-0" value={value} onChange={(e) => onChange(key, e.target.value)} />
          <input className="input-field flex-1 font-mono text-xs" value={value} onChange={(e) => onChange(key, e.target.value)} />
        </div>
      </div>
    );
  }
  if (typeof value === "string" && value.length > 60) {
    return (
      <div key={key}>
        <label className="label">{key}</label>
        <textarea className="input-field resize-none text-xs" rows={3} value={value} onChange={(e) => onChange(key, e.target.value)} />
      </div>
    );
  }
  if (typeof value === "string" || typeof value === "number") {
    return (
      <div key={key}>
        <label className="label">{key}</label>
        <input className="input-field text-xs" value={value} onChange={(e) => onChange(key, e.target.value)} />
      </div>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div key={key}>
        <label className="label">{key} <span className="text-zinc-600 normal-case tracking-normal">(array)</span></label>
        <div className="space-y-2">
          {value.map((item, idx) => (
            <div key={idx} className="bg-white/5 rounded-lg p-2">
              {typeof item === "string" ? (
                <div className="flex gap-2">
                  <input
                    className="input-field text-xs flex-1"
                    value={item}
                    onChange={(e) => {
                      const arr = [...value];
                      arr[idx] = e.target.value;
                      onChange(key, arr);
                    }}
                  />
                  <button onClick={() => onChange(key, value.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300">
                    <Trash2 size={11} />
                  </button>
                </div>
              ) : typeof item === "object" ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Item {idx + 1}</span>
                    <button onClick={() => onChange(key, value.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300">
                      <Trash2 size={11} />
                    </button>
                  </div>
                  {Object.entries(item).map(([k, v]) => (
                    typeof v === "string" || typeof v === "number" ? (
                      <div key={k} className="flex gap-1.5 items-center">
                        <span className="text-xs text-zinc-500 w-16 shrink-0">{k}</span>
                        <input
                          className="input-field text-xs flex-1"
                          value={v}
                          onChange={(e) => {
                            const arr = [...value];
                            arr[idx] = { ...arr[idx], [k]: e.target.value };
                            onChange(key, arr);
                          }}
                        />
                      </div>
                    ) : null
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <button
            onClick={() => {
              const sample = value[0];
              const newItem = typeof sample === "string" ? "" : typeof sample === "object" ?
                Object.fromEntries(Object.keys(sample).map(k => [k, ""])) : "";
              onChange(key, [...value, newItem]);
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 pt-1"
          >
            <Plus size={11} /> Add item
          </button>
        </div>
      </div>
    );
  }
  return null;
}

export default function GenericProps({ element }) {
  const { updateElement } = useStore();
  const p = element.props;

  const handleChange = (key, val) => updateElement(element.id, { [key]: val });

  const fields = Object.entries(p).filter(([k]) => k !== "id");

  return (
    <div className="space-y-4">
      {fields.map(([key, value]) => renderField(key, value, handleChange))}
      {fields.length === 0 && (
        <p className="text-xs text-zinc-500 text-center py-4">No editable properties</p>
      )}
    </div>
  );
}
