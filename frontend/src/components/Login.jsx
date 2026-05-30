import React, { useState, useEffect } from "react";
import {
  Mail,
  Lock,
  User,
  Phone,
  X,
  Code2,
  Globe,
  Share2,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../api/auth";
import { toast } from "sonner";

export default function AuthModal({ isOpen, onClose }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();

  const [loginData, setLoginData] = useState({
    emailOrPhone: "",
    password: "",
  });

  const [signupData, setSignupData] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
  });

  const handleLoginChange = (e) => {
    setLoginData({ ...loginData, [e.target.name]: e.target.value });
  };

  const handleSignupChange = (e) => {
    setSignupData({ ...signupData, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const res = await authAPI.login(loginData);
      const { token, user } = res.data.data;

      // ✅ Persist both token AND user (role lives here)
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      window.dispatchEvent(new Event("auth-changed"));

      toast.success("Login successful!");
      onClose();

      // ✅ Role-based redirect
      if (user.role === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/profile");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();

    try {
      const res = await authAPI.register(signupData);
      const { token, user } = res.data.data;

      // ✅ Persist after signup too
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      window.dispatchEvent(new Event("auth-changed"));

      toast.success("Account created! Please verify your email.");
      setIsSignUp(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "Signup failed");
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();

    const email = forgotEmail.trim();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    try {
      setForgotLoading(true);
      await authAPI.forgotPassword(email);
      toast.success("If this email exists, a reset link has been sent");
      setLoginData((prev) => ({ ...prev, emailOrPhone: email }));
      setIsForgotPassword(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send reset link");
    } finally {
      setForgotLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsForgotPassword(false);
      return;
    }

    setIsForgotPassword(false);
    setForgotEmail("");
    setForgotLoading(false);
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-500 ${
        isOpen
          ? "opacity-100 backdrop-blur-md"
          : "opacity-0 pointer-events-none backdrop-blur-0"
      }`}
      onTransitionEnd={() => !isOpen && setShouldRender(false)}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className={`relative overflow-hidden w-[800px] max-w-full min-h-[550px] bg-[#F5F2ED] rounded-[3rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-700 ease-out transform ${
          isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-8"
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 z-[110] p-2 hover:bg-[#EAE3D8] rounded-full text-[#8b7355] transition-all hover:rotate-90"
        >
          <X size={24} />
        </button>

        {/* SIGN UP FORM */}
        <div
          className={`absolute top-0 h-full w-1/2 transition-all duration-700 ease-in-out left-0 opacity-0 z-[1]
          ${isSignUp ? "translate-x-full opacity-100 z-[5] delay-[100ms]" : ""}`}
        >
          <form
            className="flex flex-col items-center justify-center h-full px-12 text-center"
            onSubmit={handleSignup}
          >
            <h2 className="mt-5 text-4xl font-serif font-bold text-[#3d342b] mb-2">
              Create Account
            </h2>

            <div className="mt-2 flex gap-3 mb-6">
              <SocialIcon Icon={Globe} />
              <SocialIcon Icon={Code2} />
              <SocialIcon Icon={Share2} />
            </div>

            <AuthInput
              icon={User}
              type="text"
              placeholder="Full Name"
              name="name"
              value={signupData.name}
              onChange={handleSignupChange}
            />
            <AuthInput
              icon={Phone}
              type="text"
              placeholder="Phone Number"
              name="phone"
              value={signupData.phone}
              onChange={handleSignupChange}
            />
            <AuthInput
              icon={Mail}
              type="email"
              placeholder="Email"
              name="email"
              value={signupData.email}
              onChange={handleSignupChange}
            />
            <AuthInput
              icon={Lock}
              type="password"
              placeholder="Password"
              name="password"
              value={signupData.password}
              onChange={handleSignupChange}
            />

            <button
              type="submit"
              className="group w-full py-4 bg-[#8b7355] text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-[#725e46] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              Sign Up
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </div>

        {/* LOGIN FORM */}
        <div
          className={`absolute top-0 h-full w-1/2 transition-all duration-700 ease-in-out left-0 z-[2]
          ${isSignUp ? "translate-x-full opacity-0" : "opacity-100"}`}
        >
          {isForgotPassword ? (
            <form
              className="flex flex-col items-center justify-center h-full px-12 text-center"
              onSubmit={handleForgotPassword}
            >
              <h2 className="text-4xl font-serif font-bold text-[#3d342b] mb-2">
                Reset Password
              </h2>

              <p className="text-[#8b7355] mb-8 text-sm leading-relaxed">
                Enter the email linked to your account and we&apos;ll send you a reset link.
              </p>

              <AuthInput
                icon={Mail}
                type="email"
                placeholder="Email"
                name="forgotEmail"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />

              <button
                type="submit"
                disabled={forgotLoading}
                className="group mt-4 w-full py-4 bg-[#8b7355] text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-[#725e46] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {forgotLoading ? "Sending..." : "Send Reset Link"}
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => setIsForgotPassword(false)}
                className="text-xs text-[#8b7355] mt-5 hover:text-[#3d342b] underline underline-offset-4 transition-colors"
              >
                Back to login
              </button>
            </form>
          ) : (
            <form
              className="flex flex-col items-center justify-center h-full px-12 text-center"
              onSubmit={handleLogin}
            >
              <h2 className="text-4xl font-serif font-bold text-[#3d342b] mb-2">
                Welcome
              </h2>

              <p className="text-[#8b7355] mb-6 text-sm">
                Please enter your credentials
              </p>

              <div className="flex gap-3 mb-6">
                <SocialIcon Icon={Globe} />
                <SocialIcon Icon={Code2} />
                <SocialIcon Icon={Share2} />
              </div>

              {/* ✅ name="emailOrPhone" matches loginData key and backend field */}
              <AuthInput
                icon={Mail}
                type="text"
                placeholder="Email or Phone"
                name="emailOrPhone"
                value={loginData.emailOrPhone}
                onChange={handleLoginChange}
              />
              <AuthInput
                icon={Lock}
                type="password"
                placeholder="Password"
                name="password"
                value={loginData.password}
                onChange={handleLoginChange}
              />

              <button
                type="button"
                onClick={() => {
                  setForgotEmail(loginData.emailOrPhone.includes("@") ? loginData.emailOrPhone : "");
                  setIsForgotPassword(true);
                }}
                className="text-xs text-[#8b7355] mt-4 hover:text-[#3d342b] underline underline-offset-4 transition-colors"
              >
                Forgot your password?
              </button>

              <button
                type="submit"
                className="group mt-8 w-full py-4 bg-[#8b7355] text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-[#725e46] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                Login
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
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
                <p className="text-white/80 text-sm mb-10 leading-relaxed font-light">
                  If you already have an account, just sign in.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setIsForgotPassword(false);
                  }}
                  className="px-12 py-3 border border-white/40 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-[#F5F2ED] hover:text-[#8b7355] transition-all"
                >
                  Login
                </button>
              </div>

              <div className="flex flex-col items-center justify-center w-1/2 px-12 text-center">
                <h2 className="text-3xl font-serif font-bold mb-4">Hello, Friend</h2>
                <p className="text-white/80 text-sm mb-10 leading-relaxed font-light">
                  Start your journey with us today.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setIsForgotPassword(false);
                  }}
                  className="px-12 py-3 border border-white/40 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-[#F5F2ED] hover:text-[#8b7355] transition-all"
                >
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

const SocialIcon = ({ Icon }) => (
  <button
    type="button"
    className="w-12 h-12 flex items-center justify-center border border-[#8b7355]/20 rounded-2xl text-[#8b7355] hover:bg-white hover:border-[#8b7355] transition-all shadow-sm"
  >
    <Icon size={18} />
  </button>
);

const AuthInput = ({ icon: Icon, ...props }) => (
  <div className="relative w-full mb-4 group">
    <Icon
      className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8b7355]/50 group-focus-within:text-[#8b7355]"
      size={18}
    />
    <input
      {...props}
      className="w-full pl-12 pr-4 py-4 bg-[#EAE3D8]/50 border-2 border-transparent rounded-2xl text-sm outline-none focus:bg-white focus:border-[#8b7355]/30 transition-all placeholder:text-[#8b7355]/40 text-[#3d342b]"
    />
  </div>
);
