import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { paymentAPI } from '../api/payment';
import { ShieldCheck, Loader2, ArrowLeft, Receipt } from 'lucide-react';
import { toast } from 'sonner';

export default function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [orderData, setOrderData] = useState(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const initOrder = async () => {
      try {
        const res = await paymentAPI.createOrder({ websiteId: id });
        setOrderData(res.data?.data);
      } catch (err) {
        console.error(err);
        toast.error(err.response?.data?.message || 'Failed to initialize checkout');
        navigate(`/website/${id}`);
      } finally {
        setLoading(false);
      }
    };
    initOrder();
  }, [id, navigate]);

  const handlePayNow = () => {
    if (!orderData) return;
    if (!window.Razorpay) {
      toast.error('Razorpay SDK not loaded');
      return;
    }

    setProcessing(true);

    const options = {
      key: orderData.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: orderData.amountInPaise || (orderData.amount * 100),
      currency: orderData.currency || 'INR',
      name: 'DevDrop',
      description: `Purchase: ${orderData.websiteDetails?.name}`,
      order_id: orderData.razorpayOrderId,
      prefill: orderData.prefill || {},
      theme: {
        color: '#10b981', // emerald-500
      },
      handler: async (response) => {
        try {
          toast.loading('Verifying payment...');
          await paymentAPI.verifyPayment({
            ...response,
            websiteId: id,
          });
          toast.dismiss();
          toast.success('Payment successful! Redirecting to profile...');
          setTimeout(() => navigate('/profile'), 2000);
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
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center pt-24 pb-12">
        <Loader2 className="animate-spin text-white/50" size={32} />
      </div>
    );
  }

  if (!orderData) return null;

  const { breakdown, websiteDetails } = orderData;

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
        <p className="text-white/50 text-sm mb-10">Review your order details before completing the payment.</p>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 relative overflow-hidden">
          {/* Glassmorphic Background Blur */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2"></div>
          
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

          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Base Price</span>
              <span className="text-white font-bold">₹{breakdown?.sellerPrice?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Platform Fee (10%)</span>
              <span className="text-white font-bold">₹{breakdown?.platformFee?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Tax (18% on fee)</span>
              <span className="text-white font-bold">₹{breakdown?.tax?.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex justify-between items-end pt-8 border-t border-white/10 mb-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Total Amount</p>
              <p className="text-4xl font-black text-white">₹{breakdown?.totalPaid?.toLocaleString()}</p>
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
              <><ShieldCheck size={18} /> Proceed to Pay</>
            )}
          </button>

          <p className="text-center text-[10px] text-white/40 mt-4 font-medium flex items-center justify-center gap-1.5">
            <ShieldCheck size={12} /> Secure encrypted payment via Razorpay
          </p>
        </div>
      </div>
    </div>
  );
}
