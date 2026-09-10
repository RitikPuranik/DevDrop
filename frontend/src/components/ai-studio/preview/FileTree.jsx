import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react';

function buildTree(files) {
  const root = { name: '', children: {}, type: 'dir' };
  for (const file of files) {
    const parts = file.path.replace(/^\/+/, '').split('/').filter(Boolean);
    let cursor = root;
    parts.forEach((part, idx) => {
      const isFile = idx === parts.length - 1;
      cursor.children[part] = cursor.children[part] || {
        name: part,
        type: isFile ? 'file' : 'dir',
        children: {},
        path: parts.slice(0, idx + 1).join('/'),
      };
      cursor = cursor.children[part];
    });
  }
  return root;
}

function Node({ node, depth, activePath, onSelect, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const children = Object.values(node.children).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (node.type === 'file') {
    const isActive = node.path === activePath;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        style={{ paddingLeft: 12 + depth * 14 }}
        className={`flex w-full items-center gap-1.5 py-1.5 pr-2 text-left text-[12.5px] rounded-md transition-colors ${
          isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/85 hover:bg-white/5'
        }`}
      >
        <File size={13} className="shrink-0 opacity-60" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      {depth >= 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ paddingLeft: 12 + depth * 14 }}
          className="flex w-full items-center gap-1 py-1.5 pr-2 text-left text-[12.5px] font-medium text-white/70 hover:text-white transition-colors"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Folder size={13} className="shrink-0 opacity-70" />
          <span className="truncate">{node.name}</span>
        </button>
      )}
      {open &&
        children.map((child) => (
          <Node key={child.path || child.name} node={child} depth={depth + 1} activePath={activePath} onSelect={onSelect} defaultOpen={defaultOpen} />
        ))}
    </div>
  );
}

export default function FileTree({ files, activePath, onSelect }) {
  const tree = useMemo(() => buildTree(files), [files]);
  return (
    <div className="py-2">
      <Node node={tree} depth={-1} activePath={activePath} onSelect={onSelect} defaultOpen />
    </div>
  );
}
