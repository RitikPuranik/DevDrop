import React from "react";
import { useStore } from "../../store/useStore.js";

export default function SiteSettings() {
  const { siteMeta, updateSiteMeta } = useStore();

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Site Name</label>
        <input
          className="input-field"
          value={siteMeta.name}
          onChange={(e) => updateSiteMeta({ name: e.target.value })}
          placeholder="My Website"
        />
      </div>
      <div>
        <label className="label">Primary Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={siteMeta.primaryColor || "#6366f1"}
            onChange={(e) => updateSiteMeta({ primaryColor: e.target.value })}
            className="w-9 h-9 rounded-lg border border-zinc-700 cursor-pointer bg-transparent p-0.5"
          />
          <input
            className="input-field"
            value={siteMeta.primaryColor || "#6366f1"}
            onChange={(e) => updateSiteMeta({ primaryColor: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="label">Favicon</label>
        <input
          className="input-field"
          value={siteMeta.favicon || "🌐"}
          onChange={(e) => updateSiteMeta({ favicon: e.target.value })}
          placeholder="🌐 or URL"
        />
      </div>
    </div>
  );
}
