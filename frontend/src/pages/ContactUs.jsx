import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';

export default function FunContact() {
  const [formState, setFormState] = useState('idle'); // idle, sending, success
  const containerRef = useRef(null);

  // Custom Cursor Logic
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const springConfig = { damping: 25, stiffness: 700 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  const handleMouseMove = (e) => {
    const { clientX, clientY } = e;
    cursorX.set(clientX);
    cursorY.set(clientY);
  };

  const triggerSubmit = (e) => {
    e.preventDefault();
    setFormState('sending');
    setTimeout(() => setFormState('success'), 2000);
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative min-h-screen bg-[#050505] overflow-hidden flex items-center justify-center cursor-none selection:bg-orange-500/30"
    >
      {/* ── CUSTOM BLOB CURSOR ── */}
      <motion.div
        style={{ x: cursorXSpring, y: cursorYSpring, translateX: '-50%', translateY: '-50%' }}
        className="fixed top-0 left-0 w-8 h-8 bg-orange-500 rounded-full pointer-events-none z-[999] mix-blend-difference"
      />
      <motion.div
        style={{ x: cursorXSpring, y: cursorYSpring, translateX: '-50%', translateY: '-50%' }}
        className="fixed top-0 left-0 w-128 h-128 bg-orange-500/10 blur-[100px] rounded-full pointer-events-none z-0"
      />

      <AnimatePresence mode="wait">
        {formState !== 'success' ? (
          <motion.div 
            key="contact-form"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ y: -100, opacity: 0, filter: 'blur(20px)' }}
            className="z-10 w-full max-w-4xl px-10"
          >
            <div className="mb-16">
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-orange-500 font-mono tracking-[0.8em] text-xs block mb-4"
              >
                READY TO DROP?
              </motion.span>
              <h1 className="text-white text-7xl md:text-9xl font-medium tracking-tighter">
                Say <span className="italic font-light text-white/20 hover:text-orange-500 transition-colors duration-500">Hello</span>
              </h1>
            </div>

            <form onSubmit={triggerSubmit} className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <InteractiveInput placeholder="What's your name?" />
                <InteractiveInput placeholder="Email address" type="email" />
              </div>
              <InteractiveInput placeholder="Tell us about the dream..." isTextArea />

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="group relative flex items-center gap-6"
              >
                <div className="w-24 h-24 rounded-full border border-white/20 flex items-center justify-center group-hover:bg-white group-hover:border-white transition-all duration-500">
                  <span className="text-white group-hover:text-black text-3xl">→</span>
                </div>
                <span className="text-white text-2xl font-light tracking-wide uppercase">
                  {formState === 'sending' ? 'Sending...' : 'Drop it'}
                </span>
              </motion.button>
            </form>
          </motion.div>
        ) : (
          <motion.div 
            key="success"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center z-10"
          >
            <h2 className="text-orange-500 text-9xl font-black mb-4">GOT IT.</h2>
            <p className="text-white/40 font-mono tracking-widest uppercase">We'll manifest a reply soon.</p>
            <button 
              onClick={() => setFormState('idle')}
              className="mt-12 px-8 py-3 border border-white/10 rounded-full text-white/40 hover:text-white hover:border-white transition-all"
            >
              Back to Earth
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Subtle Grid */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
    </div>
  );
}

function InteractiveInput({ placeholder, type = "text", isTextArea = false }) {
  return (
    <div className="relative group">
      {isTextArea ? (
        <textarea
          required
          placeholder={placeholder}
          rows={1}
          className="w-full bg-transparent border-b border-white/10 py-4 text-2xl text-white outline-none focus:border-orange-500 transition-all placeholder:text-white/10 resize-none"
        />
      ) : (
        <input
          required
          type={type}
          placeholder={placeholder}
          className="w-full bg-transparent border-b border-white/10 py-4 text-2xl text-white outline-none focus:border-orange-500 transition-all placeholder:text-white/10"
        />
      )}
      <div className="absolute bottom-0 left-0 w-0 h-[2px] bg-orange-500 group-focus-within:w-full transition-all duration-700 ease-out" />
    </div>
  );
}