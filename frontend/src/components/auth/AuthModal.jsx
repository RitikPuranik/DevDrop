import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail,
  Lock,
  User,
  Phone,
  X,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../../api/auth";
import { toast } from "sonner";

// ─── Google One-Tap / GSI button helper ───────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
let gsiScriptPromise = null;
const SKIP_LOADER_SESSION_KEY = "devdrop_skip_next_loader";

function getBackendOrigin() {
  try {
    return new URL(import.meta.env.VITE_API_URL).origin;
  } catch {
    return null;
  }
}

function getApiErrorMessage(error, fallbackMessage) {
  const responseData = error?.response?.data;
  const firstDetailedError =
    responseData?.errors?.[0]?.message ||
    responseData?.errors?.[0];

  return firstDetailedError || responseData?.message || fallbackMessage;
}

function loadGSI() {
  if (window.google?.accounts) {
    return Promise.resolve();
  }

  if (gsiScriptPromise) {
    return gsiScriptPromise;
  }

  gsiScriptPromise = new Promise((resolve) => {
    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
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

// ─── GitHub SVG Icon ──────────────────────────────────────────────────────────
// lucide-react (this project's icon set) dropped brand/logo glyphs, so this
// uses GitHub's own MIT-licensed Octicons "mark-github" path — inherits the
// button's text color via currentColor, same as any other icon here.
const GithubIcon = (props) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path fillRule="evenodd" clipRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
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
  const [githubLoading, setGithubLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const googleInitializedRef = useRef(false);
  const lastGoogleCredentialRef = useRef(null);
  const githubPopupRef = useRef(null);
  const githubPopupWatcherRef = useRef(null);
  const navigate = useNavigate();

  const [loginData, setLoginData] = useState({ emailOrPhone: "", password: "" });
  const [signupData, setSignupData] = useState({ name: "", phone: "", email: "", password: "" });

  const handleLoginChange = (e) => setLoginData({ ...loginData, [e.target.name]: e.target.value });
  const handleSignupChange = (e) => setSignupData({ ...signupData, [e.target.name]: e.target.value });
  const skipNextPageLoader = () => sessionStorage.setItem(SKIP_LOADER_SESSION_KEY, "true");

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
      skipNextPageLoader();
      onClose();
      if (user.role === "admin") navigate("/admin");
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

    if (!googleInitializedRef.current) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        ux_mode: "popup",
      });
      googleInitializedRef.current = true;
    }

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

  // ── GitHub OAuth (popup + postMessage) ───────────────────────────────────────
  // Mirrors the popup pattern used for the GitHub *integration* connect flow
  // (components/github/PushToGithubModal.jsx) — separate message types
  // ("github-auth-*" vs "github-oauth-*") so the two flows never cross wires.
  const finishGithubSignIn = useCallback((token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    window.dispatchEvent(new Event("auth-changed"));
    toast.success("Signed in with GitHub!");
    skipNextPageLoader();
    onClose();
    if (user.role === "admin") navigate("/admin");
    else navigate("/profile");
  }, [navigate, onClose]);

  useEffect(() => {
    const backendOrigin = getBackendOrigin();

    const handleMessage = (event) => {
      if (backendOrigin && event.origin !== backendOrigin) return;
      const { type, token, user, message } = event.data || {};

      if (type === "github-auth-success") {
        finishGithubSignIn(token, user);
      } else if (type === "github-auth-error") {
        toast.error(message || "GitHub sign-in failed");
      } else {
        return;
      }

      setGithubLoading(false);
      clearInterval(githubPopupWatcherRef.current);
      if (githubPopupRef.current && !githubPopupRef.current.closed) {
        githubPopupRef.current.close();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [finishGithubSignIn]);

  const handleGithubAuth = () => {
    setGithubLoading(true);
    const popup = window.open(authAPI.githubAuthUrl(), "github-login-oauth", "width=600,height=720");
    githubPopupRef.current = popup;

    if (!popup) {
      toast.error("Please allow popups to sign in with GitHub");
      setGithubLoading(false);
      return;
    }

    // Fallback in case the postMessage from the callback page never arrives
    // (e.g. the user closes the popup themselves) — don't leave the button
    // stuck in a loading state forever.
    clearInterval(githubPopupWatcherRef.current);
    githubPopupWatcherRef.current = setInterval(() => {
      if (popup.closed) {
        clearInterval(githubPopupWatcherRef.current);
        setGithubLoading(false);
      }
    }, 800);
  };

  // ── Local login ──────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoginLoading(true);
      const res = await authAPI.login(loginData);
      const { token, user } = res.data.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      window.dispatchEvent(new Event("auth-changed"));
      toast.success("Login successful!");
      skipNextPageLoader();
      onClose();
      if (user.role === "admin") navigate("/admin");
      else navigate("/profile");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Login failed"));
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Local signup ─────────────────────────────────────────────────────────────
  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      setSignupLoading(true);
      const res = await authAPI.register(signupData);
      const { token, user } = res.data.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      window.dispatchEvent(new Event("auth-changed"));
      toast.success("Account created! Please verify your email.");
      setIsSignUp(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Signup failed"));
    } finally {
      setSignupLoading(false);
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
    setLoginLoading(false);
    setSignupLoading(false);
    setGithubLoading(false);
    lastGoogleCredentialRef.current = null;
    clearInterval(githubPopupWatcherRef.current);
    if (githubPopupRef.current && !githubPopupRef.current.closed) {
      githubPopupRef.current.close();
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-500 ${
        isOpen ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl overflow-hidden rounded-[32px] bg-white shadow-2xl dark:bg-neutral-950">
        <button onClick={onClose} className="absolute right-5 top-5 z-20 rounded-full p-2 text-neutral-700 transition hover:bg-black/5 dark:text-white dark:hover:bg-white/10">
          <X size={22} />
        </button>
        <div className="grid min-h-[620px] md:grid-cols-2">
          <div className="flex flex-col justify-center p-8 md:p-12">
            {isForgotPassword ? (
              <form onSubmit={handleForgotPassword} className="mx-auto w-full max-w-sm space-y-5">
                <div><h2 className="text-3xl font-serif">Forgot password</h2><p className="mt-2 text-sm text-neutral-500">Enter your email and we'll send a reset link.</p></div>
                <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18}/><input value={forgotEmail} onChange={(e)=>setForgotEmail(e.target.value)} placeholder="Email" className="w-full rounded-xl border border-neutral-300 py-3 pl-10 pr-4" /></div>
                <button disabled={forgotLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-white">{forgotLoading && <Loader2 className="animate-spin" size={18}/>}Send reset link</button>
                <button type="button" onClick={()=>setIsForgotPassword(false)} className="w-full text-sm text-neutral-500">Back to login</button>
              </form>
            ) : isSignUp ? (
              <form onSubmit={handleSignup} className="mx-auto w-full max-w-sm space-y-4">
                <h2 className="text-3xl font-serif">Create account</h2>
                <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18}/><input name="name" value={signupData.name} onChange={handleSignupChange} placeholder="Name" className="w-full rounded-xl border border-neutral-300 py-3 pl-10 pr-4" required /></div>
                <div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18}/><input name="phone" value={signupData.phone} onChange={handleSignupChange} placeholder="Phone" className="w-full rounded-xl border border-neutral-300 py-3 pl-10 pr-4" required /></div>
                <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18}/><input name="email" value={signupData.email} onChange={handleSignupChange} placeholder="Email" className="w-full rounded-xl border border-neutral-300 py-3 pl-10 pr-4" required type="email" /></div>
                <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18}/><input name="password" value={signupData.password} onChange={handleSignupChange} placeholder="Password" className="w-full rounded-xl border border-neutral-300 py-3 pl-10 pr-4" required type="password" /></div>
                <button disabled={signupLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-white">{signupLoading && <Loader2 className="animate-spin" size={18}/>}Sign up</button>
                <button type="button" onClick={()=>setIsSignUp(false)} className="w-full text-sm text-neutral-500">Already have an account? Log in</button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="mx-auto w-full max-w-sm space-y-5">
                <div><h2 className="text-3xl font-serif">Welcome back</h2><p className="mt-2 text-sm text-neutral-500">Log in to continue.</p></div>
                <div className="space-y-3">
                  <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18}/><input name="emailOrPhone" value={loginData.emailOrPhone} onChange={handleLoginChange} placeholder="Email or phone" className="w-full rounded-xl border border-neutral-300 py-3 pl-10 pr-4" required /></div>
                  <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18}/><input name="password" value={loginData.password} onChange={handleLoginChange} placeholder="Password" className="w-full rounded-xl border border-neutral-300 py-3 pl-10 pr-4" required type="password" /></div>
                </div>
                <div className="flex justify-end"><button type="button" onClick={()=>setIsForgotPassword(true)} className="text-sm text-neutral-500">Forgot password?</button></div>
                <button disabled={loginLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-white">{loginLoading && <Loader2 className="animate-spin" size={18}/>}Log in</button>
                <div className="flex items-center gap-3 text-xs text-neutral-400"><div className="h-px flex-1 bg-neutral-200"/><span>OR</span><div className="h-px flex-1 bg-neutral-200"/></div>
                <div data-google-button className="flex justify-center" />
                <button type="button" onClick={handleGithubAuth} disabled={githubLoading} className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 py-3 text-sm font-medium"><GithubIcon/>{githubLoading ? "Connecting…" : "Continue with GitHub"}</button>
                <button type="button" onClick={()=>setIsSignUp(true)} className="flex w-full items-center justify-center gap-2 text-sm text-neutral-600">Create account <ArrowRight size={16}/></button>
              </form>
            )}
          </div>
          <div className="hidden flex-col items-center justify-center bg-[#9A7F5A] p-12 text-white md:flex">
            <h3 className="font-serif text-4xl">Hello, Friend</h3>
            <p className="mt-4 text-sm text-white/80">Start your journey with us today.</p>
            <button onClick={()=>setIsSignUp((v)=>!v)} className="mt-10 rounded-full border border-white/60 px-10 py-3 text-xs font-semibold uppercase tracking-wider">{isSignUp ? "LOG IN" : "SIGN UP"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
