import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import gsap from 'gsap';

const Loader = () => {
  const containerRef = useRef(null);
  const pathRef = useRef(null);
  const textRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    // When the new page is "ready" behind the beige wall:
    const tl = gsap.timeline();

    tl.set(containerRef.current, { display: "block" })
      // 1. Show "devdrop" briefly
      .to(textRef.current, { opacity: 1, y: 0, duration: 0.4 })
      .to(textRef.current, { opacity: 0, y: -20, duration: 0.3, delay: 0.5 })
      // 2. Arch UP to reveal the new page
      .to(pathRef.current, {
        attr: { d: "M0 0 L100 0 L100 100 Q50 50 0 100 L0 0" },
        duration: 0.7,
        ease: "power3.in",
      })
      .to(pathRef.current, {
        attr: { d: "M0 0 L100 0 L100 0 Q50 0 0 0 L0 0" },
        duration: 0.5,
        ease: "power3.out",
      })
      .set(containerRef.current, { display: "none" });
  }, [location]);

  return (
    <div ref={containerRef} className="loader-container fixed inset-0 z-[9999] pointer-events-none">
      <svg className="absolute top-0 w-full h-[110vh] fill-[#e8e2d6]" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path className="loader-path" ref={pathRef} d="M0 0 L100 0 L100 100 Q50 100 0 100 L0 0" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <h1 ref={textRef} className="text-black text-6xl md:text-8xl font-serif tracking-tighter opacity-0 translate-y-5">
          devdrop
        </h1>
      </div>
    </div>
  );
};

export default Loader;