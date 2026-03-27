import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import IntroLoader from './components/Intro_Loader';
import Loader from './components/Loading_Screen';
import Home from './pages/Home';
import About from './pages/AboutUs';
import Navbar from './components/Navbar';
import Template from './pages/Template';

const VIDEO_SRC = '/dewdrop.s3.mp4';

export default function App() {
  const [showIntro, setShowIntro] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const suppressNextLoader = useRef(false);
  const fromIntro = useRef(false); // ← tracks if Home is being revealed post-intro
  const preloadedVideoRef = useRef(null);

  useEffect(() => {
    const seenIntro = sessionStorage.getItem('devdrop_intro_seen');
    if (!seenIntro) {
      setShowIntro(true);
    } else {
      setIntroComplete(true);
    }
    setAppReady(true);

    const vid = document.createElement('video');
    vid.src = VIDEO_SRC;
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.loop = false; // ← play once only
    vid.load();
    preloadedVideoRef.current = vid;
  }, []);

  const handleIntroComplete = () => {
    sessionStorage.setItem('devdrop_intro_seen', 'true');
    suppressNextLoader.current = true;
    fromIntro.current = true; // ← mark that next Home mount comes from intro
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
                    introComplete={introComplete}
                    fromIntro={fromIntro} // ← pass as ref so Home can read+reset it
                  />
                }
              />
              <Route path="/about" element={<About />} />
              <Route path="/template" element={<Template />} />
            </Routes>
          </main>
        </>
      )}
    </Router>
  );
}