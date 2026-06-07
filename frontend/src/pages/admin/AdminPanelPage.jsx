import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';
import AdminNav from '../../components/admin/AdminNav';
import { userAPI } from '../../api/user';

import ReviewQueueSection from './sections/ReviewQueueSection';
import DashboardSection from './sections/DashboardSection';
import WebsitesSection from './sections/WebsitesSection';
import PayoutsSection from './sections/PayoutsSection';

export default function AdminPanel() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('review');

  useEffect(() => {
    const init = async () => {
      try {
        const res = await userAPI.getProfile();
        const role = res.data?.data?.user?.role;
        setIsAdmin(role === 'admin');
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center text-white">
        <Loader2 className="animate-spin text-[#8b7355]" size={36} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#080808] text-white flex items-center justify-center px-6">
        <div className="max-w-lg w-full rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-2xl">
          <ShieldCheck className="mx-auto mb-5 text-[#8b7355]" size={44} />
          <h1 className="text-3xl font-black tracking-tight mb-3">Admin access required</h1>
          <p className="text-white/40 text-sm leading-relaxed mb-8">Sign in with an admin account.</p>
          <button onClick={() => navigate("/")} className="px-6 py-3 rounded-full bg-[#8b7355] text-white font-bold uppercase tracking-[0.15em] text-xs">Back Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white pt-24 md:pt-32 pb-16 px-4 md:px-6">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Rendered once globally for all admin routes */}
        <AdminNav activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Content rendering conditionally based on state */}
        {activeTab === 'review' && <ReviewQueueSection />}
        {activeTab === 'dashboard' && <DashboardSection />}
        {activeTab === 'websites' && <WebsitesSection />}
        {activeTab === 'payouts' && <PayoutsSection />}
      </div>
    </div>
  );
}
