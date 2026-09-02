import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from "sonner";

import IntroLoader from './components/loaders/IntroLoader';
import Loader from './components/loaders/LoadingScreen';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Home from './pages/marketing/Home';
import About from './pages/marketing/AboutUs';
import TemplatesPage from './pages/marketplace/Templates';
import ContactUs from './pages/marketing/ContactUs';
import ReviewPage from './pages/marketing/Review';
import Profile from './pages/account/Profile';
import Dashboard from './pages/account/Dashboard';
import PurchaseAccess from './pages/marketplace/PurchaseAccess';
import DeployProject from './pages/deployment/DeployProject';
import DeploymentDetails from './pages/deployment/DeploymentDetails';
import VercelOAuthCallback from './pages/deployment/VercelOAuthCallback';
import AdminPanel from "./pages/admin/AdminPanelPage";
import WebsiteDetail from './pages/marketplace/WebsiteDetail';
import Checkout from './pages/marketplace/Checkout';
import VerifyEmail from './pages/auth/VerifyEmail';
import ResetPassword from './pages/auth/ResetPassword';
import Documentation from './pages/marketing/Documentation';
import Terms from './pages/marketing/Terms';
import Privacy from './pages/marketing/Privacy';

const HERO_VIDEO_SRC = '/dewdrop.s3.mp4';

function AppContent() {
  const location = useLocation();
  const isBuilder = location.pathname === "/website";
  const isDashboard = location.pathname.startsWith("/dashboard");
  const isVerifyEmail = location.pathname === "/verify-email";
  const isResetPassword = location.pathname === "/reset-password";
  const isVercelCallback = location.pathname === "/deploy/vercel-callback";
  const isStandaloneAuthPage = isVerifyEmail || isResetPassword || isVercelCallback;

  if (isStandaloneAuthPage) {
    sessionStorage.setItem('devdrop_intro_seen', 'true');
  }

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

    // Preload the shared hero video once so every viewport uses the same asset.
    const vid = document.createElement('video');
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.loop = false;
    vid.src = HERO_VIDEO_SRC;
    vid.load();

    preloadedVideoRef.current = vid;
    videoReadyRef.current.element = vid;

    return () => {
      vid.pause();
    };
  }, []);

  const handleIntroComplete = () => {
    sessionStorage.setItem('devdrop_intro_seen', 'true');
    suppressNextLoader.current = true;
    fromIntro.current = true;

    const vid = preloadedVideoRef.current;
    if (vid) {
      vid.currentTime = 0;
      vid.play().catch(() => { });
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
          {!isStandaloneAuthPage && <Loader suppressOnce={suppressNextLoader} />}
          {!isBuilder && !isStandaloneAuthPage && <Navbar />}

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
              <Route path="/template" element={<TemplatesPage />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/docs" element={<Documentation />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/purchases/:purchaseId" element={<PurchaseAccess />} />
              <Route path="/deploy/vercel-callback" element={<VercelOAuthCallback />} />
              <Route path="/deploy/:purchaseId" element={<DeployProject />} />
              <Route path="/deployments/:deploymentId" element={<DeploymentDetails />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/website/:id" element={<WebsiteDetail />} />
              <Route path="/checkout/:id" element={<Checkout />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/reset-password" element={<ResetPassword />} />
            </Routes>

            <Toaster
              position="top-right"
              richColors
              toastOptions={{
                style: {
                  backdropFilter: "blur(10px)",
                  background: "rgba(30,30,30,0.85)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.1)"
                }
              }}
            />
          </main>

          {!isBuilder && !isDashboard && !isStandaloneAuthPage && <Footer />}
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