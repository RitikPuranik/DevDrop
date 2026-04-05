import { useState } from 'react';
import { Mail, Lock, User, Sparkles, Plus, Clock } from 'lucide-react'; // Use icons as placeholders

export default function SlidingLoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-6 antialiased">
      {/* Container (Sets the perspective for the slide) */}
      <div className="w-full max-w-5xl h-[650px] bg-white rounded-3xl shadow-2xl overflow-hidden relative group">
        
        {/* ==========================================================
            1. Overlay (The sliding magenta panel and illustration)
           ========================================================== */}
        <div 
          className={`absolute top-0 w-1/2 h-full bg-brand-500 text-white p-12 flex flex-col justify-center items-center text-center z-20 
                      transition-all duration-700 ease-in-out group-hover:transition-none
                      ${isSignUp ? 'translate-x-full rounded-r-3xl' : 'translate-x-0 rounded-l-3xl'}`}
          style={{ transitionProperty: 'transform, border-radius' }}
        >
          {/* Logo Placeholder */}
          <div className="absolute top-8 left-8 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="font-display text-xl font-semibold text-white">ResumeAI</span>
          </div>

          {/* Illustration Content (Ref: image_1.png circus man) */}
          {/* NOTE: You will need to replace this with your actual SVG or Image.
              I am using divs to create the composition shape as a placeholder. */}
          <div className="relative w-72 h-72 mb-8 mt-12">
            {/* Circus Master Placeholder (Using Lucide icons for now) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Plus size={100} className="text-white/20" /> {/* Ringmaster shape */}
            </div>
            {/* Confetti/Props */}
            <div className="absolute top-0 right-0 w-12 h-6 bg-amber-400 rotate-12 rounded-full" />
            <div className="absolute bottom-10 left-0 w-12 h-6 bg-cream-500/30 -rotate-12 rounded-full" />
          </div>

          <h2 className="font-display text-4xl font-semibold mb-3">
            {isSignUp ? 'Welcome Back!' : 'Start Your Journey'}
          </h2>
          <p className="text-cream-200/90 max-w-sm text-sm mb-10 leading-relaxed">
            {isSignUp 
              ? 'To keep connected with us please login with your personal info'
              : 'Sign up to continue your career journey with AI'
            }
          </p>

          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="border-2 border-white rounded-full px-12 py-3 text-sm font-semibold tracking-wider hover:bg-white hover:text-brand-500 transition-colors"
          >
            {isSignUp ? 'SIGN IN' : 'SIGN UP'}
          </button>
        </div>

        {/* ==========================================================
            2. Content Panels (The actual forms)
           ========================================================== */}
        <div className="absolute inset-0 w-full h-full flex z-10">
          
          {/* LEFT PANEL: Sign Up Form (Only visible when isSignUp is true) */}
          <div className={`w-1/2 h-full bg-white flex items-center justify-center p-16 transition-all duration-700 ease-in-out
                          ${isSignUp ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}`}
          >
            <form className="w-full max-w-sm text-center">
              <h1 className="font-display text-4xl font-semibold text-charcoal-800 mb-8">Create Account</h1>
              
              <div className="flex justify-center gap-3 mb-8">
                {/* Social Buttons (ref: image_1.png) */}
                {['f', 'G', 'in'].map(p => (
                  <button key={p} className="w-11 h-11 rounded-full border border-sage-200 flex items-center justify-center font-bold text-sage-600 hover:bg-cream-50">
                    {p}
                  </button>
                ))}
              </div>
              
              <p className="text-sage-400 text-sm mb-6">or use your email for registration</p>

              <div className="space-y-4 text-left">
                <Input icon={User} type="text" placeholder="Name" />
                <Input icon={Mail} type="email" placeholder="Email" />
                <Input icon={Lock} type="password" placeholder="Password" />
              </div>

              <button type="submit" className="btn-primary w-52 py-3.5 mt-10 rounded-full font-semibold tracking-wide">
                SIGN UP
              </button>
            </form>
          </div>

          {/* RIGHT PANEL: Sign In Form (Default visible) */}
          <div className={`w-1/2 h-full bg-white flex items-center justify-center p-16 transition-all duration-700 ease-in-out
                          ${isSignUp ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}`}
          >
            <form className="w-full max-w-sm text-center">
              <h1 className="font-display text-4xl font-semibold text-charcoal-800 mb-8">Sign in</h1>
              
              <div className="flex justify-center gap-3 mb-8">
                {['f', 'G', 'in'].map(p => (
                  <button key={p} className="w-11 h-11 rounded-full border border-sage-200 flex items-center justify-center font-bold text-sage-600 hover:bg-cream-50">
                    {p}
                  </button>
                ))}
              </div>
              
              <p className="text-sage-400 text-sm mb-6">or use your email account</p>

              <div className="space-y-4 text-left">
                <Input icon={Mail} type="email" placeholder="Email" />
                <Input icon={Lock} type="password" placeholder="Password" />
              </div>
              
              <button type="button" className="text-sm text-sage-600 mt-6 hover:text-sage-800">
                Forgot your password?
              </button>

              <button type="submit" className="btn-primary w-52 py-3.5 mt-10 rounded-full font-semibold tracking-wide">
                SIGN IN
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple Helper Component for styled inputs with icons
const Input = ({ icon: Icon, ...props }) => (
  <div className="relative">
    <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={19} />
    <input 
      {...props} 
      className="w-full bg-cream-50/70 border border-cream-100 rounded-xl px-12 py-3.5 text-sm placeholder:text-sage-300 focus:ring-2 focus:ring-brand-100 focus:border-brand-200" 
    />
  </div>
);