import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, ShoppingCart, Zap, Search, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom'; // Added for working navigation
import { websiteAPI } from "../api/website";

// Elite physics: Higher mass for "height" and weight in transitions
const transition = { 
  type: "spring", 
  stiffness: 220, 
  damping: 28, 
  mass: 1.2 
};

export default function SmoothEliteGallery() {
  const navigate = useNavigate(); // Added for working navigation
  const [templates, setTemplates] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const res = await websiteAPI.getAll();
        const data = res.data?.websites || res.data?.data || res.data || [];
        setTemplates(data);
      } catch (error) {
        console.error("Error fetching websites:", error);
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  useEffect(() => {
    document.body.style.overflow = selectedId ? 'hidden' : 'unset';
  }, [selectedId]);

  const filteredItems = useMemo(() => {
    return templates.filter(item => {
      const title = item.title || item.name || "";
      const type = item.type || item.category || "free";
      const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = activeFilter === "all" || type === activeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [searchQuery, activeFilter, templates]);

  return (
    <div className="min-h-screen bg-[#080808] text-white selection:bg-orange-500 font-sans antialiased pb-20">
      
      {/* --- NAV DOCK --- */}
      <nav className="top-0 z-40 flex justify-center mb-12 px-7">
        <motion.div className="flex flex-row items-center mt-20 justify-between bg-white/[0.03] border border-white/10 p-1.5 rounded-[32px] backdrop-blur-2xl shadow-2xl w-full max-w-5xl focus-within:border-orange-500/30 transition-all duration-500">
          <div className="relative flex items-center max-w-xs w-full ml-2">
            <Search className="absolute left-3 text-gray-500" size={16} />
            <input 
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent py-3 pl-10 pr-4 focus:outline-none text-sm font-medium placeholder:text-gray-600"
            />
          </div>

          <div className="flex items-center gap-1 bg-black/40 rounded-[26px] p-1">
            {['all', 'free', 'exclusive'].map((filter) => (
              <motion.button
                key={filter}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveFilter(filter)}
                className={`relative px-6 py-2 text-[10px] font-black uppercase tracking-[0.15em] transition-colors duration-300 z-10 ${
                  activeFilter === filter ? 'text-black' : 'text-gray-500 hover:text-white'
                }`}
              >
                {activeFilter === filter && (
                  <motion.div 
                    layoutId="activeFilter"
                    className="absolute inset-0 bg-white rounded-[22px] -z-10"
                    transition={transition}
                  />
                )}
                {filter}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </nav>

      {/* --- MAIN GRID --- */}
      <main className="max-w-7xl mx-auto px-7">
        {loading ? (
          <div className="flex flex-col justify-center items-center py-40 gap-4">
            <Loader2 className="animate-spin text-orange-500" size={40} />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500">Syncing Assets</span>
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <AnimatePresence mode="popLayout">
              {filteredItems.map((item) => {
                const itemId = item._id || item.id;
                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    layoutId={`card-${itemId}`}
                    key={itemId}
                    onClick={() => setSelectedId(item)}
                    whileHover={{ y: -8 }}
                    whileTap={{ scale: 0.98 }}
                    transition={transition}
                    className="group cursor-pointer bg-[#111] rounded-[40px] p-4 border border-white/5 hover:border-orange-500/20 transition-colors duration-500"
                  >
                    <motion.div 
                      layoutId={`image-box-${itemId}`}
                      transition={transition}
                      style={{ backgroundColor: item.color || '#1a1a1a' }}
                      className="aspect-[12/11] rounded-[32px] mb-6 relative overflow-hidden flex items-center justify-center border border-white/5"
                    >
                      <div className="w-24 h-24 bg-white/5 blur-3xl rounded-full group-hover:bg-orange-500/10 transition-colors duration-700" />
                      {(item.type === 'exclusive' || item.category === 'exclusive') && (
                        <Zap size={20} className="absolute top-6 right-6 text-orange-500 fill-orange-500" />
                      )}
                    </motion.div>

                    <div className="px-2">
                      <motion.h3 layoutId={`title-${itemId}`} transition={transition} className="font-black text-xl tracking-tight">{item.title || item.name}</motion.h3>
                      <motion.p layoutId={`price-${itemId}`} transition={transition} className="text-[#8b7355] font-bold text-sm tracking-widest uppercase">
                        {item.category === 'free' ? 'FREE' : item.price ? (typeof item.price === 'number' ? `₹${item.price}` : item.price) : ''}
                      </motion.p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* --- MODAL --- */}
      <AnimatePresence>
        {selectedId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-3xl"
            />

            <motion.div
              layoutId={`card-${selectedId._id || selectedId.id}`}
              transition={transition}
              className="relative w-full max-w-6xl bg-[#0F0F0F] rounded-[50px] border border-white/10 shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 z-50 h-fit"
            >
              <button 
                onClick={(e) => { e.stopPropagation(); setSelectedId(null); }}
                className="absolute top-8 right-8 z-[110] p-4 bg-white/5 text-white hover:bg-orange-500 rounded-full transition-all active:scale-90"
              >
                <X size={24} />
              </button>

              <div className="p-4">
                <motion.div
                  layoutId={`image-box-${selectedId._id || selectedId.id}`}
                  transition={transition}
                  style={{ backgroundColor: selectedId.color || '#1a1a1a' }}
                  className="h-full min-h-[450px] rounded-[40px] relative flex items-center justify-center overflow-hidden border border-white/5"
                >
                  <Play className="text-white/20" size={100} />
                </motion.div>
              </div>

              <div className="p-12 md:p-20 flex flex-col justify-center">
                <motion.div 
                   initial={{ opacity: 0, x: 30 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: 30 }}
                   transition={{ duration: 0.4 }}
                >
                  <div className="flex items-center gap-2 text-orange-500 mb-6 font-black uppercase tracking-[0.4em] text-[10px]">
                    <Zap size={14} fill="currentColor" /> {selectedId.type || selectedId.category || 'Premium'} Asset
                  </div>
                  <motion.h2 layoutId={`title-${selectedId._id || selectedId.id}`} transition={transition} className="text-6xl font-black tracking-tighter mb-4">
                    {selectedId.title || selectedId.name}
                  </motion.h2>
                  <motion.div layoutId={`price-${selectedId._id || selectedId.id}`} transition={transition} className="text-3xl font-light italic text-gray-500 mb-10">
                    {selectedId.category === 'free' ? 'FREE' : selectedId.price ? (typeof selectedId.price === 'number' ? `₹${selectedId.price}` : selectedId.price) : ''}
                  </motion.div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => navigate(`/website/${selectedId._id || selectedId.id}`)}
                      className="flex-1 bg-white text-black py-6 rounded-[28px] font-black text-xl hover:bg-orange-500 hover:text-white transition-all active:scale-95"
                    >
                      View Detail
                    </button>
                    <button className="w-24 bg-white/5 border border-white/10 rounded-[28px] flex items-center justify-center text-white hover:bg-white/10 transition-colors">
                      <ShoppingCart size={28} />
                    </button>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}