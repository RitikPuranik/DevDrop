import { useEffect, useState } from 'react';
import { Loader2, Power, RefreshCcw, TicketPercent } from 'lucide-react';
import { toast } from 'sonner';

import { adminAPI } from '../../../api/admin';

const initialForm = {
  code: '',
  usageMode: 'reusable',
  discountType: 'percent',
  discountValue: '',
};

const formatDiscount = (coupon) => {
  if (coupon.discountType === 'percent') return `${coupon.discountValue}%`;
  return `Rs ${Number(coupon.discountValue || 0).toLocaleString()}`;
};

const getCouponStatus = (coupon) => {
  if (!coupon.active) return { label: 'Inactive', tone: 'text-red-300 border-red-500/20 bg-red-500/10' };
  if (coupon.isExhausted) return { label: 'Used', tone: 'text-amber-300 border-amber-500/20 bg-amber-500/10' };
  if (coupon.isReserved) return { label: 'Reserved', tone: 'text-blue-300 border-blue-500/20 bg-blue-500/10' };
  return { label: 'Active', tone: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10' };
};

export default function CouponsSection() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState(initialForm);

  const loadCoupons = async ({ silent = false } = {}) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const res = await adminAPI.getCoupons();
      setCoupons(res.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load coupons');
      setCoupons([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  const handleChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCreateCoupon = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        discountValue: Number(form.discountValue),
      };

      await adminAPI.createCoupon(payload);
      toast.success('Coupon created successfully');
      setForm(initialForm);
      await loadCoupons({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create coupon');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleCoupon = async (coupon) => {
    try {
      await adminAPI.toggleCoupon(coupon._id, { active: !coupon.active });
      toast.success(`Coupon ${coupon.active ? 'disabled' : 'enabled'} successfully`);
      await loadCoupons({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update coupon');
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex items-center justify-center text-white/30">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-6 md:p-8 shadow-2xl shadow-black/30">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-2">Coupons</p>
            <h2 className="text-2xl font-black tracking-tight">Create Discount Codes</h2>
            <p className="text-sm text-white/40 mt-2">Single-use coupons are reserved at checkout for 15 minutes and consumed after purchase.</p>
          </div>
          <button
            onClick={() => loadCoupons({ silent: true })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-white/10 bg-white/[0.03] text-xs font-bold uppercase tracking-[0.15em] text-white/55 hover:text-white"
            disabled={refreshing}
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            Refresh
          </button>
        </div>

        <form onSubmit={handleCreateCoupon} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-1">
            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Coupon Code</label>
            <input
              value={form.code}
              onChange={(event) => handleChange('code', event.target.value.toUpperCase())}
              placeholder="SUMMER50"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-[#8b7355]"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Usage Mode</label>
            <select
              value={form.usageMode}
              onChange={(event) => handleChange('usageMode', event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-[#111] px-4 py-3 text-sm text-white outline-none focus:border-[#8b7355]"
            >
              <option value="reusable">Reusable</option>
              <option value="single_global">Single Global</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Discount Type</label>
            <select
              value={form.discountType}
              onChange={(event) => handleChange('discountType', event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-[#111] px-4 py-3 text-sm text-white outline-none focus:border-[#8b7355]"
            >
              <option value="percent">Percent</option>
              <option value="flat">Flat Amount</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Discount Value</label>
            <input
              type="number"
              min="0"
              value={form.discountValue}
              onChange={(event) => handleChange('discountValue', event.target.value)}
              placeholder={form.discountType === 'percent' ? '25' : '500'}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-[#8b7355]"
              required
            />
          </div>

          <div className="md:col-span-2 xl:col-span-4">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#8b7355] text-white text-xs font-bold uppercase tracking-[0.15em] hover:bg-[#725e46] disabled:opacity-60"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <TicketPercent size={14} />}
              Create Coupon
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-6 md:p-8 shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-2">Inventory</p>
            <h2 className="text-2xl font-black tracking-tight">Coupon Library</h2>
          </div>
          <span className="text-xs text-white/30 uppercase tracking-[0.15em]">{coupons.length} total</span>
        </div>

        {coupons.length === 0 ? (
          <div className="py-12 text-center text-white/25 text-sm">No coupons created yet.</div>
        ) : (
          <div className="space-y-4">
            {coupons.map((coupon) => {
              const status = getCouponStatus(coupon);

              return (
                <div
                  key={coupon._id}
                  className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-lg font-black tracking-tight text-white">{coupon.code}</p>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] border ${status.tone}`}>
                        {status.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-white/45 font-bold">
                      <span className="px-3 py-1 rounded-full bg-white/[0.03] border border-white/10">{coupon.usageMode === 'single_global' ? 'Single Global' : 'Reusable'}</span>
                      <span className="px-3 py-1 rounded-full bg-white/[0.03] border border-white/10">{coupon.discountType}</span>
                      <span className="px-3 py-1 rounded-full bg-white/[0.03] border border-white/10">{formatDiscount(coupon)}</span>
                    </div>

                    <div className="flex flex-wrap gap-5 text-sm text-white/55">
                      <span>Used: <strong className="text-white">{coupon.usageCount || 0}</strong></span>
                      <span>Reserved Until: <strong className="text-white">{coupon.reservationExpiresAt ? new Date(coupon.reservationExpiresAt).toLocaleString() : '—'}</strong></span>
                      <span>Consumed At: <strong className="text-white">{coupon.consumedAt ? new Date(coupon.consumedAt).toLocaleString() : '—'}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleCoupon(coupon)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-white/10 bg-white/[0.03] text-xs font-bold uppercase tracking-[0.15em] text-white/65 hover:text-white"
                    >
                      <Power size={14} />
                      {coupon.active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
