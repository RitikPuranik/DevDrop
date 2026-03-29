import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import IntroLoader from './components/Intro_Loader';
import Loader from './components/Loading_Screen';
import Home from './pages/Home';
import About from './pages/AboutUs';
import Navbar from './components/Navbar';
import Template from './pages/Template';
import Footer from './components/Footer';

const VIDEO_SRC = '/dewdrop.s3.mp4';

export default function App() {
  const [showIntro, setShowIntro] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const suppressNextLoader = useRef(false);
  const fromIntro = useRef(false);
  const preloadedVideoRef = useRef(null);

  // Expose a play trigger that Home will call
  const videoReadyRef = useRef({
    element: null,
    playAfterIntro: false, // set to true when coming from intro
  });

  useEffect(() => {
    const seenIntro = sessionStorage.getItem('devdrop_intro_seen');
    if (!seenIntro) {
      setShowIntro(true);
    } else {
      setIntroComplete(true);
    }
    setAppReady(true);

    // Preload the video element
    const vid = document.createElement('video');
    vid.src = VIDEO_SRC;
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.loop = false;
    vid.load();

    preloadedVideoRef.current = vid;
    videoReadyRef.current.element = vid;
  }, []);

const handleIntroComplete = () => {
  sessionStorage.setItem('devdrop_intro_seen', 'true');
  suppressNextLoader.current = true;
  fromIntro.current = true;

  // ✅ Start video NOW, while still on intro screen
  const vid = preloadedVideoRef.current;
  if (vid) {
    vid.currentTime = 0;
    vid.play().catch(() => {});
  }

  setShowIntro(false);
  setIntroComplete(true);
};

  return (
    <Router>
      <AnimatePresence mode="wait">
        {showIntro && (
          <IntroLoader key="intro-loader" onComplete={handleIntroComplete} />
        )}
      </AnimatePresence>

      {appReady && (
        <>
          <Loader suppressOnce={suppressNextLoader} />
          <Navbar />
          <main className="bg-black min-h-screen">
            <Routes>
              <Route
                path="/"
                element={
                  <Home
                    preloadedVideoRef={preloadedVideoRef}
                    videoReadyRef={videoReadyRef}   // ← new: carries play state
                    introComplete={introComplete}
                    fromIntro={fromIntro}
                  />
                }
              />
              <Route path="/about" element={<About />} />
              <Route path="/template" element={<Template />} />
            </Routes>
            <Footer />
          </main>
        </>
      )}
    </Router>
  );
}