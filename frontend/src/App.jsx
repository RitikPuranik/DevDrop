import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    const seenIntro = sessionStorage.getItem('devdrop_intro_seen');
    if (!seenIntro) {
      setShowIntro(true);
    } else {
      setIntroFinished(true); // If already seen, allow site to show immediately
    }
  }, []);

  const handleIntroComplete = () => {
    sessionStorage.setItem('devdrop_intro_seen', 'true');
    setShowIntro(false);
    // Delay setting introFinished slightly to allow AnimatePresence exit to play
    setTimeout(() => setIntroFinished(true), 1000); 
  };

  return (
    <Router>
      <AnimatePresence mode="wait">
        {showIntro && (
          <IntroLoader key="intro-loader" onComplete={handleIntroComplete} />
        )}
      </AnimatePresence>

      {/* Only mount the site content and Arc Loader after intro is done */}
      {introFinished && (
        <>
          <Loader />
          {/* <nav className="fixed top-0 w-full p-8 flex justify-center gap-10 z-[50] text-white mix-blend-difference">
            <LinkTransition to="/" className="font-serif uppercase tracking-widest text-xs">Index</LinkTransition>
            <LinkTransition to="/about" className="font-serif uppercase tracking-widest text-xs">About</LinkTransition>
          </nav> */}
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