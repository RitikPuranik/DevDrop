import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { motion, AnimatePresence } from "framer-motion"; // Assuming you have framer-motion, otherwise use standard divs

const REDIRECT_SECONDS = 5;

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&display=swap');
  
  :root {
    --accent: #f97316; /* Orange-500 */
    --bg: #050505;
  }

  .elite-container {
    font-family: 'Plus Jakarta Sans', sans-serif;
    background-color: var(--bg);
    color: white;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .mesh-gradient {
    position: absolute;
    width: 100%;
    height: 100%;
    background: 
      radial-gradient(circle at 10% 10%, rgba(249, 115, 22, 0.08) 0%, transparent 40%),
      radial-gradient(circle at 90% 90%, rgba(249, 115, 22, 0.05) 0%, transparent 40%);
    z-index: 0;
  }

  .glass-card {
    background: rgba(255, 255, 255, 0.02);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 40px;
    padding: 60px;
    width: 100%;
    max-width: 500px;
    text-align: center;
    z-index: 10;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }

  .btn-primary {
    background: white;
    color: black;
    padding: 16px 32px;
    border-radius: 16px;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 12px;
    letter-spacing: 1px;
    border: none;
    cursor: pointer;
    transition: all 0.3s ease;
    width: 100%;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(255,255,255,0.1);
  }

  .mono { font-family: 'JetBrains Mono', monospace; }
  
  @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .spinner { animation: spin-slow 3s linear infinite; }
`;

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [errMsg, setErrMsg] = useState("");
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);
  const calledRef = useRef(false);

  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
    
    if (calledRef.current) return;
    calledRef.current = true;

    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setErrMsg("Verification token missing.");
      return;
    }

    api.post("/auth/verify-email", { token })
      .then(r => setStatus(r.data.success ? "success" : "error"))
      .catch(e => {
        setStatus("error");
        setErrMsg(e.response?.data?.message || "Invalid or expired link.");
      });
  }, []);

  useEffect(() => {
    if (status !== "success") return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status, navigate]);

  return (
    <div className="elite-container">
      <div className="mesh-gradient" />
      
      {/* Decorative Grid */}
      <div style={{ 
        position: 'absolute', inset: 0, 
        backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse at center, black, transparent 80%)'
      }} />

      <div className="glass-card">
        {status === "loading" && <LoadingState />}
        {status === "success" && <SuccessState countdown={countdown} onAction={() => navigate("/")} />}
        {status === "error" && <ErrorState msg={errMsg} onAction={() => navigate("/")} />}
      </div>
      
      {/* Brand Watermark */}
      <div className="mono" style={{ position: 'fixed', bottom: 40, opacity: 0.3, fontSize: 10, letterSpacing: 4, width: '100%', textAlign: 'center' }}>
        DEV DROP // SYSTEM AUTH
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div>
      <div style={{ marginBottom: 40, position: 'relative', display: 'inline-block' }}>
        <svg className="spinner" width="80" height="80" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" />
          <circle cx="50" cy="50" r="45" fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="120 200" strokeLinecap="round" />
        </svg>
      </div>
      <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>Verifying Account</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>Securing your credentials in the DevDrop ecosystem...</p>
    </div>
  );
}

function SuccessState({ countdown, onAction }) {
  return (
    <div>
      <div style={{ 
        width: 80, height: 80, background: '#f97316', borderRadius: '24px', 
        margin: '0 auto 40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 20px 40px rgba(249, 115, 22, 0.3)'
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>Identity Verified</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40, lineHeight: 1.6 }}>
        Your email is confirmed. Welcome to the premium marketplace for developers.
      </p>
      
      <button className="btn-primary" onClick={onAction}>
        Enter Dashboard
      </button>
      
      <div className="mono" style={{ marginTop: 24, fontSize: 10, color: '#f97316', opacity: 0.8 }}>
        Auto-redirecting in {countdown}s...
      </div>
    </div>
  );
}

function ErrorState({ msg, onAction }) {
  return (
    <div>
      <div style={{ 
        width: 80, height: 80, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', 
        borderRadius: '24px', margin: '0 auto 40px', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
      <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>Verification Failed</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40, lineHeight: 1.6 }}>{msg}</p>
      
      <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }} onClick={onAction}>
        Go Back Home
      </button>
    </div>
  );
}