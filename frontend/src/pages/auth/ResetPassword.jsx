import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import { toast } from "sonner";
import { authAPI } from "../../api/auth";

const REDIRECT_SECONDS = 4;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (!success) return;

    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          navigate("/", { replace: true });
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [success, navigate]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      toast.error("Reset token is missing from this link");
      return;
    }

    if (!formData.password || !formData.confirmPassword) {
      toast.error("Please fill in both password fields");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setSubmitting(true);
      const res = await authAPI.resetPassword(token, formData.password);
      toast.success(res.data?.message || "Password reset successful");
      setSuccess(true);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  const hasToken = Boolean(token);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.10),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.05),_transparent_32%)]" />

      <div className="relative w-full max-w-md rounded-[36px] border border-white/10 bg-white/[0.04] p-8 md:p-10 backdrop-blur-2xl shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
        <div className="mb-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#f97316] font-bold mb-3">
            Dev Drop Security
          </p>
          <h1 className="text-4xl font-black tracking-tight mb-3">
            Reset Password
          </h1>
          <p className="text-sm text-white/50 leading-relaxed">
            {hasToken
              ? "Choose a new password for your account."
              : "This reset link is incomplete or has expired."}
          </p>
        </div>

        {success ? (
          <div className="space-y-5">
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <p className="text-sm font-semibold text-emerald-300">
                Your password has been updated.
              </p>
              <p className="text-xs text-emerald-200/70 mt-2">
                Redirecting you to the home page in {countdown}s.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="w-full rounded-2xl bg-white text-black py-4 text-xs font-black uppercase tracking-[0.2em] hover:bg-[#f4f4f4] transition-colors"
            >
              Go To Home
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordField
              name="password"
              placeholder="New password"
              value={formData.password}
              onChange={handleChange}
              disabled={!hasToken || submitting}
            />
            <PasswordField
              name="confirmPassword"
              placeholder="Confirm new password"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={!hasToken || submitting}
            />

            <button
              type="submit"
              disabled={!hasToken || submitting}
              className="group w-full rounded-2xl bg-[#f97316] text-white py-4 text-xs font-black uppercase tracking-[0.2em] hover:bg-[#ea580c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? "Updating..." : "Update Password"}
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="w-full text-xs text-white/55 hover:text-white underline underline-offset-4 transition-colors"
            >
              Back to home
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PasswordField({ name, placeholder, value, onChange, disabled }) {
  return (
    <div className="relative">
      <Lock
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35"
        size={18}
      />
      <input
        type="password"
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-12 pr-4 py-4 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#f97316]/50 transition-colors disabled:opacity-50"
      />
    </div>
  );
}
