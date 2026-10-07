import React, { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import secondVideo from '../../assets/videos/v2.mp4';
import HomeSections from '../../components/home/HomeSections';

const Home = ({ preloadedVideoRef, introComplete, fromIntro }) => {
  const [isReady, setIsReady] = useState(false);
  const { scrollY } = useScroll();

  useEffect(() => {
    // The browser already starts a fresh document at the top. Avoid forcing a
    // synchronous scroll/layout pass during the critical first render.
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const showContent = introComplete || isReady;

  return (
    <>
      {/* ── Hero video + second video (unchanged) ── */}
      <div className="bg-[#050505] text-[#e8e2d6] selection:bg-[#e8e2d6] selection:text-black antialiased overflow-x-hidden">
        <VideoHeroSection
          scrollY={scrollY}
          preloadedVideoRef={preloadedVideoRef}
          introComplete={showContent}
          fromIntro={fromIntro}
        />
        <div className="relative z-10">
          <SmoothVideoSection scrollY={scrollY} />
        </div>
      </div>

      {/* ── Editorial sections ──
          Rendered outside the overflow-x-hidden wrapper above: overflow-x:hidden
          turns an element into a scroll container, which would silently break
          the sticky/pinned scroll effects below. overflow-x-clip does not. */}
      <div className="relative z-20 -mt-16 md:-mt-28 overflow-x-clip bg-[#050505] selection:bg-[#e8e2d6] selection:text-black antialiased">
        <div className="pointer-events-none absolute top-0 left-0 z-30 h-[250px] w-full bg-gradient-to-b from-transparent via-[#050505]/90 to-[#050505]" />
        <HomeSections />
      </div>
    </>
  );
};

/* ─── VIDEO HERO ─── */
const VideoHeroSection = ({ scrollY, preloadedVideoRef, introComplete, fromIntro }) => {
  const wrapperRef = useRef(null);
  // The hero is mounted behind the intro overlay, so keep it paintable from
  // the first render. The intro still visually covers it until it exits.
  const [visible, setVisible] = useState(true);
  const videoScale = useTransform(scrollY, [0, 1000], [1.03, 1]);
  const videoBlur = useTransform(scrollY, [200, 800], ["blur(0px)", "blur(8px)"]);
  const opacity = useTransform(scrollY, [0, 800], [1, 0.62]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const vid = preloadedVideoRef?.current;
    if (!wrapper || !vid) return;

    // The initial HTML element is intentionally invisible while it waits
    // outside the React tree. Remove those preload-only inline styles before
    // moving the same element into its real hero wrapper.
    vid.removeAttribute('style');
    vid.className = 'w-full h-full object-cover absolute inset-0 rounded-[1.75rem] sm:rounded-[2rem] lg:rounded-none';
    if (!wrapper.contains(vid)) wrapper.appendChild(vid);
  }, [preloadedVideoRef]);

  useEffect(() => {
    if (!introComplete) return;

    const vid = preloadedVideoRef?.current;
    if (!vid) return;

    const comingFromIntro = fromIntro?.current === true;

    if (comingFromIntro) {
      fromIntro.current = false;
      setVisible(true);
      return;
    }

    // Do not delay the LCP hero by an extra second after the page is ready.
    // Keep the existing fade transition, but let the video become visible
    // immediately so its first frame can be painted as the LCP candidate.
    setVisible(true);
    vid.currentTime = 0;
    vid.play().catch(() => {});
  }, [introComplete]);

  return (
    <motion.section 
      className="relative lg:sticky lg:top-0 w-full overflow-hidden z-0 flex flex-col justify-center items-center px-4 sm:px-5 md:px-6 lg:px-0 pt-24 sm:pt-28 md:pt-32 lg:pt-0 pb-8 sm:pb-10 lg:pb-0 min-h-[56vh] sm:min-h-[62vh] md:min-h-[72vh] lg:h-screen"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 1 }}
    >
      <motion.div 
        style={{ scale: videoScale, filter: videoBlur, opacity }} 
        className="relative w-full max-w-[28rem] sm:max-w-[40rem] md:max-w-[56rem] lg:max-w-none aspect-[16/12] sm:aspect-[16/10] md:aspect-video lg:absolute lg:inset-0 lg:w-full lg:h-full"
      >
        <div
          ref={wrapperRef}
          className="absolute inset-0 w-full h-full overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] border border-white/10 bg-[#0b0b0b] shadow-[0_24px_80px_rgba(0,0,0,0.42)] lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none"
        />
      </motion.div>
    </motion.section>
  );
};

/* ─── SMOOTH VIDEO SECTION ─── */
const SmoothVideoSection = ({ scrollY }) => {
  const videoRef = useRef(null);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || shouldLoadVideo) return;

    const loadVideo = () => setShouldLoadVideo(true);

    if (!('IntersectionObserver' in window)) {
      loadVideo();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadVideo();
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [shouldLoadVideo]);

  // Reuse the homepage-level scroll MotionValue. This avoids creating a
  // second global scroll subscription for the same page.
  const [viewportHeight, setViewportHeight] = useState(
    () => (typeof window !== 'undefined' ? window.innerHeight : 800)
  );

  useEffect(() => {
    const updateViewportHeight = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);

  const sectionStart = useTransform(scrollY, (value) => {
    const start = viewportHeight * 0.72;
    const end = start + viewportHeight * 1.4;
    return Math.min(1, Math.max(0, (value - start) / (end - start)));
  });
  const smoothP = useSpring(sectionStart, { stiffness: 40, damping: 24 });

  // Keep the layout box at its final dimensions so the card never changes
  // document geometry while scroll progress settles. Animate only transforms.
  const desktopScaleX = useTransform(smoothP, [0.1, 0.45], [60 / 92, 1]);
  const desktopScaleY = useTransform(smoothP, [0.1, 0.45], [65 / 88, 1]);
  const desktopRadius = useTransform(smoothP, [0.1, 0.45], ["80px", "54px"]);

  const mobileScaleY = useTransform(smoothP, [0.1, 0.45], [35 / 45, 1]);
  const mobileRadius = useTransform(smoothP, [0.1, 0.45], ["16px", "12px"]);

  const cardY = useTransform(smoothP, [0, 0.4], [60, 0]); 

  // Read the viewport during the initial client render so mobile does not
  // briefly render the desktop card dimensions and then jump to mobile.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const checkMobile = (event) => setIsMobile(event.matches);
    mq.addEventListener('change', checkMobile);
    return () => mq.removeEventListener('change', checkMobile);
  }, []);

  return (
    <section className="h-auto my-12 md:my-0 md:h-[140vh] relative">
      <div className="relative md:sticky md:top-0 md:h-screen w-full flex items-center justify-center z-10 px-4">
        <motion.div 
          style={{ 
            width: isMobile ? "100%" : "92%",
            height: isMobile ? "45vh" : "88vh",
            scaleX: isMobile ? 1 : desktopScaleX,
            scaleY: isMobile ? mobileScaleY : desktopScaleY,
            borderRadius: isMobile ? mobileRadius : desktopRadius,
            y: isMobile ? 0 : cardY,
            boxShadow: "0 50px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.08)" 
          }} 
          className="relative overflow-hidden bg-[#121212] group w-full"
        >
          <video
            ref={videoRef}
            {...(shouldLoadVideo ? { src: secondVideo } : {})}
            autoPlay
            loop
            muted
            playsInline
            preload="none"
            poster="/hero-poster.svg"
            className="w-full h-full object-cover opacity-90 transition-opacity duration-700 group-hover:opacity-100"
          />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        </motion.div>
      </div>
    </section>
  );
};

export default Home;
