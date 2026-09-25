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
    const renderedWidths = new WeakMap();

    // ResizeObserver reports the already-calculated layout size asynchronously.
    // This avoids getClientRects()/offsetWidth reads that can force synchronous
    // reflow after Google has modified another button container.
    const renderContainer = (container, width) => {
      const buttonWidth = Math.min(400, Math.max(200, Math.round(width)));
      if (renderedWidths.get(container) === buttonWidth) return;

      renderedWidths.set(container, buttonWidth);
      container.innerHTML = "";

      window.google.accounts.id.renderButton(container, {
        type: "standard",
        shape: "pill",
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: buttonWidth,
      });
    };

    const observer = new ResizeObserver((entries) => {
      entries.forEach(({ target, contentRect }) => {
        if (contentRect.width > 0) {
          renderContainer(target, contentRect.width);
        }
      });
    });

    containers.forEach((container) => observer.observe(container));
    return observer;
  }, [handleGoogleCredential]);

  useEffect(() => {
    if (!isOpen || !shouldRender) return;

    // Slight delay so the modal layout is ready before Google renders the button.
    let observer = null;
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      const nextObserver = await initGoogleButtons();
      if (cancelled) {
        nextObserver?.disconnect();
      } else {
        observer = nextObserver;
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer?.disconnect();
    };
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

    const completeFromStorage = () => {
      const token = localStorage.getItem("token");
      const storedUser = localStorage.getItem("user");
      if (!token || !storedUser) return false;

      try {
        const user = JSON.parse(storedUser);
        if (!user?.id && !user?._id) return false;
        localStorage.removeItem("devdrop_github_auth_complete");
        finishGithubSignIn(token, user);
        return true;
      } catch {
        return false;
      }
    };

    const handleStorage = (event) => {
      if (event.key === "devdrop_github_auth_complete" && event.newValue) {
        completeFromStorage();
        return;
      }

      // The callback page is on the frontend origin, so its token/user writes
      // also generate storage events in this tab. Treat them as a fallback
      // completion signal in case the dedicated marker was missed.
      if ((event.key === "token" || event.key === "user") && event.newValue) {
        completeFromStorage();
        return;
      }

      if (event.key === "devdrop_github_auth_error" && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue);
          toast.error(payload?.message || "GitHub sign-in failed");
        } catch {
          toast.error("GitHub sign-in failed");
        }
        setGithubLoading(false);
        clearInterval(githubPopupWatcherRef.current);
      }
    };

    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (githubPopupRef.current && event.source !== githubPopupRef.current) return;
      const { type, token, user, message } = event.data || {};

      if (type === "github-auth-success" && token && user) {
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
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
    };
  }, [finishGithubSignIn, isOpen]);

  const handleGithubAuth = () => {
    try {
      localStorage.removeItem("devdrop_github_auth_complete");
      localStorage.removeItem("devdrop_github_auth_error");
    } catch {}
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

                <div className="w-full flex flex-col gap-2.5 mb-4">
                  <div data-google-button className="w-full flex justify-center" />
                  <GithubAuthButton loading={githubLoading} disabled={githubLoading || googleLoading} onClick={handleGithubAuth} />
                </div>
                <Divider />

                <form className="w-full" onSubmit={handleSignup}>
                  <AuthInput icon={User} type="text" placeholder="Full Name" name="name" value={signupData.name} onChange={handleSignupChange} />
                  <AuthInput icon={Phone} type="text" placeholder="Phone Number (optional)" name="phone" value={signupData.phone} onChange={handleSignupChange} />
                  <AuthInput icon={Mail} type="email" placeholder="Email" name="email" value={signupData.email} onChange={handleSignupChange} />
                  <AuthInput icon={Lock} type="password" placeholder="Password" name="password" value={signupData.password} onChange={handleSignupChange} />
                  <SubmitBtn label={signupLoading ? "Signing Up..." : "Sign Up"} disabled={signupLoading || googleLoading || githubLoading} />
                </form>
              </>
            ) : isForgotPassword ? (
              <>
                <h2 className="text-3xl font-serif font-bold text-[#3d342b] mb-2">Reset Password</h2>
                <p className="text-[#8b7355] mb-6 text-sm leading-relaxed text-center">
                  Enter the email linked to your account and we&apos;ll send you a reset link.
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

                <div className="w-full flex flex-col gap-2.5 mb-4">
                  <div data-google-button className="w-full flex justify-center" />
                  <GithubAuthButton loading={githubLoading} disabled={githubLoading || googleLoading} onClick={handleGithubAuth} />
                </div>
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
                  <SubmitBtn label={loginLoading ? "Logging In..." : "Login"} disabled={loginLoading || googleLoading || githubLoading} />
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

              {/* Google + GitHub buttons */}
              <div className="w-full flex flex-col gap-2.5 mb-3">
                <div data-google-button className="w-full flex justify-center" />
                <GithubAuthButton loading={githubLoading} disabled={githubLoading || googleLoading} onClick={handleGithubAuth} />
              </div>
              <Divider />

              <AuthInput icon={User} type="text" placeholder="Full Name" name="name" value={signupData.name} onChange={handleSignupChange} />
              <AuthInput icon={Phone} type="text" placeholder="Phone Number (optional)" name="phone" value={signupData.phone} onChange={handleSignupChange} />
              <AuthInput icon={Mail} type="email" placeholder="Email" name="email" value={signupData.email} onChange={handleSignupChange} />
              <AuthInput icon={Lock} type="password" placeholder="Password" name="password" value={signupData.password} onChange={handleSignupChange} />
              <SubmitBtn label={signupLoading ? "Signing Up..." : "Sign Up"} disabled={signupLoading || googleLoading || githubLoading} />
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
                  Enter the email linked to your account and we&apos;ll send you a reset link.
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

                {/* Google + GitHub buttons */}
                <div className="w-full flex flex-col gap-2.5 mb-3">
                  <div data-google-button className="w-full flex justify-center" />
                  <GithubAuthButton loading={githubLoading} disabled={githubLoading || googleLoading} onClick={handleGithubAuth} />
                </div>
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

                <SubmitBtn label={loginLoading ? "Logging In..." : "Login"} disabled={loginLoading || googleLoading || githubLoading} extraClass="mt-8" />
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

const GithubAuthButton = ({ loading, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label="Continue with GitHub"
    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-[#8b7355]/20 bg-white text-[#3d342b] text-xs font-bold uppercase tracking-widest hover:bg-[#EAE3D8]/50 hover:border-[#8b7355]/30 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
  >
    {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <GithubIcon aria-hidden="true" />}
    {loading ? "Connecting…" : "Continue with GitHub"}
  </button>
);

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
