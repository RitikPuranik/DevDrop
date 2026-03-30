import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import TeamReveal from '../components/TeamReveal';
/* OUTCROWD REPLICA v10 — CINEMATIC TEAM REVEAL
  - All Bogies locked and centered
  - Split-screen team reveal (Left/Right sliding)
  - Scale and opacity transitions for the studio founders
*/

const BOGIES = [
  { num: '01', label: 'Vision', accent: '#f97316', head: ['Where', "We're", 'Going'], body: "A digital landscape where brands don't just exist — they linger in memory. Every pixel deliberate, every interaction felt deeply.", img: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800' },
  { num: '02', label: 'Mission', accent: '#a78bfa', head: ['Why', 'We', 'Build'], body: 'To craft digital artifacts so refined they become cultural touchpoints — not just products, but pieces of the internet worth remembering.', img: 'https://images.unsplash.com/photo-1635776062127-d379bfcba9f8?w=800' },
  { num: '03', label: 'Craft', accent: '#34d399', head: ['How', 'We', 'Work'], body: 'Boutique methodology. No templates, no shortcuts. Each project receives the full, undivided obsession of our studio.', img: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800' },
  { num: '04', label: 'Services', accent: '#fb923c', head: ['What', 'We', 'Deliver'], body: 'Web platforms · Brand identity · Motion design · Strategy. Full-spectrum creative engineering for brands that demand excellence.', img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800' },
];

export default function About() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] });
  const sp = useSpring(scrollYProgress, { stiffness: 40, damping: 26 });

  const s0O = useTransform(sp, [0, 0.05], [1, 0]);
  const s2O = useTransform(sp, [0.08, 0.15, 0.22, 0.28], [0, 1, 1, 0]);
  const s2S = useTransform(sp, [0.08, 0.15, 0.22, 0.28], [0.8, 1, 1, 1.1]);
  const xTranslate = useTransform(sp, [0.32, 0.94], ["0vw", "-520vw"]);

  // TEAM REVEAL ANIMATIONS (The "Video" Style)
  const teamOpacity = useTransform(sp, [0.94, 0.98], [0, 1]);
  const teamBgScale = useTransform(sp, [0.94, 0.99], [1.2, 1]);
  
  // Founders sliding from opposite sides
  const leftFounderX = useTransform(sp, [0.95, 0.99], [-200, 0]);
  const rightFounderX = useTransform(sp, [0.95, 0.99], [200, 0]);
  const textTitleY = useTransform(sp, [0.95, 0.99], [50, 0]);

  return (
    <div ref={containerRef} style={{ height: '1400vh', background: '#060606', color: '#e8e2d6', fontFamily: "'Space Mono', monospace" }}>
      
      <div style={{ position: 'sticky', top: 0, height: '100vh', width: '100vw', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
        
        {/* GLOBAL OVERLAY */}
        <div style={{ position:'absolute', inset:0, zIndex:300, pointerEvents:'none', background:'radial-gradient(circle at 50% 50%, transparent 20%, rgba(0,0,0,0.8) 100%)'}} />

        {/* --- STAGE 0 & 1: INTROS --- */}
        <motion.div style={{ opacity: s0O, position:'absolute', width:'100%', textAlign:'center', zIndex:100 }}>
           <h1 style={{ fontFamily:"'Playfair Display', serif", fontStyle:'italic', fontSize:'10vw', margin:0 }}>About Us</h1>
        </motion.div>

        <motion.div style={{ opacity: s2O, scale: s2S, position:'absolute', width:'100%', textAlign:'center', zIndex:100 }}>
          <h1 style={{ fontFamily:"'Playfair Display', serif", fontStyle:'italic', fontSize:'14vw', lineHeight:.85 }}>
            Since <span style={{ color:'#f97316' }}>'26</span>
          </h1>
        </motion.div>

        {/* --- STAGE 2: THE HORIZONTAL GALLERY --- */}
        <motion.div style={{ x: xTranslate, display: 'flex', height: '100%', alignItems: 'center', gap: '15vw', paddingLeft: '100vw', willChange: 'transform' }}>
          {BOGIES.map((bogie, i) => (
            <HorizontalNode key={i} bogie={bogie} index={i} />
          ))}
          <div style={{ minWidth: '100vw', textAlign: 'center' }}>
            <h2 style={{ fontSize: '7vw', fontStyle: 'italic', color: '#f97316', opacity: 0.6 }}>Driven by passion.</h2>
          </div>
        </motion.div>

      <TeamReveal sp={sp} />

      </div>
    </div>
  );
}

function HorizontalNode({ bogie, index }) {
  return (
    <div style={{ position: 'relative', minWidth: '85vw', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8vw' }}>
      <span style={{ position:'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: '25vw', fontWeight: 900, color: '#fff', opacity: 0.02, zIndex: 0 }}>
        0{index+1}
      </span>

      <div style={{ maxWidth: 450, zIndex: 2 }}>
        <div style={{ display:'flex', gap:15, alignItems:'center', marginBottom: 25 }}>
           <span style={{ fontSize: 16, fontWeight: 800, color: bogie.accent }}>0{index+1}</span>
           <div style={{ height: 1, width: 40, background: 'rgba(255,255,255,0.1)' }} />
           <span style={{ fontSize: 10, letterSpacing: '.4em', textTransform: 'uppercase', opacity: 0.4 }}>{bogie.label}</span>
        </div>
        <h3 style={{ fontFamily:"'Playfair Display',serif", fontStyle:'italic', fontSize: 'clamp(40px, 5.5vw, 85px)', lineHeight: 0.85, marginBottom: 35 }}>
          {bogie.head[0]} <br/> <span style={{ color: bogie.accent }}>{bogie.head[1]}</span> <br/> {bogie.head[2]}
        </h3>
        <p style={{ fontSize: 15, lineHeight: 1.8, opacity: 0.4 }}>{bogie.body}</p>
      </div>

      <div style={{ width: '35vw', height: '60vh', borderRadius: 45, overflow: 'hidden', position: 'relative', zIndex: 2, boxShadow: `0 50px 100px rgba(0,0,0,0.8)`, border: '1px solid rgba(255,255,255,0.06)' }}>
        <img src={bogie.img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        <div style={{ position:'absolute', inset:0, background: `linear-gradient(to bottom, transparent, ${bogie.accent}15)` }} />
      </div>
    </div>
  );
}