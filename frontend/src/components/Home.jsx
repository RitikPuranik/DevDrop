import React, { useEffect, useRef ,useState} from 'react';
import { motion, useScroll, useTransform, useSpring,AnimatePresence } from 'framer-motion';
import { ChevronDown, Layers, Cpu, ArrowRight } from 'lucide-react';
import LoadingScreen from './Loading_Screen';
const TEMPLATES = [
  { id: '01', title: 'AETHER', img: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe' },
  { id: '02', title: 'VOID', img: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4' },
  { id: '03', title: 'NEURAL', img: 'https://images.unsplash.com/photo-1614850523296-e8c0d9732391' },
];

const FluidRiseBackground = ({ scrollProgress }) => {
  const canvasRef = useRef(null);
  const canvasOpacity = useTransform(scrollProgress, [0, 0.15], [0.6, 0]);
  const canvasScale = useTransform(scrollProgress, [0, 0.2], [1, 1.2]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationFrameId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    class SmokeParticle {
      constructor() {
        this.x = canvas.width * (0.6 + Math.random() * 0.4); 
        this.y = canvas.height + Math.random() * 100;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = -Math.random() * 3 - 1; 
        this.radius = Math.random() * 60 + 20;
        this.maxRadius = this.radius * 3;
        this.alpha = 0;
        this.maxAlpha = Math.random() * 0.3 + 0.1;
        this.color = Math.random() > 0.5 ? '#6366f1' : '#a855f7'; 
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.alpha < this.maxAlpha) this.alpha += 0.005;
        this.radius += 0.2;
        this.vx += Math.sin(this.y * 0.01) * 0.05;
      }

      draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.shadowBlur = 40;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
      }
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (particles.length < 50) particles.push(new SmokeParticle());
      particles.forEach((p, i) => {
        p.update();
        p.draw();
        if (p.y < -100 || p.radius > p.maxRadius) {
          particles[i] = new SmokeParticle();
        }
      });
      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', resize);
    resize();
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <motion.canvas 
      ref={canvasRef} 
      // ADDED: Initial Y rise animation on load
      initial={{ y: "100vh", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 1.8, ease: [0.23, 1, 0.32, 1] }}
      style={{ opacity: canvasOpacity, scale: canvasScale }}
      className="absolute inset-0 z-0 pointer-events-none" 
    />
  );
};

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef(null);

  useEffect(() => {
    // Matches the loading duration
    const timer = setTimeout(() => setIsLoading(false), 2500); 
    window.scrollTo(0, 0);
    return () => clearTimeout(timer);
  }, []);
 
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const smoothProgress = useSpring(scrollYProgress, { stiffness: 60, damping: 25 });

  const textOpacity = useTransform(smoothProgress, [0, 0.1], [1, 0]);
  const titleYUpper = useTransform(smoothProgress, [0, 0.15], [0, -150]);
  const titleYLower = useTransform(smoothProgress, [0, 0.15], [0, 150]);
  const paraBlur = useTransform(smoothProgress, [0, 0.1], ["blur(0px)", "blur(20px)"]);

  return (
    <div ref={containerRef} className="relative bg-[#020205] text-white selection:bg-indigo-500">
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            key="loader" 
            exit={{ opacity: 0 }} 
            transition={{ duration: 0.8 }}
            className="fixed inset-0 z-[100] bg-[#020205]"
          >
             <LoadingScreen />
          </motion.div>
        )}
      </AnimatePresence>
      <FluidRiseBackground scrollProgress={smoothProgress} />

      {/* --- HERO SECTION --- */}
      <section 
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)'
        }}
        className="sticky top-0 h-screen w-full flex items-center px-12 md:px-24 overflow-hidden z-20"
      >
        <div className="relative z-10 w-full">
          <motion.div style={{ opacity: textOpacity }}>
            <div className="overflow-hidden">
              <motion.h1 
                style={{ y: titleYUpper }}
                className="text-[12vw] font-[1000] leading-[0.8] tracking-tighter uppercase"
              >
                Let It
              </motion.h1>
            </div>
            
            <div className="overflow-hidden">
              <motion.h1 
                style={{ y: titleYLower }}
                className="text-[12vw] font-[1000] leading-[0.8] tracking-tighter uppercase text-indigo-500"
              >
                Spread.
              </motion.h1>
            </div>

            <motion.div 
              style={{ filter: paraBlur, y: useTransform(smoothProgress, [0, 0.1], [0, 50]) }}
              className="mt-10"
            >
              <p className="text-xl text-white/40 max-w-lg mb-12 font-light italic leading-relaxed">
                Experience the convergence of liquid motion and digital architecture. <br />
                <span className="text-white not-italic font-bold tracking-widest text-xs uppercase opacity-20">System_Active // 2026</span>
              </p>
              
              <div className="size-14 rounded-full border border-white/10 flex items-center justify-center">
                <motion.div animate={{ y: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
                  <ChevronDown size={24} className="text-indigo-500" />
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* --- SCROLL-DRIVEN TEMPLATES --- */}
      <section className="relative h-[400vh] w-full bg-transparent -mt-[20vh] z-30">
        <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
          {TEMPLATES.map((item, i) => {
            const start = i / TEMPLATES.length;
            const end = (i + 1) / TEMPLATES.length;
            const scale = useTransform(smoothProgress, [start, end], [0.6, 1.3]);
            const opacity = useTransform(smoothProgress, [start, start + 0.1, end - 0.1, end], [0, 1, 1, 0]);
            const z = useTransform(smoothProgress, [start, end], [-400, 400]);
            const rotate = useTransform(smoothProgress, [start, end], [8, -8]);

            return (
              <motion.div
                key={item.id}
                style={{ scale, opacity, z, rotateY: rotate }}
                className="absolute w-[80vw] h-[60vh] md:w-[65vw] md:h-[75vh] rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl bg-[#0a0a0a]"
              >
                <img src={item.img} className="w-full h-full object-cover grayscale-[0.5]" alt="" />
                <div className="absolute inset-0 p-12 md:p-20 flex flex-col justify-end bg-gradient-to-t from-black via-black/40 to-transparent">
                  <h2 className="text-6xl md:text-9xl font-black tracking-tighter uppercase leading-none">{item.title}</h2>
                  <button className="mt-10 w-fit px-12 py-5 border border-white/20 hover:bg-white hover:text-black transition-all font-black text-[10px] uppercase tracking-[0.4em]">
                    Build Project
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

    </div>
  );
}
