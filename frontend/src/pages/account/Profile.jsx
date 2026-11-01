import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, LogOut, Camera, X, CheckCircle, AlertCircle,
  Mail, User as UserIcon, Landmark, LayoutGrid, ChevronRight, Check, ShieldAlert, Sparkles,
} from 'lucide-react';
import { userAPI } from '../../api/user';
import { authAPI } from '../../api/auth';
import { billingAPI } from '../../api/billing';
import { formatDate } from '../../components/billing/billingUtils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAccentTheme } from '../../hooks/useAccentTheme';

export default function Profile() {
  const navigate = useNavigate();
  const { cssVars } = useAccentTheme();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);

  // Payout details (moved here from the workspace)
  const [bankDetails, setBankDetails] = useState({ upiId: '', phoneNumber: '' });
  const [loadingBank, setLoadingBank] = useState(true);
  const [savingBank, setSavingBank] = useState(false);

  // Current plan + this month's AI Studio usage (read-only; all numbers come from the billing API)
  const [usage, setUsage] = useState(null);
  const [usageFailed, setUsageFailed] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    billingAPI.usage().then((res) => setUsage(res.data?.data || null)).catch(() => setUsageFailed(true));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/'); return; }
    fetchProfile();
    fetchBankDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link from the workspace (/profile#payout-details)
  useEffect(() => {
    if (loading || loadingBank || window.location.hash !== '#payout-details') return;
    document.getElementById('payout-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loading, loadingBank]);

  const fetchBankDetails = async () => {
    try {
      setLoadingBank(true);
      const res = await userAPI.getBankDetails();
      if (res.data?.data) setBankDetails({ upiId: res.data.data.upiId || '', phoneNumber: res.data.data.phoneNumber || '' });
    } catch (err) {
      if (err.response?.status !== 404) toast.error('Failed to load payout details');
    } finally {
      setLoadingBank(false);
    }
  };

  const handleSaveBank = async (e) => {
    e.preventDefault();
    try {
      setSavingBank(true);
      await userAPI.saveBankDetails(bankDetails);
      toast.success('Payout details saved successfully');
      setProfile((prev) => ({ ...prev, hasBankDetails: true }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save payout details');
    } finally {
      setSavingBank(false);
    }
  };

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

            <motion.div id="your-plan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className={`${card} p-6 md:p-8`}>
              <h2 className="ws-display text-[22px] text-white mb-1 flex items-center gap-2.5">
                <Sparkles size={18} className="text-[#cbb392]" /> Your plan
              </h2>
              <p className="text-white/50 text-[14px] mb-5">Your DevDrop AI plan and this period's AI Studio usage.</p>
              {usage ? (
                <>
                  <div className="flex flex-wrap gap-2" role="list" aria-label="Plans">
                    {[['free', 'Free'], ['pro', 'Pro'], ['plus', 'Plus']].map(([id, label]) => {
                      const active = usage.plan?.id === id;
                      return (
                        <span key={id} role="listitem" aria-current={active ? 'true' : undefined} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-[13px] font-bold ${active ? 'bg-[#e8e2d6] text-[#050505] border-transparent' : 'border-white/10 text-white/35'}`}>
                          {active && <Check size={13} />} {label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[12px] text-white/45">Website generations</p>
                      <p className="mt-1 text-[18px] font-bold text-white tabular-nums">{usage.generations?.used} / {usage.generations?.limit} used</p>
                      <p className="text-[12px] text-white/45">{usage.generations?.remaining} left</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[12px] text-white/45">AI edits</p>
                      <p className="mt-1 text-[18px] font-bold text-white tabular-nums">{usage.edits?.unlimited ? 'Unlimited' : `${usage.edits?.used} / ${usage.edits?.limit} used`}</p>
                      <p className="text-[12px] text-white/45">{usage.edits?.unlimited ? 'Fair use applies' : `${usage.edits?.remaining} left`}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-[13px] text-white/45">
                    {[formatDate(usage.nextQuotaReset) && `Quota resets ${formatDate(usage.nextQuotaReset)}`, formatDate(usage.renewalDate) && `${usage.subscriptionStatus === 'cancelling' ? 'Ends' : 'Renews'} ${formatDate(usage.renewalDate)}`].filter(Boolean).join(' · ')}
                  </p>
                  <button type="button" onClick={() => navigate('/workspace?section=pricing')} className="mt-4 px-5 py-2.5 rounded-full border border-white/15 text-white/85 text-[13px] font-bold hover:bg-white/5 transition-colors">
                    {usage.isTopPlan ? 'Manage billing' : 'Upgrade or manage billing'}
                  </button>
                </>
              ) : usageFailed ? (
                <p className="text-white/50 text-[14px]">Couldn't load your plan right now. <button type="button" onClick={() => navigate('/workspace?section=pricing')} className="underline text-white/80">Open billing</button></p>
              ) : (
                <div className="h-24 rounded-xl bg-white/[0.04] animate-pulse" aria-busy="true" aria-label="Loading your plan" />
              )}
            </motion.div>

            <motion.div id="payout-details" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${card} p-6 md:p-8`}>
              <h2 className="ws-display text-[22px] text-white mb-1 flex items-center gap-2.5">
                <Landmark size={18} className="text-[#cbb392]" /> Payout details
              </h2>
              <p className="text-white/55 text-[14px] mb-6">Used when marketplace earnings are paid out.</p>

              {loadingBank ? (
                <div className="space-y-3" aria-busy="true" aria-label="Loading payout details">
                  <div className="h-12 rounded-xl bg-white/[0.05] animate-pulse" />
                  <div className="h-12 rounded-xl bg-white/[0.05] animate-pulse" />
                </div>
              ) : (
                <form onSubmit={handleSaveBank} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="block text-[12.5px] font-semibold text-white/60 mb-2">UPI ID</span>
                      <div className={fieldBox}>
                        <input required value={bankDetails.upiId} onChange={(e) => setBankDetails({ ...bankDetails, upiId: e.target.value })} placeholder="username@upi" className="w-full bg-transparent outline-none text-[14.5px] text-white placeholder:text-white/30" />
                      </div>
                    </label>
                    <label className="block">
                      <span className="block text-[12.5px] font-semibold text-white/60 mb-2">Phone number</span>
                      <div className={fieldBox}>
                        <input required type="tel" value={bankDetails.phoneNumber} onChange={(e) => setBankDetails({ ...bankDetails, phoneNumber: e.target.value })} placeholder="+91 9876543210" className="w-full bg-transparent outline-none text-[14.5px] text-white placeholder:text-white/30" />
                      </div>
                    </label>
                  </div>
                  <button type="submit" disabled={savingBank} className="px-6 py-3 rounded-full bg-[var(--accent)] text-white text-[13px] font-bold inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all">
                    {savingBank ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                    {savingBank ? 'Saving...' : 'Save payout details'}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
