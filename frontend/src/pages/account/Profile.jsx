import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, LogOut, Camera, X, CheckCircle, AlertCircle,
  Mail, User as UserIcon, Palette, LayoutGrid, ChevronRight, Check, ShieldAlert,
} from 'lucide-react';
import { userAPI } from '../../api/user';
import { authAPI } from '../../api/auth';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAccentTheme } from '../../hooks/useAccentTheme';

export default function Profile() {
  const navigate = useNavigate();
  const { themeId, setTheme, cssVars, themes } = useAccentTheme();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/'); return; }
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await userAPI.getProfile();
      const profileData = res.data?.data;
      const user = profileData?.user ? { ...profileData.user, hasBankDetails: profileData.hasBankDetails } : profileData;
      setProfile(user);
      setName(user?.name || '');
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth-changed'));
        toast.error('Your session expired. Please login again.');
        navigate('/', { replace: true });
        return;
      }
      toast.error(err.response?.data?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const nameChanged = name.trim() !== '' && name.trim() !== (profile?.name || '');

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!nameChanged) return;
    try {
      setSavingName(true);
      await userAPI.updateProfile({ name: name.trim() });
      setProfile((prev) => ({ ...prev, name: name.trim() }));
      // Keep the locally-cached user (used by Navbar etc.) in sync
      try {
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...stored, name: name.trim() }));
        window.dispatchEvent(new Event('auth-changed'));
      } catch { /* ignore cache sync errors */ }
      toast.success('Name updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleSendVerification = async () => {
    try {
      setSendingVerification(true);
      await authAPI.sendVerification();
      toast.success('Verification email sent — check your inbox');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send verification email');
    } finally {
      setSendingVerification(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
    window.location.reload();
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Please upload a JPG, PNG, or WebP image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    try {
      setAvatarUploading(true);
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await userAPI.updateAvatar(formData);
      const newAvatarUrl = res.data?.data?.avatar;
      if (newAvatarUrl) {
        setProfile((prev) => ({ ...prev, avatar: newAvatarUrl }));
      }
      toast.success('Profile picture updated!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload profile picture');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleAvatarRemove = async () => {
    try {
      setAvatarUploading(true);
      await userAPI.removeAvatar();
      setProfile((prev) => ({ ...prev, avatar: null }));
      toast.success('Profile picture removed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove profile picture');
    } finally {
      setAvatarUploading(false);
    }
  };

  if (loading) {
    return (
      <div style={cssVars} className="ui-surface min-h-screen bg-[#08090a] flex items-center justify-center">
        <Loader2 className="animate-spin text-[var(--accent)]" size={36} />
      </div>
    );
  }

  return (
    <div style={cssVars} className="ui-surface min-h-screen bg-[#08090a] text-[#e7e9ea] pt-28 pb-20 px-6 antialiased">
      <div className="max-w-2xl mx-auto">

        {/* ── HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <p className="text-[13px] text-white/40 font-medium mb-2">Account</p>
          <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-white">{profile?.name || 'Your Profile'}</h1>
          <p className="text-white/50 text-[15px] mt-2">Manage your profile, verification, and appearance.</p>
        </motion.div>

        {/* ── GO TO WORKSPACE ── */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          onClick={() => navigate('/workspace')}
          className="w-full flex items-center gap-4 rounded-xl border border-white/[0.1] bg-[#0e0f10] p-5 mb-6 text-left hover:border-white/[0.2] transition-all group"
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--accent-soft)' }}>
            <LayoutGrid size={18} className="text-[var(--accent)]" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white text-[14px]">Go to workspace</p>
            <p className="text-white/50 text-[13px] mt-0.5">Listings, purchases, deployments, wishlist &amp; payouts</p>
          </div>
          <ChevronRight size={18} className="text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </motion.button>

        {/* ── PROFILE CARD ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="rounded-xl border border-white/[0.08] bg-[#0e0f10] p-6 md:p-8 mb-6 shadow-lg shadow-black/20"
        >
          <h2 className="text-[15px] font-semibold text-white mb-6 flex items-center gap-2">
            <UserIcon size={15} className="text-[var(--accent)]" /> Profile
          </h2>

          <div className="flex items-center gap-5 mb-8">
            {/* ── INTERACTIVE AVATAR ── */}
            <div className="relative group shrink-0">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />

              <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-[var(--accent-soft)] ring-offset-4 ring-offset-[#0e0f10]">
                {avatarUploading ? (
                  <div className="w-full h-full bg-[var(--accent)] flex items-center justify-center">
                    <Loader2 className="animate-spin text-white" size={22} />
                  </div>
                ) : profile?.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile?.name || 'User'}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                  />
                ) : null}
                <div
                  className="w-full h-full flex items-center justify-center text-2xl font-bold text-black"
                  style={{ display: (!avatarUploading && !profile?.avatar) ? 'flex' : 'none', backgroundColor: 'var(--accent)' }}
                >
                  {profile?.name?.[0]?.toUpperCase() || 'U'}
                </div>
              </div>

              {!avatarUploading && (
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/55 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Change profile picture"
                >
                  <Camera size={16} className="text-white" />
                </div>
              )}

              {profile?.avatar && !avatarUploading && (
                <button
                  onClick={handleAvatarRemove}
                  className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400 shadow-lg z-10"
                  title="Remove profile picture"
                >
                  <X size={12} className="text-white" />
                </button>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-white/60 text-[13px] font-medium mb-1">Profile photo</p>
              <p className="text-white/40 text-[12px] leading-relaxed">JPG, PNG or WebP.<br className="hidden sm:block" /> Max 5MB.</p>
            </div>
          </div>

          {/* ── NAME ── */}
          <form onSubmit={handleSaveName} className="mb-6">
            <label className="text-[13px] text-white/60 font-medium block mb-2">Display name</label>
            <div className="flex items-center gap-3 rounded-lg border border-white/[0.1] bg-black/25 px-4 py-3 transition-colors focus-within:border-[var(--accent)]/60">
              <input
                className="flex-1 bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-white/30"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
              <button
                type="submit"
                disabled={!nameChanged || savingName}
                className="shrink-0 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[13px] font-semibold hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {savingName ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Save
              </button>
            </div>
          </form>

          {/* ── EMAIL ── */}
          <div>
            <label className="text-[13px] text-white/60 font-medium block mb-2">Email address</label>
            <div className="flex items-center gap-3 rounded-lg border border-white/[0.1] bg-black/25 px-4 py-3">
              <Mail size={16} className="text-white/40 shrink-0" />
              <span className="flex-1 text-[14px] text-white/85 truncate">{profile?.email}</span>
              {profile?.isVerified ? (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#cbb392]/15 border border-[#cbb392]/20 text-[#cbb392] text-[11px] font-semibold">
                  <CheckCircle size={11} /> Verified
                </span>
              ) : (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#a6603f]/15 border border-[#a6603f]/20 text-[#d8b899] text-[11px] font-semibold">
                  <AlertCircle size={11} /> Unverified
                </span>
              )}
            </div>

            {!profile?.isVerified && (
              <div className="mt-3 rounded-lg border border-[#a6603f]/20 bg-[#a6603f]/10 p-4 flex items-start gap-3">
                <ShieldAlert size={16} className="text-[#d8b899] mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[#d8b899]/85 text-[13px] leading-relaxed">Verify your email to unlock selling and other account features.</p>
                  <button
                    onClick={handleSendVerification}
                    disabled={sendingVerification}
                    className="mt-3 px-4 py-2 rounded-lg bg-[#a6603f] text-black text-[13px] font-semibold hover:bg-[#a6603f] transition-colors disabled:opacity-60"
                  >
                    {sendingVerification ? 'Sending…' : 'Send verification email'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* ── THEME ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.09 }}
          className="rounded-xl border border-white/[0.08] bg-[#0e0f10] p-6 md:p-8 mb-6 shadow-lg shadow-black/20"
        >
          <h2 className="text-[15px] font-semibold text-white mb-1.5 flex items-center gap-2">
            <Palette size={15} className="text-[var(--accent)]" /> Appearance
          </h2>
          <p className="text-white/50 text-[13px] mb-5">Choose an accent color for your Profile &amp; Workspace.</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {themes.map((t) => {
              const isActive = t.id === themeId;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`relative flex flex-col items-center gap-2.5 rounded-lg border p-4 transition-all ${
                    isActive ? 'border-white/25 bg-white/[0.04]' : 'border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  <span
                    className="w-8 h-8 rounded-full shadow-inner flex items-center justify-center"
                    style={{ backgroundColor: t.accent }}
                  >
                    {isActive && <Check size={14} className="text-white" />}
                  </span>
                  <span className="text-[13px] font-semibold text-white/80">{t.label}</span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* ── LOGOUT ── */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-white/[0.04] border border-white/[0.12] rounded-lg text-[14px] font-semibold text-white/75 hover:text-white hover:bg-white/[0.08] hover:border-white/20 transition-all"
        >
          <LogOut size={15} /> Log out
        </motion.button>
      </div>
    </div>
  );
}
