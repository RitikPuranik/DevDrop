import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Receipt, ShieldCheck, TicketPercent, X } from 'lucide-react';
import { toast } from 'sonner';

import { paymentAPI } from '../../api/payment';

export default function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [quoteData, setQuoteData] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);

  const loadQuote = async (appliedCode = '') => {
    const res = await paymentAPI.quoteOrder({
      websiteId: id,
      couponCode: appliedCode || undefined,
    });

    const data = res.data?.data || null;
    setQuoteData(data);
    setAppliedCoupon(data?.coupon || null);
    return data;
  };

  useEffect(() => {
    const initQuote = async () => {
      try {
        await loadQuote();
      } catch (error) {
        console.error(error);
        toast.error(error.response?.data?.message || 'Failed to initialize checkout');
        navigate(`/website/${id}`);
      } finally {
        setLoading(false);
      }
    };

    initQuote();
  }, [id, navigate]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error('Enter a coupon code first');
      return;
    }

    try {
      setApplyingCoupon(true);
      await loadQuote(couponCode.trim().toUpperCase());
      setCouponCode(couponCode.trim().toUpperCase());
      toast.success('Coupon applied');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to apply coupon');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = async () => {
    try {
      setApplyingCoupon(true);
      setCouponCode('');
      await loadQuote();
      toast.success('Coupon removed');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to refresh checkout');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handlePayNow = async () => {
    if (!quoteData) return;

    try {
      setProcessing(true);
      const res = await paymentAPI.createOrder({
        websiteId: id,
        couponCode: appliedCoupon?.code,
      });

      const orderData = res.data?.data;

      if (orderData?.mode === 'free_after_coupon') {
        toast.success('Purchase completed! Redirecting to dashboard...');
        setTimeout(() => navigate('/workspace'), 1500);
        return;
      }

      if (!window.Razorpay) {
        toast.error('Razorpay SDK not loaded');
        setProcessing(false);
        return;
      }

      const options = {
        key: orderData.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderData.amountInPaise || (orderData.amount * 100),
        currency: orderData.currency || 'INR',
        name: 'DevDrop',
        description: `Purchase: ${orderData.websiteDetails?.name}`,
        order_id: orderData.razorpayOrderId,
        prefill: orderData.prefill || {},
        theme: {
          color: '#10b981',
        },
        handler: async (response) => {
          try {
            toast.loading('Verifying payment...');
            await paymentAPI.verifyPayment({
              ...response,
              websiteId: id,
            });
            toast.dismiss();
            toast.success('Payment successful! Redirecting to dashboard...');
            setTimeout(() => navigate('/workspace'), 2000);
          } catch (error) {
            toast.dismiss();
            toast.error(error.response?.data?.message || 'Payment verification failed');
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            toast.error('Payment cancelled');
            setProcessing(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to start payment');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center pt-24 pb-12">
        <Loader2 className="animate-spin text-white/50" size={32} />
      </div>
    );
  }

  if (!quoteData) return null;

  const { breakdown, websiteDetails } = quoteData;
  const hasDiscount = (breakdown?.discountAmount || 0) > 0;

  return (
    <div className="min-h-screen bg-black pt-32 pb-12 px-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-8 text-sm font-bold uppercase tracking-widest"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <h1 className="text-4xl font-black text-white mb-2">Checkout</h1>
        <p className="text-white/50 text-sm mb-10">Review your order details, apply a coupon if you have one, and complete your purchase.</p>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />

          <div className="flex items-start justify-between mb-8 pb-8 border-b border-white/10">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1">Item Summary</p>
              <h2 className="text-2xl font-bold text-white">{websiteDetails?.name}</h2>
              <span className="inline-block mt-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest text-white/50">
                {websiteDetails?.category} License
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Receipt size={24} className="text-emerald-500" />
            </div>
          </div>

          <div className="mb-8 rounded-[24px] border border-white/10 bg-black/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <TicketPercent size={16} className="text-emerald-400" />
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/45">Coupon Code</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                placeholder="ENTER COUPON"
                className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/40"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleApplyCoupon}
                  disabled={applyingCoupon}
                  className="px-5 py-3 rounded-2xl bg-emerald-500 text-black text-xs font-bold uppercase tracking-[0.2em] hover:bg-emerald-400 disabled:opacity-60"
                >
                  {applyingCoupon ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
                </button>
                {appliedCoupon && (
                  <button
                    onClick={handleRemoveCoupon}
                    disabled={applyingCoupon}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-white/10 bg-white/[0.03] text-xs font-bold uppercase tracking-[0.2em] text-white/60 hover:text-white"
                  >
                    <X size={14} /> Remove
                  </button>
                )}
              </div>
            </div>

            {appliedCoupon && (
              <div className="mt-3 text-sm text-emerald-300">
                Applied <span className="font-bold">{appliedCoupon.code}</span> for Rs {Number(appliedCoupon.discountAmount || 0).toLocaleString()} off
              </div>
            )}
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Subtotal Before Discount</span>
              <span className="text-white font-bold">Rs {Number(breakdown?.subtotalBeforeDiscount || 0).toLocaleString()}</span>
            </div>

            {hasDiscount && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/60">Discount</span>
                  <span className="text-emerald-400 font-bold">- Rs {Number(breakdown?.discountAmount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/60">Subtotal After Discount</span>
                  <span className="text-white font-bold">Rs {Number(breakdown?.subtotalAfterDiscount || 0).toLocaleString()}</span>
                </div>
              </>
            )}

            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Tax</span>
              <span className="text-white font-bold">Rs {Number(breakdown?.tax || 0).toLocaleString()}</span>
            </div>

            {hasDiscount && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/35">Original Total</span>
                <span className="text-white/35 line-through">Rs {Number(breakdown?.originalTotalPaid || 0).toLocaleString()}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-end pt-8 border-t border-white/10 mb-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Total Amount</p>
              <p className="text-4xl font-black text-white">Rs {Number(breakdown?.totalPaid || 0).toLocaleString()}</p>
            </div>
          </div>

          <button
            onClick={handlePayNow}
            disabled={processing}
            className="w-full py-4 bg-emerald-500 text-black rounded-2xl font-bold text-sm uppercase tracking-[0.2em] hover:bg-emerald-400 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
          >
            {processing ? (
              <><Loader2 size={16} className="animate-spin" /> Processing...</>
            ) : (
              <><ShieldCheck size={18} /> {Number(breakdown?.totalPaid || 0) === 0 ? 'Complete Purchase' : 'Proceed to Pay'}</>
            )}
          </button>

          <p className="text-center text-[10px] text-white/40 mt-4 font-medium flex items-center justify-center gap-1.5">
            <ShieldCheck size={12} /> {Number(breakdown?.totalPaid || 0) === 0 ? 'No payment gateway needed for this couponed purchase' : 'Secure encrypted payment via Razorpay'}
          </p>
        </div>
      </div>
    </div>
  );
}
