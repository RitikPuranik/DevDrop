import React, { useState } from "react";
import {
  Plus, Trash2, FilePlus, Layout, Image, Type, Star, Quote,
  DollarSign, BarChart2, HelpCircle, Mail, Play, Grid2x2,
  Users, Navigation, Minus, ChevronDown, ChevronRight, Zap,
  FileText, MousePointer,
} from "lucide-react";
import { useStore } from "../../store/useStore.js";

const BLOCK_GROUPS = [
  {
    label: "Structure",
    blocks: [
      { type: "navbar",  icon: Navigation, label: "Navbar"  },
      { type: "hero",    icon: Layout,     label: "Hero"    },
      { type: "footer",  icon: Minus,      label: "Footer"  },
    ],
  },
  {
    label: "Content",
    blocks: [
      { type: "text",    icon: Type,      label: "Text Block" },
      { type: "image",   icon: Image,     label: "Image"      },
      { type: "video",   icon: Play,      label: "Video"      },
      { type: "gallery", icon: Grid2x2,   label: "Gallery"    },
    ],
  },
  {
    label: "Sections",
    blocks: [
      { type: "features",     icon: Star,      label: "Features"     },
      { type: "stats",        icon: BarChart2, label: "Stats"        },
      { type: "testimonials", icon: Quote,     label: "Testimonials" },
      { type: "team",         icon: Users,     label: "Team"         },
    ],
  },
  {
    label: "Commerce",
    blocks: [
      { type: "pricing", icon: DollarSign, label: "Pricing"       },
      { type: "cta",     icon: Zap,        label: "Call to Action" },
    ],
  },
  {
    label: "Info",
    blocks: [
      { type: "faq",     icon: HelpCircle, label: "FAQ"     },
      { type: "contact", icon: Mail,       label: "Contact" },
    ],
  },
];

function BlockItem({ type, icon: Icon, label }) {
  const { addElement } = useStore();

  const handleDragStart = (e) => {
    e.dataTransfer.setData("blockType", type);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => addElement(type)}
      className="block-item"
      title={`Add ${label}`}
    >
      <Icon size={13} className="shrink-0 text-zinc-500" />
      <span>{label}</span>
      <Plus size={11} className="block-add-icon" />
    </div>
  );
}

function BlockGroup({ group }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-bold text-zinc-600 uppercase tracking-widest hover:text-zinc-400 transition-colors"
      >
        {open
          ? <ChevronDown size={9} />
          : <ChevronRight size={9} />
        }
        {group.label}
      </button>
      {open && group.blocks.map((b) => <BlockItem key={b.type} {...b} />)}
    </div>
  );
}

export default function LeftPanel() {
  const {
    pages, currentPageId,
    setCurrentPage, addPage, deletePage, renamePage,
    elements, setElements, currentElements,
  } = useStore();

  const [tab, setTab] = useState("blocks");
  const [editingPageId, setEditingPageId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const clearCanvas = () => {
    if (window.confirm("Clear all elements on this page?")) {
      useStore.getState().reorderElements([]);
    }
  };

  return (
    <aside
      className="flex flex-col shrink-0 overflow-hidden"
      style={{
        width: 200,
        background: "#12121a",
        borderRight: "1px solid #23232f",
      }}
    >
      {/* ── Tab switcher ─────────────────────────────────── */}
      <div
        className="flex shrink-0"
        style={{ borderBottom: "1px solid #23232f" }}
      >
        {["blocks", "pages"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
              tab === t
                ? "text-white border-b-2 border-amber-100"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-2">
        {tab === "blocks" ? (
          <div>
            {BLOCK_GROUPS.map((g) => (
              <BlockGroup key={g.label} group={g} />
            ))}
          </div>
        ) : (
          <div className="py-1">
            {pages.map((page) => (
              <div
                key={page.id}
                onClick={() => setCurrentPage(page.id)}
                className={`flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer group transition-all ${
                  currentPageId === page.id
                    ? "bg-amber-100/20 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <FileText size={12} className="shrink-0" />
                {editingPageId === page.id ? (
                  <input
                    autoFocus
                    className="flex-1 bg-transparent text-sm outline-none border-b border-indigo-500"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => { renamePage(page.id, editingName); setEditingPageId(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { renamePage(page.id, editingName); setEditingPageId(null); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span
                      className="flex-1 text-xs truncate"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingPageId(page.id);
                        setEditingName(page.name);
                      }}
                    >
                      {page.name}
                    </span>
                    {page.isHome && (
                      <span className="text-[9px] text-amber-200 font-bold">HOME</span>
                    )}
                    {!page.isHome && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePage(page.id); }}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 p-0.5 transition-all"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}

            <button
              onClick={() => addPage()}
              className="flex items-center gap-2 px-3 py-2 mx-2 mt-1 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-all w-[calc(100%-16px)] text-xs"
            >
              <FilePlus size={12} />
              Add Page
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
