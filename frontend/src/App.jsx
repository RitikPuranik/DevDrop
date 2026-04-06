import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

import IntroLoader from './components/Intro_Loader';
import Loader from './components/Loading_Screen';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import About from './pages/AboutUs';
import Template from './pages/Templates';
import ContactUs from './pages/ContactUs';
import ReviewPage from './pages/Review';

const VIDEO_SRC = '/dewdrop.s3.mp4';

function AppContent() {

  const location = useLocation();
  const isBuilder = location.pathname === "/website";

  const [showIntro, setShowIntro] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);

  const suppressNextLoader = useRef(false);
  const fromIntro = useRef(false);
  const preloadedVideoRef = useRef(null);

  const videoReadyRef = useRef({
    element: null,
    playAfterIntro: false,
  });

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
    vid.loop = false;
    vid.load();

    preloadedVideoRef.current = vid;
    videoReadyRef.current.element = vid;

  }, []);

  const handleIntroComplete = () => {

    sessionStorage.setItem('devdrop_intro_seen', 'true');

    suppressNextLoader.current = true;
    fromIntro.current = true;

    const vid = preloadedVideoRef.current;

    if (vid) {
      vid.currentTime = 0;
      vid.play().catch(() => {});
    }

    setShowIntro(false);
    setIntroComplete(true);
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {showIntro && (
          <IntroLoader key="intro-loader" onComplete={handleIntroComplete} />
        )}
      </AnimatePresence>

      {appReady && (
        <>
          <Loader suppressOnce={suppressNextLoader} />

          {/* Hide Navbar on Builder */}
          {!isBuilder && <Navbar />}

          <main className="bg-black min-h-screen">

            <Routes>

              <Route
                path="/"
                element={
                  <Home
                    preloadedVideoRef={preloadedVideoRef}
                    videoReadyRef={videoReadyRef}
                    introComplete={introComplete}
                    fromIntro={fromIntro}
                  />
                }
              />

              <Route path="/about" element={<About />} />
              <Route path="/template" element={<Template />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/review" element={<ReviewPage />} />

              {/* Builder */}
              {/* <Route path="/website" element={<MakeYourOwn />} /> */}

            </Routes>

          </main>

          {/* Hide Footer on Builder */}
          {!isBuilder && <Footer />}
        </>
      )}
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}