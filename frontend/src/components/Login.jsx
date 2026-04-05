import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, X, Facebook, Chrome, Linkedin } from 'lucide-react';

export default function AuthModal({ isOpen, onClose }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle opening animation states
  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onTransitionEnd={() => !isOpen && setShouldRender(false)}
    >
      {/* Backdrop - Blur makes it look high-end without needing a loader */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* Main Sliding Container */}
      <div className={`relative overflow-hidden w-[768px] max-w-full min-h-[520px] bg-white rounded-[40px] shadow-2xl transition-transform duration-500 transform ${
        isOpen ? "scale-100 translate-y-0" : "scale-90 translate-y-12"
      }`}>
        
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-6 right-6 z-[110] p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
          <X size={24} />
        </button>

        {/* --- SIGN UP FORM --- */}
        <div className={`absolute top-0 h-full w-1/2 transition-all duration-700 ease-in-out left-0 opacity-0 z-[1] 
          ${isSignUp ? "translate-x-full opacity-100 z-[5] delay-[100ms]" : ""}`}>
          <form className="flex flex-col items-center justify-center h-full px-12 text-center" onSubmit={e => e.preventDefault()}>
            <h2 className="text-3xl font-bold text-slate-800 mb-6">Create Account</h2>
            <div className="flex gap-4 mb-6">
              <SocialIcon Icon={Facebook} />
              <SocialIcon Icon={Chrome} />
              <SocialIcon Icon={Linkedin} />
            </div>
            <p className="text-sm text-slate-400 mb-4">or use your email for registration</p>
            <AuthInput icon={User} type="text" placeholder="Name" />
            <AuthInput icon={Mail} type="email" placeholder="Email" />
            <AuthInput icon={Lock} type="password" placeholder="Password" />
            <button className="mt-8 px-14 py-3.5 bg-blue-600 text-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all shadow-xl shadow-blue-100">
              Sign Up
            </button>
          </form>
        </div>

        {/* --- SIGN IN FORM --- */}
        <div className={`absolute top-0 h-full w-1/2 transition-all duration-700 ease-in-out left-0 z-[2] 
          ${isSignUp ? "translate-x-full opacity-0" : "opacity-100"}`}>
          <form className="flex flex-col items-center justify-center h-full px-12 text-center" onSubmit={e => e.preventDefault()}>
            <h2 className="text-3xl font-bold text-slate-800 mb-6">Welcome Back</h2>
            <div className="flex gap-4 mb-6">
              <SocialIcon Icon={Facebook} />
              <SocialIcon Icon={Chrome} />
              <SocialIcon Icon={Linkedin} />
            </div>
            <p className="text-sm text-slate-400 mb-4">or use your account</p>
            <AuthInput icon={Mail} type="email" placeholder="Email" />
            <AuthInput icon={Lock} type="password" placeholder="Password" />
            <button className="text-sm text-slate-400 mt-4 hover:text-blue-600">Forgot your password?</button>
            <button className="mt-8 px-14 py-3.5 bg-blue-600 text-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all shadow-xl shadow-blue-100">
              Sign In
            </button>
          </form>
        </div>

        {/* --- OVERLAY PANEL (The Sliding Blue Part) --- */}
        <div className={`absolute top-0 left-1/2 w-1/2 h-full overflow-hidden transition-all duration-700 ease-in-out z-[100] 
          ${isSignUp ? "-translate-x-full rounded-r-[100px]" : "rounded-l-[100px]"}`}>
          
          <div className={`relative -left-full h-full w-[200%] bg-gradient-to-br from-blue-500 to-blue-800 transition-all duration-700 ease-in-out
            ${isSignUp ? "translate-x-1/2" : "translate-x-0"}`}>
            
            <div className="flex h-full w-full text-white">
              {/* Left Side (Shown when Sign Up active) */}
              <div className="flex flex-col items-center justify-center w-1/2 px-12 text-center transition-all">
                <h2 className="text-3xl font-bold mb-4">New Here?</h2>
                <p className="text-blue-100 text-sm mb-10 leading-relaxed">Enter your personal details and start your journey with us</p>
                <button onClick={() => setIsSignUp(false)} className="px-12 py-3 border-2 border-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-blue-600 transition-all">
                  Sign In
                </button>
              </div>

              {/* Right Side (Shown when Sign In active) */}
              <div className="flex flex-col items-center justify-center w-1/2 px-12 text-center transition-all">
                <h2 className="text-3xl font-bold mb-4">Hello, Friend!</h2>
                <p className="text-blue-100 text-sm mb-10 leading-relaxed">Enter your personal details and start your journey with us</p>
                <button onClick={() => setIsSignUp(true)} className="px-12 py-3 border-2 border-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-blue-600 transition-all">
                  Sign Up
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helpers
const SocialIcon = ({ Icon }) => (
  <button className="w-11 h-11 flex items-center justify-center border border-slate-200 rounded-full text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all">
    <Icon size={20} />
  </button>
);

const AuthInput = ({ icon: Icon, ...props }) => (
  <div className="relative w-full mb-3">
    <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
    <input {...props} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-100 transition-all" />
  </div>
);