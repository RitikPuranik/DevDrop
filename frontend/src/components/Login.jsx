import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail,
  Lock,
  User,
  Phone,
  X,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../api/auth";
import { toast } from "sonner";

// ─── Google One-Tap / GSI button helper ───────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function getApiErrorMessage(error, fallbackMessage) {
  const responseData = error?.response?.data;
  const firstDetailedError =
    responseData?.errors?.[0]?.message ||
    responseData?.errors?.[0];

  return firstDetailedError || responseData?.message || fallbackMessage;
}

function loadGSI() {
  return new Promise((resolve) => {
    if (window.google?.accounts) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

// ─── Google SVG Icon ──────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
    <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
    <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
    <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
  </svg>
);

// ─── Main component ───────────────────────────────────────────────────────────
export default function AuthModal({ isOpen, onClose }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const lastGoogleCredentialRef = useRef(null);
  const navigate = useNavigate();

  const [loginData, setLoginData] = useState({ emailOrPhone: "", password: "" });
  const [signupData, setSignupData] = useState({ name: "", phone: "", email: "", password: "" });

  const handleLoginChange = (e) => setLoginData({ ...loginData, [e.target.name]: e.target.value });
  const handleSignupChange = (e) => setSignupData({ ...signupData, [e.target.name]: e.target.value });

  // ── Google callback ──────────────────────────────────────────────────────────
  const handleGoogleCredential = useCallback(async (response) => {
    const credential = response?.credential;
    if (!credential) {
      toast.error("Google sign-in did not return a credential.");
      return;
    }

    // React Strict Mode and repeated popup callbacks can retry the same credential.
    if (lastGoogleCredentialRef.current === credential) return;
    lastGoogleCredentialRef.current = credential;

    try {
      setGoogleLoading(true);
      const res = await authAPI.googleAuth(credential);
      const { token, user } = res.data.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      window.dispatchEvent(new Event("auth-changed"));
      toast.success("Signed in with Google!");
      onClose();
      if (user.role === "admin") navigate("/admin/dashboard");
      else navigate("/profile");
    } catch (err) {
      lastGoogleCredentialRef.current = null;
      toast.error(getApiErrorMessage(err, "Google sign-in failed"));
    } finally {
      setGoogleLoading(false);
    }
  }, [navigate, onClose]);

  // Render Google buttons into every visible auth container.
  const initGoogleButtons = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) return;
    await loadGSI();
    if (!window.google?.accounts) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      ux_mode: "popup",
    });
    const containers = document.querySelectorAll("[data-google-button]");
    containers.forEach((container) => {
      if (container.getClientRects().length === 0) return;
      container.innerHTML = "";
      window.google.accounts.id.renderButton(container, {
        type: "standard",
        shape: "pill",
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: container.offsetWidth || 280,
      });
    });
  }, [handleGoogleCredential]);

  useEffect(() => {
    if (!isOpen || !shouldRender) return;

    // Slight delay so the modal layout is ready before Google measures button width.
    const timer = window.setTimeout(() => {
      initGoogleButtons();
    }, 100);

    return () => window.clearTimeout(timer);
  }, [isOpen, shouldRender, initGoogleButtons]);

  // ── Local login ──────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await authAPI.login(loginData);
      const { token, user } = res.data.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      window.dispatchEvent(new Event("auth-changed"));
      toast.success("Login successful!");
      onClose();
      if (user.role === "admin") navigate("/admin/dashboard");
      else navigate("/profile");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Login failed"));
    }
  };

  // ── Local signup ─────────────────────────────────────────────────────────────
  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      const res = await authAPI.register(signupData);
      const { token, user } = res.data.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      window.dispatchEvent(new Event("auth-changed"));
      toast.success("Account created! Please verify your email.");
      setIsSignUp(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Signup failed"));
    }
  };

  // ── Forgot password ──────────────────────────────────────────────────────────
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    const email = forgotEmail.trim();
    if (!email) { toast.error("Please enter your email address"); return; }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) { toast.error("Please enter a valid email address"); return; }
    try {
      setForgotLoading(true);
      await authAPI.forgotPassword(email);
      toast.success("If this email exists, a reset link has been sent");
      setLoginData((prev) => ({ ...prev, emailOrPhone: email }));
      setIsForgotPassword(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to send reset link"));
    } finally {
      setForgotLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) { setShouldRender(true); setIsForgotPassword(false); return; }
    setIsForgotPassword(false);
    setForgotEmail("");
    setForgotLoading(false);
    lastGoogleCredentialRef.current = null;
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-500 ${
        isOpen ? "opacity-100 backdrop-blur-md" : "opacity-0 pointer-events-none backdrop-blur-0"
      }`}
      onTransitionEnd={() => !isOpen && setShouldRender(false)}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* ═══════════════════════════════════════════════════════════════
          CARD — desktop: side-by-side flip panel, mobile: single column
          ═══════════════════════════════════════════════════════════════ */}
      <div
        className={`relative overflow-hidden w-full max-w-[800px] bg-[#F5F2ED] rounded-[2rem] sm:rounded-[3rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-700 ease-out transform ${
          isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-8"
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-[110] p-2 hover:bg-[#EAE3D8] rounded-full text-[#8b7355] transition-all hover:rotate-90"
        >
          <X size={22} />
        </button>

        {/* ── MOBILE LAYOUT (< sm) ───────────────────────────────────── */}
        <div className="sm:hidden flex flex-col min-h-[500px]">
          {/* Tab switcher */}
          <div className="flex bg-[#8b7355] rounded-t-[2rem]">
            <button
              type="button"
              onClick={() => { setIsSignUp(false); setIsForgotPassword(false); }}
              className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all ${
                !isSignUp ? "text-[#F5F2ED]" : "text-white/50 hover:text-white/75"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => { setIsSignUp(true); setIsForgotPassword(false); }}
              className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all ${
                isSignUp ? "text-[#F5F2ED]" : "text-white/50 hover:text-white/75"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Mobile form */}
          <div className="flex flex-col items-center px-7 pt-6 pb-8">
            {isSignUp ? (
              <>
                <h2 className="text-3xl font-serif font-bold text-[#3d342b] mb-1">Create Account</h2>
                <p className="text-[#8b7355] text-sm mb-5">Join DevDrop today</p>

                <div data-google-button className="w-full mb-4 flex justify-center" />
                <Divider />

                <form className="w-full" onSubmit={handleSignup}>
                  <AuthInput icon={User} type="text" placeholder="Full Name" name="name" value={signupData.name} onChange={handleSignupChange} />
                  <AuthInput icon={Phone} type="text" placeholder="Phone Number (optional)" name="phone" value={signupData.phone} onChange={handleSignupChange} />
                  <AuthInput icon={Mail} type="email" placeholder="Email" name="email" value={signupData.email} onChange={handleSignupChange} />
                  <AuthInput icon={Lock} type="password" placeholder="Password" name="password" value={signupData.password} onChange={handleSignupChange} />
                  <SubmitBtn label="Sign Up" />
                </form>
              </>
            ) : isForgotPassword ? (
              <>
                <h2 className="text-3xl font-serif font-bold text-[#3d342b] mb-2">Reset Password</h2>
                <p className="text-[#8b7355] mb-6 text-sm leading-relaxed text-center">
                  Enter the email linked to your account and we'll send you a reset link.
                </p>
                <form className="w-full" onSubmit={handleForgotPassword}>
                  <AuthInput icon={Mail} type="email" placeholder="Email" name="forgotEmail" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                  <SubmitBtn label={forgotLoading ? "Sending…" : "Send Reset Link"} disabled={forgotLoading} />
                </form>
                <button type="button" onClick={() => setIsForgotPassword(false)} className="text-xs text-[#8b7355] mt-4 hover:text-[#3d342b] underline underline-offset-4 transition-colors">
                  Back to login
                </button>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-serif font-bold text-[#3d342b] mb-1">Welcome</h2>
                <p className="text-[#8b7355] text-sm mb-5">Please enter your credentials</p>

                <div data-google-button className="w-full mb-4 flex justify-center" />
                <Divider />

                <form className="w-full" onSubmit={handleLogin}>
                  <AuthInput icon={Mail} type="text" placeholder="Email or Phone" name="emailOrPhone" value={loginData.emailOrPhone} onChange={handleLoginChange} />
                  <AuthInput icon={Lock} type="password" placeholder="Password" name="password" value={loginData.password} onChange={handleLoginChange} />
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(loginData.emailOrPhone.includes("@") ? loginData.emailOrPhone : ""); setIsForgotPassword(true); }}
                    className="text-xs text-[#8b7355] mb-4 hover:text-[#3d342b] underline underline-offset-4 transition-colors"
                  >
                    Forgot your password?
                  </button>
                  <SubmitBtn label="Login" />
                </form>
              </>
            )}
          </div>
        </div>

        {/* ── DESKTOP LAYOUT (≥ sm) ──────────────────────────────────── */}
        <div className="hidden sm:block relative min-h-[550px]">

          {/* SIGN UP FORM */}
          <div
            className={`absolute top-0 h-full w-1/2 transition-all duration-700 ease-in-out left-0 opacity-0 z-[1]
            ${isSignUp ? "translate-x-full opacity-100 z-[5] delay-[100ms]" : ""}`}
          >
            <form className="flex flex-col items-center justify-center h-full px-12 text-center" onSubmit={handleSignup}>
              <h2 className="mt-5 text-4xl font-serif font-bold text-[#3d342b] mb-1">Create Account</h2>
              <p className="text-[#8b7355] text-sm mb-4">Join DevDrop today</p>

              {/* Google button */}
              <div data-google-button className="w-full mb-3 flex justify-center" />
              <Divider />

              <AuthInput icon={User} type="text" placeholder="Full Name" name="name" value={signupData.name} onChange={handleSignupChange} />
              <AuthInput icon={Phone} type="text" placeholder="Phone Number (optional)" name="phone" value={signupData.phone} onChange={handleSignupChange} />
              <AuthInput icon={Mail} type="email" placeholder="Email" name="email" value={signupData.email} onChange={handleSignupChange} />
              <AuthInput icon={Lock} type="password" placeholder="Password" name="password" value={signupData.password} onChange={handleSignupChange} />
              <SubmitBtn label="Sign Up" />
            </form>
          </div>

          {/* LOGIN FORM */}
          <div
            className={`absolute top-0 h-full w-1/2 transition-all duration-700 ease-in-out left-0 z-[2]
            ${isSignUp ? "translate-x-full opacity-0" : "opacity-100"}`}
          >
            {isForgotPassword ? (
              <form className="flex flex-col items-center justify-center h-full px-12 text-center" onSubmit={handleForgotPassword}>
                <h2 className="text-4xl font-serif font-bold text-[#3d342b] mb-2">Reset Password</h2>
                <p className="text-[#8b7355] mb-8 text-sm leading-relaxed">
                  Enter the email linked to your account and we'll send you a reset link.
                </p>
                <AuthInput icon={Mail} type="email" placeholder="Email" name="forgotEmail" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                <SubmitBtn label={forgotLoading ? "Sending…" : "Send Reset Link"} disabled={forgotLoading} extraClass="mt-4" />
                <button type="button" onClick={() => setIsForgotPassword(false)} className="text-xs text-[#8b7355] mt-5 hover:text-[#3d342b] underline underline-offset-4 transition-colors">
                  Back to login
                </button>
              </form>
            ) : (
              <form className="flex flex-col items-center justify-center h-full px-12 text-center" onSubmit={handleLogin}>
                <h2 className="text-4xl font-serif font-bold text-[#3d342b] mb-1">Welcome</h2>
                <p className="text-[#8b7355] mb-4 text-sm">Please enter your credentials</p>

                {/* Google button */}
                <div data-google-button className="w-full mb-3 flex justify-center" />
                <Divider />

                <AuthInput icon={Mail} type="text" placeholder="Email or Phone" name="emailOrPhone" value={loginData.emailOrPhone} onChange={handleLoginChange} />
                <AuthInput icon={Lock} type="password" placeholder="Password" name="password" value={loginData.password} onChange={handleLoginChange} />

                <button
                  type="button"
                  onClick={() => { setForgotEmail(loginData.emailOrPhone.includes("@") ? loginData.emailOrPhone : ""); setIsForgotPassword(true); }}
                  className="text-xs text-[#8b7355] mt-4 hover:text-[#3d342b] underline underline-offset-4 transition-colors"
                >
                  Forgot your password?
                </button>

                <SubmitBtn label="Login" extraClass="mt-8" />
              </form>
            )}
          </div>

          {/* OVERLAY PANEL */}
          <div
            className={`absolute top-0 left-1/2 w-1/2 h-full overflow-hidden transition-all duration-700 ease-in-out z-[100]
            ${isSignUp ? "-translate-x-full rounded-r-[80px]" : "rounded-l-[80px]"}`}
          >
            <div
              className={`relative -left-full h-full w-[200%] bg-[#8b7355] transition-all duration-700 ease-in-out
              ${isSignUp ? "translate-x-1/2" : "translate-x-0"}`}
            >
              <div className="flex h-full w-full text-[#F5F2ED]">
                <div className="flex flex-col items-center justify-center w-1/2 px-12 text-center">
                  <h2 className="text-3xl font-serif font-bold mb-4">One of us?</h2>
                  <p className="text-white/80 text-sm mb-10 leading-relaxed font-light">If you already have an account, just sign in.</p>
                  <button type="button" onClick={() => { setIsSignUp(false); setIsForgotPassword(false); }}
                    className="px-12 py-3 border border-white/40 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-[#F5F2ED] hover:text-[#8b7355] transition-all">
                    Login
                  </button>
                </div>
                <div className="flex flex-col items-center justify-center w-1/2 px-12 text-center">
                  <h2 className="text-3xl font-serif font-bold mb-4">Hello, Friend</h2>
                  <p className="text-white/80 text-sm mb-10 leading-relaxed font-light">Start your journey with us today.</p>
                  <button type="button" onClick={() => { setIsSignUp(true); setIsForgotPassword(false); }}
                    className="px-12 py-3 border border-white/40 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-[#F5F2ED] hover:text-[#8b7355] transition-all">
                    Sign Up
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small shared components ──────────────────────────────────────────────────

const Divider = () => (
  <div className="flex items-center gap-3 w-full mb-4">
    <div className="flex-1 h-px bg-[#8b7355]/20" />
    <span className="text-[10px] text-[#8b7355]/50 uppercase tracking-widest font-medium">or</span>
    <div className="flex-1 h-px bg-[#8b7355]/20" />
  </div>
);

const SubmitBtn = ({ label, disabled, extraClass = "" }) => (
  <button
    type="submit"
    disabled={disabled}
    className={`group w-full py-4 bg-[#8b7355] text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-[#725e46] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${extraClass}`}
  >
    {label}
    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
  </button>
);

const AuthInput = ({ icon: Icon, ...props }) => (
  <div className="relative w-full mb-4 group">
    <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8b7355]/50 group-focus-within:text-[#8b7355]" size={18} />
    <input
      {...props}
      className="w-full pl-12 pr-4 py-4 bg-[#EAE3D8]/50 border-2 border-transparent rounded-2xl text-sm outline-none focus:bg-white focus:border-[#8b7355]/30 transition-all placeholder:text-[#8b7355]/40 text-[#3d342b]"
    />
  </div>
);
