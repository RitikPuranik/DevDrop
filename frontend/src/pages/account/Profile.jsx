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
      <div style={cssVars} className="ws min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#cbb392]" size={36} />
      </div>
    );
  }

  const card = 'rounded-2xl border border-white/[0.08] bg-white/[0.03]';
  const fieldBox = 'flex items-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.03] px-4 py-3.5 transition-colors';

  return (
    <div style={cssVars} className="ws min-h-screen pt-28 pb-20 px-5 md:px-8">
      <div className="max-w-5xl mx-auto">

        {/* ── HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-10 pb-8 border-b border-white/[0.08]">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/55 mb-3">Account</p>
          <h1 className="ws-display text-[30px] sm:text-[34px] md:text-[48px] leading-[1.1] text-white break-words">{profile?.name || 'Your Profile'}</h1>
          <p className="text-white/60 text-[15px] mt-3 max-w-xl">Manage your profile, verification and appearance.</p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)] items-start">

          {/* ── LEFT: IDENTITY ── */}
          <div className="min-w-0 space-y-4 lg:sticky lg:top-28">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className={`${card} p-6 sm:p-7 text-center`}>
              <div className="relative group inline-block">
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />

                <div className="w-28 h-28 rounded-full overflow-hidden border border-white/15">
                  {avatarUploading ? (
                    <div className="w-full h-full bg-[var(--accent)] flex items-center justify-center">
                      <Loader2 className="animate-spin text-white" size={24} />
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
                    className="ws-display w-full h-full flex items-center justify-center text-4xl text-[#050505]"
                    style={{ display: (!avatarUploading && !profile?.avatar) ? 'flex' : 'none', backgroundColor: '#e8e2d6' }}
                  >
                    {profile?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                </div>

                {!avatarUploading && (
                  <div
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute inset-0 rounded-full bg-black/60 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Change profile picture"
                  >
                    <Camera size={20} className="text-white" />
                  </div>
                )}

                {profile?.avatar && !avatarUploading && (
                  <button
                    onClick={handleAvatarRemove}
                    className="absolute -top-1 -right-1 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400 z-10"
                    title="Remove profile picture"
                  >
                    <X size={13} className="text-white" />
                  </button>
                )}
              </div>

              <h2 className="ws-display text-[22px] mt-5 text-white truncate max-w-full">{profile?.name || 'Your name'}</h2>
              <p className="text-white/60 text-[14px] mt-1 truncate">{profile?.email}</p>

              <div className="mt-4 flex justify-center">
                {profile?.isVerified ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#cbb392]/15 border border-[#cbb392]/30 text-[#cbb392] text-[12px] font-bold">
                    <CheckCircle size={12} /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#a6603f]/15 border border-[#a6603f]/30 text-[#d8b899] text-[12px] font-bold">
                    <AlertCircle size={12} /> Unverified
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-[13.5px] font-bold text-white/90 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <Camera size={14} /> Change photo
              </button>
              <p className="text-white/45 text-[12.5px] mt-3">JPG, PNG or WebP · max 5MB</p>
            </motion.div>

            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              onClick={() => navigate('/workspace')}
              className={`${card} w-full flex items-center gap-4 p-5 text-left transition-all group hover:border-white/25 hover:bg-white/[0.05]`}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[#e8e2d6]">
                <LayoutGrid size={18} className="text-[#050505]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="ws-display text-[17px] text-white">Go to workspace</p>
                <p className="text-white/55 text-[13px] mt-0.5">Listings, purchases &amp; deployments</p>
              </div>
              <ChevronRight size={18} className="text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-full border border-white/15 bg-white/5 text-[14px] font-bold text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut size={15} /> Log out
            </motion.button>
          </div>

          {/* ── RIGHT: DETAILS + APPEARANCE ── */}
          <div className="min-w-0 space-y-6">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className={`${card} p-6 md:p-8`}>
              <h2 className="ws-display text-[22px] text-white mb-1 flex items-center gap-2.5">
                <UserIcon size={18} className="text-[#cbb392]" /> Profile details
              </h2>
              <p className="text-white/55 text-[14px] mb-7">This is how you appear across DevDrop.</p>

              {/* name */}
              <form onSubmit={handleSaveName} className="mb-6">
                <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60 block mb-2">Display name</label>
                <div className={`${fieldBox} focus-within:border-[#e8e2d6]/60`}>
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-white outline-none placeholder:text-white/35"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                  />
                  <button
                    type="submit"
                    disabled={!nameChanged || savingName}
                    className="shrink-0 px-5 py-2 rounded-full bg-[var(--accent)] text-white text-[13px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  >
                    {savingName ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Save
                  </button>
                </div>
              </form>

              {/* email */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60 block mb-2">Email address</label>
                <div className={`${fieldBox} flex-wrap sm:flex-nowrap`}>
                  <Mail size={16} className="text-white/45 shrink-0" />
                  <span className="min-w-0 flex-1 basis-40 text-[14.5px] text-white/90 truncate">{profile?.email}</span>
                  {profile?.isVerified ? (
                    <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#cbb392]/15 border border-[#cbb392]/30 text-[#cbb392] text-[12px] font-bold">
                      <CheckCircle size={12} /> Verified
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#a6603f]/15 border border-[#a6603f]/30 text-[#d8b899] text-[12px] font-bold">
                      <AlertCircle size={12} /> Unverified
                    </span>
                  )}
                </div>

                {!profile?.isVerified && (
                  <div className="mt-4 rounded-xl border border-[#a6603f]/30 bg-[#a6603f]/10 p-4 flex items-start gap-3">
                    <ShieldAlert size={17} className="text-[#d8b899] mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-[#e6cdb3] text-[14px] leading-relaxed">Verify your email to unlock selling and other account features.</p>
                      <button
                        onClick={handleSendVerification}
                        disabled={sendingVerification}
                        className="mt-3 px-5 py-2 rounded-full bg-[#e8e2d6] text-[#050505] text-[13px] font-bold hover:bg-white transition-colors disabled:opacity-60"
                      >
                        {sendingVerification ? 'Sending…' : 'Send verification email'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${card} p-6 md:p-8`}>
              <h2 className="ws-display text-[22px] text-white mb-1 flex items-center gap-2.5">
                <Palette size={18} className="text-[#cbb392]" /> Appearance
              </h2>
              <p className="text-white/55 text-[14px] mb-6">Choose an accent colour for your Profile &amp; Workspace.</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {themes.map((t) => {
                  const isActive = t.id === themeId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      aria-pressed={isActive}
                      className={`relative flex flex-col items-center gap-3 rounded-xl border p-4 transition-all ${
                        isActive ? 'border-[#e8e2d6]/70 bg-white/[0.06]' : 'border-white/[0.1] hover:border-white/25 hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className="w-9 h-9 rounded-full flex items-center justify-center border border-white/20" style={{ backgroundColor: t.accent }}>
                        {isActive && <Check size={15} className="text-white" />}
                      </span>
                      <span className="text-[13.5px] font-semibold text-white/85">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
