import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import IntroLoader from './components/Intro_Loader';
import Loader from './components/Loading_Screen'; 
import Home from './pages/Home';
import About from './pages/AboutUs';
import LinkTransition from './components/TransitionLink';
import Navbar from './components/Navbar';
import FlipOnScroll from './pages/FlipOnScroll';

export default function App() {
  const [showIntro, setShowIntro] = useState(false);
  const [introFinished, setIntroFinished] = useState(false);
  // Track if this is the very first mount after intro — suppress Loading_Screen once
  const suppressNextLoader = useRef(false);

  useEffect(() => {
    const seenIntro = sessionStorage.getItem('devdrop_intro_seen');
    if (!seenIntro) {
      setShowIntro(true);
    } else {
      setIntroFinished(true);
    }
  }, []);

  const handleIntroComplete = () => {
    sessionStorage.setItem('devdrop_intro_seen', 'true');
    suppressNextLoader.current = true; // first transition: skip Loading_Screen
    setShowIntro(false);
    setTimeout(() => {
      setIntroFinished(true);
    }, 1000);
  };

  return (
    <Router>
      <AnimatePresence mode="wait">
        {showIntro && (
          <IntroLoader key="intro-loader" onComplete={handleIntroComplete} />
        )}
      </AnimatePresence>

      {introFinished && (
        <>
          <Loader suppressOnce={suppressNextLoader} />
          <Navbar />
          <main className="bg-black min-h-screen">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/flip" element={<FlipOnScroll />} />
            </Routes>
          </main>
        </>
      )}
    </Router>
  );
}