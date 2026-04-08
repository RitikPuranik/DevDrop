import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';

const leaders = [
  { id: 1,  name: "Marcus",  img: "https://i.pravatar.cc/150?u=11", pos: { top: '18%', left: '15%' }, review: "Efficiency gains were immediate." },
  { id: 2,  name: "Elena",   img: "https://i.pravatar.cc/150?u=12", pos: { top: '8%',  left: '28%' }, review: "Stunning UI that converts." },
  { id: 3,  name: "Julian",  img: "https://i.pravatar.cc/150?u=13", pos: { top: '12%', left: '40%' }, review: "Scales perfectly with growth." },
  { id: 4,  name: "Vikram",  img: "https://i.pravatar.cc/150?u=14", pos: { top: '12%', left: '60%' }, review: "Most robust API we've tested." },
  { id: 5,  name: "Sarah",   img: "https://i.pravatar.cc/150?u=15", pos: { top: '8%',  left: '72%' }, review: "Design-led engineering at its finest." },
  { id: 6,  name: "Chen",    img: "https://i.pravatar.cc/150?u=16", pos: { top: '18%', left: '85%' }, review: "Seamless customer journeys." },
  { id: 7,  name: "David",   img: "https://i.pravatar.cc/150?u=17", pos: { top: '45%', left: '8%'  }, review: "Incredible support and features." },
  { id: 8,  name: "Amara",   img: "https://i.pravatar.cc/150?u=18", pos: { top: '45%', left: '92%' }, review: "A game changer for workflow." },
  { id: 9,  name: "Leo",     img: "https://i.pravatar.cc/150?u=19", pos: { top: '75%', left: '25%' }, review: "Recommended for tech teams." },
  { id: 10, name: "Maya",    img: "https://i.pravatar.cc/150?u=20", pos: { top: '75%', left: '75%' }, review: "Dashboard is a masterpiece." },
  { id: 11, name: "Kenji",   img: "https://i.pravatar.cc/150?u=21", pos: { top: '88%', left: '50%' }, review: "Security and speed in one." },
];

const allCards = [
  { id: 0,  name: "Trisha W.",  company: "ArtHaus",    img: "https://i.pravatar.cc/400?u=51", color: "#c4581a", featured: true },
  { id: 1,  name: "Marcus J.",  company: "NovaTech",   img: "https://i.pravatar.cc/400?u=52", color: "#92400e" },
  { id: 2,  name: "Elena S.",   company: "Luma",       img: "https://i.pravatar.cc/400?u=53", color: "#78350f" },
  { id: 3,  name: "Julian K.",  company: "Scale AI",   img: "https://i.pravatar.cc/400?u=54", color: "#44403c" },
  { id: 4,  name: "Vikram P.",  company: "Stripe",     img: "https://i.pravatar.cc/400?u=55", color: "#3f3f46" },
  { id: 5,  name: "Sarah L.",   company: "Linear",     img: "https://i.pravatar.cc/400?u=56", color: "#7c2d12" },
  { id: 6,  name: "Chen W.",    company: "Notion",     img: "https://i.pravatar.cc/400?u=57", color: "#292524" },
  { id: 7,  name: "David M.",   company: "Vercel",     img: "https://i.pravatar.cc/400?u=58", color: "#1c1917" },
  { id: 8,  name: "Amara O.",   company: "Arc",        img: "https://i.pravatar.cc/400?u=59", color: "#57534e" },
  { id: 9,  name: "Leo T.",     company: "Figma",      img: "https://i.pravatar.cc/400?u=60", color: "#431407" },
  { id: 10, name: "Maya R.",    company: "Shopify",    img: "https://i.pravatar.cc/400?u=61", color: "#a16207" },
  { id: 11, name: "Kenji N.",   company: "Cloudflare", img: "https://i.pravatar.cc/400?u=62", color: "#365314" },
  { id: 12, name: "Priya M.",   company: "Canva",      img: "https://i.pravatar.cc/400?u=63", color: "#713f12" },
  { id: 13, name: "Omar K.",    company: "Webflow",    img: "https://i.pravatar.cc/400?u=64", color: "#451a03" },
];

const gridPositions = [
  { col: 3, row: '1 / 3' },
  { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 4, row: 1 }, { col: 5, row: 1 },
  { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 },
  { col: 1, row: 3 }, { col: 2, row: 3 }, { col: 3, row: 3 }, { col: 4, row: 3 }, { col: 5, row: 3 },
];

const FAN_COUNT = 5;
const fanConfig = [
  { dx: -2, scale: 0.70, rotate: -10 },
  { dx: -1, scale: 0.82, rotate: -5  },
  { dx:  0, scale: 0.96, rotate:  0  },
  { dx:  1, scale: 0.82, rotate:  5  },
  { dx:  2, scale: 0.70, rotate: 10  },
];

// Card size: 80px mobile, 128px desktop (w-20/w-32)
const CARD_SIZE_PX = 128; // used for transform centering

const LeaderCard = ({ person, isAutoFlipped }) => {
  const [hovered, setHovered] = useState(false);
  const flipped = hovered || isAutoFlipped;

  return (
    <div
      style={{
        position: 'absolute',
        top: person.pos.top,
        left: person.pos.left,
        // Shift by half card size so the card CENTER sits at the percentage point
        transform: 'translate(-50%, calc(-50% + 18px))',
        perspective: 1200,
        zIndex: flipped ? 30 : 10,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        style={{
          width: CARD_SIZE_PX,
          height: CARD_SIZE_PX,
          position: 'relative',
          transformStyle: 'preserve-3d',
          cursor: 'pointer',
        }}
        animate={{ rotateY: flipped ? 180 : 0, scale: flipped ? 1.1 : 1 }}
        transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      >
        {/* Front face */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 28,
            overflow: 'hidden',
            border: '5px solid white',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            backfaceVisibility: 'hidden',
          }}
        >
          <img src={person.img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={person.name} />
        </div>

        {/* Back face */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 28,
            background: '#fff',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <div style={{ color: '#f59e0b', fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>★★★★★</div>
          <p style={{ fontSize: 9, lineHeight: 1.4, fontWeight: 700, color: '#1e293b', margin: 0 }}>"{person.review}"</p>
          <p style={{ fontSize: 8, marginTop: 8, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.15em' }}>{person.name.toUpperCase()}</p>
        </div>
      </motion.div>
    </div>
  );
};

function GallerySection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const s = useSpring(scrollYProgress, { stiffness: 50, damping: 18, restDelta: 0.001 });

  const headX  = useTransform(s, [0.22, 0.68], [0, -320]);
  const headOp = useTransform(s, [0.22, 0.60], [1, 0]);
  const t      = useTransform(s, [0.24, 0.80], [0, 1]);
  const hintOp = useTransform(s, [0, 0.08], [1, 0]);

  return (
    <div ref={ref} style={{ height: '300vh' }} className="relative bg-black">
      <div className="sticky top-0 w-full h-screen overflow-hidden bg-black">
        <motion.div
          style={{ x: headX, opacity: headOp }}
          className="absolute left-0 top-0 bottom-0 z-20 flex flex-col justify-center pl-12 pointer-events-none"
        >
          <div style={{ width: '30vw' }}>
            <motion.p
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
              className="text-amber-400 text-[10px] tracking-[0.35em] uppercase font-semibold mb-4"
            >
              What they say
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="font-black text-white leading-[0.88] tracking-tight"
              style={{ fontSize: 'clamp(34px, 4vw, 62px)' }}
            >
              People's<br />
              <span style={{ color: '#e07b39' }}>Appreci­ations</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
              className="text-white/30 text-sm mt-5 leading-relaxed"
              style={{ maxWidth: 200 }}
            >
              Real voices from teams who trust us every day.
            </motion.p>
            <motion.div
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.35, duration: 0.7 }}
              className="mt-8 h-[1px] origin-left"
              style={{ width: 100, background: 'linear-gradient(to right, #e07b39, transparent)' }}
            />
          </div>
        </motion.div>

        <div className="absolute inset-0 flex items-center justify-center">
          <AnimatedCards t={t} />
        </div>
      </div>
    </div>
  );
}

function AnimatedCards({ t }) {
  const [vw, setVw] = useState(900);
  const [vh, setVh] = useState(600);

  useEffect(() => {
    const update = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const GAP    = 10;
  const COLS   = 5;
  const ROWS   = 3;

  const GRID_W = vw - 48;
  const GRID_H = vh - 80;

  const CARD_W = Math.floor((GRID_W - (COLS - 1) * GAP) / COLS);
  const CARD_H = Math.floor((GRID_H - (ROWS - 1) * GAP) / ROWS);

  const gridCenter = (col, row) => {
    const colIdx = col - 1;
    // For spanning rows (e.g. '1 / 3'), center between the first and last row
    let rowIdxStart, rowIdxEnd;
    if (typeof row === 'string') {
      const parts = row.split('/').map(s => parseInt(s.trim()) - 1);
      rowIdxStart = parts[0];
      rowIdxEnd   = parts[1] - 1; // '1 / 3' means rows 1 and 2 (end is exclusive)
    } else {
      rowIdxStart = row - 1;
      rowIdxEnd   = row - 1;
    }
    const x = colIdx * (CARD_W + GAP) - (GRID_W - CARD_W) / 2;
    // y = top of first row + half the total span height, minus half a single card height
    // so that translateY(-50%) lands the center exactly mid-span
    const spanH = (rowIdxEnd - rowIdxStart) * (CARD_H + GAP); // extra height from spanning
    const y = rowIdxStart * (CARD_H + GAP) - (GRID_H - CARD_H) / 2 + spanH / 2;
    return { x, y };
  };

  const FAN_OFFSET_X = GRID_W * 0.16;
  const FAN_CARD_STEP = CARD_W * 0.62;
  const fanCenter = (dx) => ({
    x: FAN_OFFSET_X + dx * FAN_CARD_STEP,
    y: 0,
  });

  const fanAssignment = [
    { cardIdx: 2, fanIdx: 0 },
    { cardIdx: 3, fanIdx: 1 },
    { cardIdx: 0, fanIdx: 2 },
    { cardIdx: 1, fanIdx: 3 },
    { cardIdx: 4, fanIdx: 4 },
  ];

  const fanPositions = allCards.map((_, i) => {
    const fa = fanAssignment.find(f => f.cardIdx === i);
    if (fa) {
      return {
        fc: fanCenter(fanConfig[fa.fanIdx].dx),
        fanScale: fanConfig[fa.fanIdx].scale,
        fanRotate: fanConfig[fa.fanIdx].rotate,
      };
    }
    return {
      fc: { x: FAN_OFFSET_X + GRID_W, y: 0 },
      fanScale: 0.6,
      fanRotate: 0,
    };
  });

  const cards = allCards.map((card, i) => {
    const gp = gridPositions[i];
    const gc = gridCenter(gp.col, gp.row);
    return { card, gc };
  });

  return (
    <div style={{ position: 'relative', width: GRID_W, height: GRID_H }}>
      {allCards.map((card, i) => {
        const { gc } = cards[i];
        const { fc, fanScale, fanRotate } = fanPositions[i];
        const isFeatured = card.featured;
        const cardH = isFeatured ? CARD_H * 2 + GAP : CARD_H;

        return (
          <MotionCard
            key={card.id}
            card={card}
            t={t}
            fanX={fc.x}
            fanY={fc.y}
            fanScale={fanScale}
            fanRotate={fanRotate}
            gridX={gc.x}
            gridY={gc.y}
            cardW={CARD_W}
            cardH={cardH}
            isFeatured={isFeatured}
          />
        );
      })}
    </div>
  );
}

function MotionCard({ card, t, fanX, fanY, fanScale, fanRotate, gridX, gridY, cardW, cardH, isFeatured }) {
  const x       = useTransform(t, [0, 1], [fanX, gridX]);
  const y       = useTransform(t, [0, 1], [fanY, gridY]);
  const scale   = useTransform(t, [0, 1], [fanScale, 1]);
  const rotate  = useTransform(t, [0, 1], [fanRotate, 0]);
  const opacity = useTransform(t, [0, 0.15, 1], [fanScale > 0.3 ? 1 : 0, fanScale > 0.3 ? 1 : 0.6, 1]);
  const br      = useTransform(t, [0, 1], [18, 16]);
  const brPx    = useTransform(br, v => `${v}px`);

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        x,
        y,
        scale,
        rotate,
        opacity,
        borderRadius: brPx,
        width: cardW,
        height: cardH,
        background: card.color,
        overflow: 'hidden',
        translateX: '-50%',
        translateY: '-50%',
        boxShadow: isFeatured
          ? '0 24px 60px rgba(0,0,0,0.6)'
          : '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: isFeatured ? 10 : 1,
      }}
    >
      <img
        src={card.img}
        alt={card.name}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          
        }}
      />

      {isFeatured && (
        <>
          <motion.div
            style={{ opacity: useTransform(t, [0, 0.3], [1, 0]), position: 'absolute', top: 26, right: 12, zIndex: 10 }}
            className="bg-white rounded-full px-2.5 py-1 flex items-center gap-1 shadow text-[10px] font-bold text-rose-500 whitespace-nowrap"
          >
            ♥ Like
          </motion.div>
          <motion.div
            style={{ opacity: useTransform(t, [0, 0.3], [1, 0]) }}
            className="absolute top-3 left-3 z-10 bg-orange-700/80 rounded-full px-2.5 py-1 text-[10px] font-bold text-white whitespace-nowrap"
          >
            @artist
          </motion.div>
        </>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 px-2 py-2"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }}
      >
        <p className="text-white text-[9px] font-bold truncate">{card.name}</p>
        <p className="text-white/50 text-[8px] truncate">{card.company}</p>
      </div>
    </motion.div>
  );
}

export default function IndustryLeaders() {
  const [flippedIndex, setFlippedIndex] = useState(0);
  const [showGallery, setShowGallery]   = useState(false);
  const galleryRef = useRef(null);

  useEffect(() => {
    const iv = setInterval(() => setFlippedIndex(p => (p + 1) % leaders.length), 4000);
    return () => clearInterval(iv);
  }, []);

  const handleReadStories = () => {
    setShowGallery(true);
    setTimeout(() => galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="w-full bg-black font-sans">

      {/* ══ HERO ══ */}
      <section className="relative w-full min-h-screen overflow-hidden flex items-center justify-center">
        {/* subtle grid backdrop */}
        <div className="absolute inset-0 grid grid-cols-12 gap-4 opacity-[0.02] pointer-events-none p-10">
          {[...Array(60)].map((_, i) => <div key={i} className="aspect-square bg-slate-900 rounded-3xl" />)}
        </div>

        {/* Leader avatars — positioned with translate(-50%,-50%) so center hits the coordinate */}
        <div className="absolute inset-0 z-10">
          {leaders.map((p, i) => (
            <LeaderCard key={p.id} person={p} isAutoFlipped={flippedIndex === i} />
          ))}
        </div>

        {/* Hero copy */}
        <div className="relative  -mt-25 z-20 text-center px-6 max-w-4xl pointer-events-none translate-y-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
            <h1 className="text-6xl md:text-[90px] font-black text-yellow-100 leading-[0.85] tracking-tighter mb-8">
              Trusted by leaders <br />
              <span className="text-slate-500 font-medium italic">from various industries</span>
            </h1>
            <p className="text-slate-400 text-lg md:text-xl max-w-lg mx-auto mb-10 leading-relaxed">
              Learn why professionals trust our solutions to complete their customer journeys.
            </p>
            <button
              onClick={handleReadStories}
              disabled={showGallery}
              className="pointer-events-auto bg-amber-200 text-black px-10 py-5 rounded-full font-bold text-xs tracking-widest flex items-center gap-4 hover:bg-white transition-all hover:shadow-[0_0_30px_rgba(254,243,199,0.3)] active:scale-95 group disabled:opacity-40 disabled:pointer-events-none"
            >
              READ SUCCESS STORIES
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </motion.div>
        </div>
      </section>

      {/* ══ GALLERY ══ */}
      <AnimatePresence>
        {showGallery && (
          <div ref={galleryRef}>
            <GallerySection />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}