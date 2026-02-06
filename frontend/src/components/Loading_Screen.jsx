// import React, { useEffect, useRef } from 'react';
// import { gsap } from 'gsap';

// const DevDropSequential = ({ onComplete }) => {
//   const containerRef = useRef(null);
//   const folderRef = useRef(null);
//   const cardsRef = useRef([]);
//   const portalRef = useRef(null);
//   const brandRef = useRef(null);

//   useEffect(() => {
//     const ctx = gsap.context(() => {
//       const tl = gsap.timeline({
//         onComplete: () => onComplete && onComplete()
//       });

//       // 1. Setup: Folder at top, Cards hidden inside
//       gsap.set(folderRef.current, { y: -200, rotationX: 180 });
//       gsap.set(cardsRef.current, { 
//         opacity: 0, 
//         y: -150, 
//         scale: 0.3, 
//         z: -500,
//         rotationX: 90 
//       });

//       // 2. Folder Slides In
//       tl.to(folderRef.current, { y: -40, duration: 1, ease: "expo.out" });

//       // 3. THE SEQUENTIAL POUR: One-by-one rhythm
//       // They fire out and find a unique spot on the screen
//       cardsRef.current.forEach((card, i) => {
//         const xPos = (i % 4 - 1.5) * 380; // Grid X
//         const yPos = Math.floor(i / 4) * 220 + 150; // Grid Y
//         const delay = i * 0.15; // The "One after another" timing

//         tl.to(card, {
//           opacity: 1,
//           y: yPos,
//           x: xPos,
//           scale: 1,
//           z: 0,
//           rotationX: 0,
//           rotationZ: (i % 2 === 0 ? 3 : -3),
//           duration: 1.2,
//           ease: "expo.out",
//         }, delay + 1); // Start after folder is set
//       });

//       // 4. THE OPENING: Pick one card to "Open" the portal
//       const masterCard = cardsRef.current[6]; // Middle-ish card

//       tl.to(masterCard, {
//         zIndex: 500,
//         x: 0,
//         y: window.innerHeight / 2 - 50,
//         width: "100vw",
//         height: "100vh",
//         scale: 1.2,
//         borderRadius: 0,
//         backgroundColor: "#000",
//         duration: 1.5,
//         ease: "power4.inOut"
//       }, "+=0.5");

//       // 5. DEVDROP NAME REVEAL
//       tl.to(brandRef.current, {
//         opacity: 1,
//         duration: 0.1
//       })
//       .from(brandRef.current.querySelectorAll('.letter'), {
//         y: 100,
//         opacity: 0,
//         rotationX: -90,
//         stagger: 0.08,
//         duration: 1,
//         ease: "expo.out"
//       });

//     }, containerRef);

//     return () => ctx.revert();
//   }, []);

//   const addToRefs = (el) => {
//     if (el && !cardsRef.current.includes(el)) cardsRef.current.push(el);
//   };

//   return (
//     <div ref={containerRef} className="fixed inset-0 bg-[#050505] overflow-hidden flex flex-col items-center">
      
//       {/* 3D DEEP FOLDER */}
//       <div 
//         ref={folderRef} 
//         className="relative w-96 h-32 bg-neutral-900 border border-white/10 rounded-b-[40px] z-[100] shadow-2xl flex items-center justify-center"
//         style={{ transformStyle: 'preserve-3d' }}
//       >
//         <div className="w-20 h-1.5 bg-neutral-800 rounded-full" />
//         {/* Interior lip */}
//         <div className="absolute bottom-0 w-full h-4 bg-black/40 rounded-b-[40px]" />
//       </div>

//       {/* SEQUENTIAL CARDS */}
//       <div className="relative w-full h-full flex justify-center items-start" style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}>
//         {Array.from({ length: 12 }).map((_, i) => (
//           <div
//             key={i}
//             ref={addToRefs}
//             className="absolute w-[340px] h-[200px] bg-neutral-900 border border-white/5 rounded-2xl shadow-2xl p-6 flex flex-col justify-between"
//           >
//             <div className="flex justify-between items-start">
//               <div className="w-12 h-12 bg-white/5 rounded-xl" />
//               <div className="w-24 h-2 bg-white/10 rounded-full" />
//             </div>
//             <div className="space-y-2">
//                <div className="w-full h-3 bg-white/5 rounded" />
//                <div className="w-2/3 h-3 bg-white/5 rounded" />
//             </div>
//             <div className="w-full h-8 bg-white/5 rounded-lg border border-white/5" />
//           </div>
//         ))}
//       </div>

//       {/* THE PORTAL REVEAL (DEVDROP) */}
//       <div 
//         ref={brandRef} 
//         className="absolute inset-0 z-[600] opacity-0 flex flex-col items-center justify-center pointer-events-none"
//       >
//         <div className="flex overflow-hidden pb-4">
//           {"DEVDROP".split("").map((l, i) => (
//             <span key={i} className="letter inline-block text-white text-[12vw] font-black tracking-tighter italic">
//               {l}
//             </span>
//           ))}
//         </div>
//         <div className="h-px w-64 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
//         <p className="mt-6 text-neutral-500 font-mono tracking-[1em] text-[10px]">PREMIUM_DIGITAL_EXPERIENCE</p>
//       </div>

//       {/* Subtle Cinematic Grain */}
//       <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-screen bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
//     </div>
//   );
// };

// export default DevDropSequential;
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

const DevDropElitePortal = ({ onComplete }) => {
  const containerRef = useRef(null);
  const folderRef = useRef(null);
  const cardsRef = useRef([]);
  const brandRef = useRef(null);

  const themes = [
    "from-blue-600/20 to-purple-600/20",
    "from-rose-500/20 to-orange-500/20",
    "from-emerald-500/20 to-cyan-500/20",
    "from-violet-600/20 to-fuchsia-600/20"
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => onComplete && onComplete()
      });

      // 1. Initial State
      gsap.set(folderRef.current, { y: -200, rotationX: 180 });
      gsap.set(cardsRef.current, { 
        opacity: 0, 
        y: -150, 
        scale: 0.3, 
        z: -500,
        rotationX: 90 
      });

      // 2. Folder Drop
      tl.to(folderRef.current, { y: -40, duration: 1, ease: "expo.out" });

      // 3. Sequential Card Pour
      cardsRef.current.forEach((card, i) => {
        const xPos = (i % 4 - 1.5) * 380;
        const yPos = Math.floor(i / 4) * 220 + 150;
        const delay = i * 0.15;

        tl.to(card, {
          opacity: 1,
          y: yPos,
          x: xPos,
          scale: 1,
          z: 0,
          rotationX: 0,
          rotationZ: (i % 2 === 0 ? 2 : -2),
          duration: 1.2,
          ease: "expo.out",
        }, delay + 1);
      });

      // 4. Portal Expansion (The Master Card)
      const masterCard = cardsRef.current[6];
      tl.to(masterCard, {
        zIndex: 500,
        x: 0,
        y: "50vh",
        width: "100vw",
        height: "100vh",
        scale: 1.5,
        borderRadius: 0,
        backgroundColor: "#030303", 
        duration: 1.8,
        ease: "power4.inOut"
      }, "+=0.5");

      // 5. Slanted Brand Reveal (No Glows)
      tl.to(brandRef.current, { opacity: 1, duration: 0.1 })
        .from(".letter", {
          y: 100,
          x: 40,
          skewX: -20, // Slanted entry
          opacity: 0,
          stagger: 0.08,
          duration: 1.4,
          ease: "expo.out"
        }, "-=0.8")
        .from(".sub-line", {
          opacity: 0,
          y: 20,
          duration: 1,
          ease: "power2.out"
        }, "-=0.5");

    }, containerRef);

    return () => ctx.revert();
  }, []);

  const addToRefs = (el) => {
    if (el && !cardsRef.current.includes(el)) cardsRef.current.push(el);
  };

  return (
    <div ref={containerRef} className="fixed inset-0 bg-[#020202] overflow-hidden flex flex-col items-center">
      
      {/* 3D FOLDER */}
      <div ref={folderRef} className="relative w-96 h-28 bg-gradient-to-b from-neutral-800 to-black border-x border-b border-white/20 rounded-b-[40px] z-[100] shadow-2xl flex items-center justify-center">
        <div className="w-16 h-1 bg-white/20 rounded-full" />
      </div>

      {/* SEQUENTIAL GLASS CARDS */}
      <div className="relative w-full h-full flex justify-center items-start pt-10" style={{ perspective: '1500px', transformStyle: 'preserve-3d' }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            ref={addToRefs}
            className="absolute w-[340px] h-[200px] bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px] p-1 shadow-2xl"
          >
             <div className={`w-full h-full rounded-[28px] bg-gradient-to-br ${themes[i % themes.length]} border border-white/5 p-6 flex flex-col justify-between`}>
                <div className="w-10 h-10 bg-white/10 rounded-xl" />
                <div className="space-y-2">
                    <div className="w-full h-3 bg-white/10 rounded" />
                    <div className="w-2/3 h-3 bg-white/5 rounded" />
                </div>
                <div className="w-full h-8 bg-white/10 rounded-lg" />
             </div>
          </div>
        ))}
      </div>

      {/* FINAL BRANDING (Clean & Slanted) */}
      <div ref={brandRef} className="absolute inset-0 z-[600] opacity-0 flex flex-col items-center justify-center pointer-events-none">
        
        {/* Typographic Header */}
        <div className="flex overflow-hidden pb-4 transform skew-x-[-10deg]">
          {"Devdrop".split("").map((l, i) => (
            <span key={i} className="letter inline-block text-white text-[11vw] font-serif italic tracking-tighter leading-none px-2">
              {l}
            </span>
          ))}
        </div>

        {/* Minimalist Subline */}
        <div className="sub-line flex flex-col items-center mt-4">
            <div className="w-24 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent mb-6" />
            <p className="text-white/40 font-mono tracking-[1.5em] text-[10px] uppercase">
                Premium Digital Artistry
            </p>
        </div>
      </div>

      {/* Subtle Grain */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
    </div>
  );
};

export default DevDropElitePortal;