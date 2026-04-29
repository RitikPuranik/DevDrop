import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../api/axios";

const REDIRECT_SECONDS = 3;

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Space+Mono:wght@400;700&display=swap');
  @keyframes dd-fade-up { from{opacity:0;transform:translateY(22px);filter:blur(5px)} to{opacity:1;transform:translateY(0);filter:blur(0)} }
  @keyframes dd-fade-in { from{opacity:0} to{opacity:1} }
  @keyframes dd-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes dd-pulse { 0%,100%{box-shadow:0 0 0 8px rgba(139,115,85,0.05),0 0 0 16px rgba(139,115,85,0.02)} 50%{box-shadow:0 0 0 12px rgba(139,115,85,0.10),0 0 0 24px rgba(139,115,85,0.04)} }
  @keyframes dd-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
  @keyframes dd-shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
  @keyframes dd-scan { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
  @keyframes dd-bar { 0%{transform:translateX(-100%)} 50%{transform:translateX(0%)} 100%{transform:translateX(100%)} }
  @keyframes dd-check { from{stroke-dashoffset:50} to{stroke-dashoffset:0} }
  .dd-up-1{animation:dd-fade-up .9s cubic-bezier(.22,1,.36,1) .05s both}
  .dd-up-2{animation:dd-fade-up .9s cubic-bezier(.22,1,.36,1) .22s both}
  .dd-up-3{animation:dd-fade-up .9s cubic-bezier(.22,1,.36,1) .40s both}
  .dd-up-4{animation:dd-fade-up .9s cubic-bezier(.22,1,.36,1) .58s both}
  .dd-up-5{animation:dd-fade-up .9s cubic-bezier(.22,1,.36,1) .76s both}
  .dd-in{animation:dd-fade-in 1.4s ease both}
  .dd-shimmer{background:linear-gradient(100deg,#8b7355 0%,#d4b896 38%,#f5f2ed 50%,#d4b896 62%,#8b7355 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:dd-shimmer 3.5s linear infinite}
  .dd-btn{position:relative;overflow:hidden;transition:all .4s cubic-bezier(.22,1,.36,1)}
  .dd-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent);transform:translateX(-100%);transition:transform .55s ease}
  .dd-btn:hover::after{transform:translateX(100%)}
  .dd-btn:hover{transform:translateY(-2px)}
  .dd-btn:active{transform:translateY(0) scale(.98)}
`;

function useStyles() {
  const done = useRef(false);
  if (!done.current) {
    const el = document.createElement("style");
    el.textContent = CSS;
    document.head.appendChild(el);
    done.current = true;
  }
}

function Orb({ style }) {
  return <div style={{ position:"fixed", borderRadius:"50%", filter:"blur(70px)", pointerEvents:"none", ...style }}/>;
}

function Ring({ n, total }) {
  const R = 30, C = 2 * Math.PI * R;
  const filled = ((total - n) / total) * C;
  return (
    <div style={{ position:"relative", width:84, height:84, margin:"0 auto" }}>
      <svg width="84" height="84" viewBox="0 0 84 84" style={{ display:"block", transform:"rotate(-90deg)" }}>
        <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(139,115,85,0.12)" strokeWidth="2"/>
        <circle cx="42" cy="42" r={R} fill="none" stroke="#8b7355" strokeWidth="2" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C - filled} style={{ transition:"stroke-dashoffset .95s linear" }}/>
      </svg>
      <div style={{
        position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"'Space Mono',monospace", fontSize:24, fontWeight:700, color:"#c4a882", letterSpacing:"-0.05em",
      }}>{n}</div>
    </div>
  );
}

export default function VerifyEmail() {
  useStyles();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [errMsg, setErrMsg] = useState("");
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const token = searchParams.get("token");
    if (!token) { setStatus("error"); setErrMsg("No verification token found. Please request a new link."); return; }
    api.post("/auth/verify-email", { token })
      .then(r => { if (r.data.success) setStatus("success"); else { setStatus("error"); setErrMsg(r.data.message || "Verification failed."); }})
      .catch(e => { setStatus("error"); setErrMsg(e.response?.data?.message || "Invalid or expired verification link."); });
  }, []);

  useEffect(() => {
    if (status !== "success") return;
    const id = setInterval(() => setCountdown(p => { if (p <= 1) { clearInterval(id); navigate("/"); return 0; } return p - 1; }), 1000);
    return () => clearInterval(id);
  }, [status]);

  const err = status === "error";

  return (
    <div style={{ minHeight:"100vh", background:"#030303", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Cormorant Garamond',serif", padding:"24px", position:"relative", overflow:"hidden" }}>
      {/* grain */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", opacity:.042, zIndex:5, mixBlendMode:"screen", backgroundImage:GRAIN }}/>
      {/* scanlines */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:4, backgroundImage:"repeating-linear-gradient(0deg,rgba(255,255,255,0.011) 0px,rgba(255,255,255,0.011) 1px,transparent 1px,transparent 4px)" }}/>
      {/* scan beam */}
      <div style={{ position:"fixed", left:0, right:0, height:180, background:"linear-gradient(to bottom,transparent,rgba(139,115,85,0.018),transparent)", pointerEvents:"none", zIndex:6, animation:"dd-scan 7s linear infinite" }}/>
      {/* orbs */}
      <Orb style={{ top:"8%", left:"12%", width:360, height:360, background:err?"radial-gradient(circle,rgba(139,53,53,0.22) 0%,transparent 70%)":"radial-gradient(circle,rgba(139,115,85,0.2) 0%,transparent 70%)", animation:"dd-float 6s ease-in-out infinite" }}/>
      <Orb style={{ bottom:"12%", right:"8%", width:280, height:280, background:err?"radial-gradient(circle,rgba(100,30,30,0.16) 0%,transparent 70%)":"radial-gradient(circle,rgba(100,80,50,0.18) 0%,transparent 70%)", animation:"dd-float 8s ease-in-out 1.5s infinite" }}/>
      {/* wordmark */}
      <div className="dd-in" style={{ position:"fixed", top:32, left:40, zIndex:20, fontFamily:"'Space Mono',monospace", fontSize:12, letterSpacing:"0.28em", color:"rgba(139,115,85,0.4)", textTransform:"uppercase" }}>devdrop</div>

      {status === "loading" && <LoadingView/>}
      {status === "success" && <SuccessView countdown={countdown} total={REDIRECT_SECONDS} onSkip={()=>navigate("/")}/>}
      {status === "error"   && <ErrorView msg={errMsg} onBack={()=>navigate("/")}/>}
    </div>
  );
}

function LoadingView() {
  return (
    <div className="dd-in" style={{ textAlign:"center", maxWidth:400 }}>
      <div style={{ position:"relative", width:60, height:60, margin:"0 auto 44px" }}>
        <svg width="60" height="60" viewBox="0 0 60 60" style={{ animation:"dd-spin 2.2s linear infinite" }}>
          <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(139,115,85,0.1)" strokeWidth="1.5"/>
          <circle cx="30" cy="30" r="24" fill="none" stroke="#8b7355" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="35 115"/>
        </svg>
      </div>
      <p style={{ fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:"0.38em", color:"rgba(139,115,85,0.45)", textTransform:"uppercase", marginBottom:18 }}>authenticating</p>
      <h1 style={{ fontSize:44, fontWeight:300, color:"#F5F2ED", lineHeight:1.1, marginBottom:16 }}>
        Verifying your<br/><em style={{ color:"rgba(245,242,237,0.5)" }}>email address</em>
      </h1>
      <p style={{ fontSize:15, fontWeight:300, lineHeight:1.7, color:"rgba(245,242,237,0.3)", letterSpacing:"0.01em" }}>
        Hang tight — this only takes a moment.
      </p>
      <div style={{ marginTop:52, height:1, background:"rgba(139,115,85,0.1)", borderRadius:1, overflow:"hidden" }}>
        <div style={{ height:"100%", width:"55%", background:"linear-gradient(90deg,transparent,#8b7355,transparent)", animation:"dd-bar 2s ease-in-out infinite" }}/>
      </div>
    </div>
  );
}

function SuccessView({ countdown, total, onSkip }) {
  return (
    <div style={{ textAlign:"center", maxWidth:460, width:"100%" }}>
      {/* seal */}
      <div className="dd-up-1" style={{ marginBottom:44 }}>
        <div style={{ width:92, height:92, borderRadius:"50%", margin:"0 auto", background:"radial-gradient(circle at 32% 32%,#221c10,#0d0d0d)", border:"1px solid rgba(139,115,85,0.28)", display:"flex", alignItems:"center", justifyContent:"center", animation:"dd-pulse 3.5s ease-in-out infinite, dd-float 4s ease-in-out infinite" }}>
          <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
            <polyline points="8,19 16,27 30,11" stroke="#a08060" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="50" style={{ animation:"dd-check .7s cubic-bezier(.22,1,.36,1) .3s both" }}/>
          </svg>
        </div>
      </div>
      <p className="dd-up-1" style={{ fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:"0.4em", color:"rgba(139,115,85,0.55)", textTransform:"uppercase", marginBottom:18 }}>identity confirmed</p>
      <h1 className="dd-up-2 dd-shimmer" style={{ fontSize:58, fontWeight:300, lineHeight:1.02, marginBottom:10, letterSpacing:"-0.02em" }}>You're in.</h1>
      <h2 className="dd-up-2" style={{ fontSize:21, fontWeight:300, fontStyle:"italic", color:"rgba(245,242,237,0.38)", marginBottom:36, letterSpacing:"0.01em" }}>Welcome to DevDrop.</h2>
      <div className="dd-up-3" style={{ width:36, height:1, background:"linear-gradient(90deg,transparent,rgba(139,115,85,0.5),transparent)", margin:"0 auto 34px" }}/>
      <p className="dd-up-3" style={{ fontSize:16, fontWeight:300, lineHeight:1.75, color:"rgba(245,242,237,0.38)", marginBottom:52, letterSpacing:"0.01em" }}>
        Your email has been confirmed. You're all set<br/>to discover, buy, and sell on the marketplace.
      </p>
      <div className="dd-up-4" style={{ marginBottom:36 }}>
        <Ring n={countdown} total={total}/>
        <p style={{ marginTop:14, fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:"0.25em", color:"rgba(139,115,85,0.4)", textTransform:"uppercase" }}>redirecting in {countdown}s</p>
      </div>
      <div className="dd-up-5">
        <button onClick={onSkip} className="dd-btn" style={{ background:"transparent", border:"1px solid rgba(139,115,85,0.35)", color:"#c4a882", padding:"15px 44px", borderRadius:2, fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:"0.35em", textTransform:"uppercase", cursor:"pointer" }}>
          Enter Now →
        </button>
      </div>
    </div>
  );
}

function ErrorView({ msg, onBack }) {
  return (
    <div style={{ textAlign:"center", maxWidth:440, width:"100%" }}>
      <div className="dd-up-1" style={{ marginBottom:44 }}>
        <div style={{ width:92, height:92, borderRadius:"50%", margin:"0 auto", background:"radial-gradient(circle at 32% 32%,#1c0a0a,#0d0d0d)", border:"1px solid rgba(139,53,53,0.28)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
            <line x1="9" y1="9" x2="25" y2="25" stroke="#7a3030" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="25" y1="9" x2="9" y2="25" stroke="#7a3030" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
      <p className="dd-up-1" style={{ fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:"0.4em", color:"rgba(139,53,53,0.65)", textTransform:"uppercase", marginBottom:18 }}>verification failed</p>
      <h1 className="dd-up-2" style={{ fontSize:50, fontWeight:300, lineHeight:1.1, color:"#F5F2ED", marginBottom:10 }}>
        Link expired<br/><em style={{ color:"rgba(245,242,237,0.35)" }}>or invalid.</em>
      </h1>
      <div className="dd-up-3" style={{ width:36, height:1, background:"linear-gradient(90deg,transparent,rgba(139,53,53,0.4),transparent)", margin:"30px auto" }}/>
      <p className="dd-up-3" style={{ fontSize:15, fontWeight:300, lineHeight:1.75, color:"rgba(245,242,237,0.35)", marginBottom:52, letterSpacing:"0.01em" }}>{msg}</p>
      <div className="dd-up-4">
        <button onClick={onBack} className="dd-btn" style={{ background:"transparent", border:"1px solid rgba(139,53,53,0.3)", color:"rgba(245,242,237,0.5)", padding:"15px 44px", borderRadius:2, fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:"0.35em", textTransform:"uppercase", cursor:"pointer" }}>
          Back to Home →
        </button>
      </div>
    </div>
  );
}