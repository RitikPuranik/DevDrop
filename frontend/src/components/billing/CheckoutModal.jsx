import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Tag, X, ShieldCheck, Clock, RotateCcw, CreditCard } from 'lucide-react';
import BillingModal from './BillingModal';
import { billingAPI } from '../../api/billing';
import { errorInfo, formatMoney, loadRazorpay, percentLabel } from './billingUtils';

const POLL_MS = 3000;
const POLL_MAX = 40;

function SummarySkeleton() {
  return (
    <div style={{ display: 'grid', gap: 12 }} aria-busy="true" aria-label="Loading order summary">
      {[60, 80, 70, 90, 50].map((w, i) => <div key={i} className="bl-skel" style={{ height: 18, width: `${w}%` }} />)}
    </div>
  );
}

function OrderSummary({ quote, planName }) {
  const money = (n) => formatMoney(n, quote.currency);
  return (
    <div aria-label="Order summary">
      <div className="bl-sumrow"><span>Plan</span><span style={{ fontWeight: 700 }}>{planName}</span></div>
      <div className="bl-sumrow"><span>Billing</span><span style={{ textTransform: 'capitalize' }}>{quote.interval} · {quote.months} {quote.months === 1 ? 'month' : 'months'}</span></div>
      <div className="bl-sumrow"><span>{quote.interval === 'yearly' ? 'Annual price (12 × monthly)' : 'Base amount'}</span><span>{money(quote.listPriceMinor)}</span></div>
      {quote.annualDiscountMinor > 0 && (
        <div className="bl-sumrow" data-kind="discount"><span>Yearly discount ({percentLabel(quote.annualDiscountBps)} of {money(quote.listPriceMinor)})</span><span>−{money(quote.annualDiscountMinor)}</span></div>
      )}
      {quote.coupon && (
        <div className="bl-sumrow" data-kind="discount">
          <span>Coupon {quote.coupon.code} ({quote.coupon.discountType === 'percent' ? `${quote.coupon.discountValue}%` : `${formatMoney(Math.round(quote.coupon.discountValue * 100))} off`}{quote.coupon.cappedBy?.includes('maxDiscount') ? ', capped' : ''}{quote.coupon.stackedWithAnnualDiscount ? ', on discounted price' : ''})</span>
          <span>−{money(quote.couponDiscountMinor)}</span>
        </div>
      )}
      {quote.creditAppliedMinor > 0 && (
        <div className="bl-sumrow" data-kind="discount"><span>Credit for unused time on current plan</span><span>−{money(quote.creditAppliedMinor)}</span></div>
      )}
      <div className="bl-sumrow"><span>Platform fee</span><span>{money(quote.platformFeeMinor)}</span></div>
      {quote.tax.mode === 'exclusive' && <div className="bl-sumrow"><span>{quote.tax.label} ({percentLabel(quote.tax.percentBps)})</span><span>{money(quote.tax.amountMinor)}</span></div>}
      <div className="bl-sumrow" data-kind="total"><span>Total due today</span><span aria-live="polite">{money(quote.totalMinor)}</span></div>
      {quote.tax.mode === 'inclusive' && quote.tax.amountMinor > 0 && <p className="bl-hint" style={{ textAlign: 'right' }}>Includes {quote.tax.label} of {money(quote.tax.amountMinor)}</p>}
      {quote.tax.mode === 'none' && <p className="bl-hint" style={{ textAlign: 'right' }}>No tax is charged.</p>}
    </div>
  );
}

export default function CheckoutModal({ open, onClose, plan, interval, meta = {}, onCompleted }) {
  const [phase, setPhase] = useState('review'); // review | processing | verifying | pending | success | failed | cancelled
  const [quote, setQuote] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMsg, setCouponMsg] = useState(null);
  const [failure, setFailure] = useState('');
  const orderRef = useRef(null);
  const pollRef = useRef(null);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; clearInterval(pollRef.current); }; }, []);

  const loadQuote = useCallback(async (couponCode) => {
    setLoadError(null);
    try {
      const { data } = couponCode ? await billingAPI.validateCoupon(plan.id, interval, couponCode) : await billingAPI.quote(plan.id, interval);
      if (!alive.current) return null;
      const q = couponCode ? data.data.quote : data.data;
      setQuote(q);
      return q;
    } catch (err) {
      if (!alive.current) return null;
      if (couponCode) throw err;
      setLoadError(errorInfo(err));
      return null;
    }
  }, [plan?.id, interval]);

  useEffect(() => {
    if (!open || !plan) return;
    setPhase('review'); setQuote(null); setCode(''); setApplied(null); setCouponMsg(null); setFailure(''); orderRef.current = null;
    loadQuote(null);
  }, [open, plan?.id, interval]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyCoupon = async (e) => {
    e?.preventDefault();
    const value = code.trim();
    if (!value) { setCouponMsg({ tone: 'bad', text: 'Enter a promo code.' }); return; }
    setCouponBusy(true); setCouponMsg(null);
    try {
      const q = await loadQuote(value);
      if (q) { setApplied(q.coupon.code); setCouponMsg({ tone: 'ok', text: 'Coupon applied successfully' }); }
    } catch (err) { setCouponMsg({ tone: 'bad', text: errorInfo(err).message }); }
    finally { if (alive.current) setCouponBusy(false); }
  };

  const removeCoupon = async () => {
    setApplied(null); setCode(''); setCouponMsg(null); setQuote(null);
    await loadQuote(null);
  };

  const finish = useCallback(async () => {
    clearInterval(pollRef.current);
    if (!alive.current) return;
    setPhase('success');
    onCompleted?.();
  }, [onCompleted]);

  const startPolling = useCallback(() => {
    let tries = 0;
    clearInterval(pollRef.current);
    setPhase('pending');
    pollRef.current = setInterval(async () => {
      tries += 1;
      try {
        const { data } = await billingAPI.checkoutStatus(orderRef.current);
        const s = data.data.status;
        if (s === 'paid') await finish();
        else if (s === 'failed' || s === 'cancelled' || s === 'expired') { clearInterval(pollRef.current); setFailure(data.data.failureReason || 'Your payment didn’t go through.'); setPhase('failed'); }
      } catch { /* keep polling */ }
      if (tries >= POLL_MAX) clearInterval(pollRef.current);
    }, POLL_MS);
  }, [finish]);

  const pay = async () => {
    setPhase('processing'); setFailure('');
    let order;
    try {
      const { data } = await billingAPI.checkout(plan.id, interval, applied);
      order = data.data;
      orderRef.current = order.orderId;
    } catch (err) {
      setFailure(errorInfo(err).message); setPhase('failed'); return;
    }
    if (order.status === 'paid') { await finish(); return; } // fully covered by credit/coupon: nothing to charge
    try {
      const Razorpay = await loadRazorpay();
      let settled = false;
      const rzp = new Razorpay({
        key: order.razorpay.keyId,
        order_id: order.razorpay.orderId,
        amount: order.razorpay.amount,
        currency: order.razorpay.currency,
        name: 'DevDrop',
        description: `${plan.name} plan · ${interval}`,
        theme: { color: '#c4a484' },
        handler: async (resp) => {
          settled = true;
          setPhase('verifying');
          try {
            const { data } = await billingAPI.verify({ orderId: order.orderId, razorpay_payment_id: resp.razorpay_payment_id, razorpay_order_id: resp.razorpay_order_id, razorpay_signature: resp.razorpay_signature });
            if (data.data.status === 'paid') await finish();
            else if (data.data.status === 'failed') { setFailure('Your payment didn’t go through.'); setPhase('failed'); }
            else startPolling();
          } catch (err) {
            // Verification could not be confirmed. Never assume success: fall back to server-side status polling.
            const info = errorInfo(err);
            if (info.code === 'PAYMENT_VERIFICATION_FAILED') { setFailure(info.message); setPhase('failed'); } else startPolling();
          }
        },
        modal: { ondismiss: () => { if (!settled && alive.current) setPhase('cancelled'); } },
      });
      rzp.on('payment.failed', (r) => { settled = true; setFailure(r?.error?.description || 'Your payment didn’t go through.'); setPhase('failed'); });
      rzp.open();
    } catch (err) {
      setFailure(errorInfo(err).message); setPhase('failed');
    }
  };

  if (!open || !plan) return null;
  const busy = phase === 'processing' || phase === 'verifying';
  const free = quote && !quote.requiresPayment;

  return (
    <BillingModal open={open} onClose={onClose} size={phase === 'review' ? 'wide' : undefined} dismissible={!busy}>
      {({ titleId }) => (
        <>
          {phase === 'review' && (
            <>
              <div><h2 id={titleId}>Checkout</h2><p className="bl-hint" style={{ marginTop: 6 }}>Review your order, then pay securely with Razorpay.</p></div>
              <div className="bl-checkout">
                <div>
                  {loadError ? (
                    <div className="bl-alert" role="alert"><XCircle size={18} aria-hidden="true" /><div><p>{loadError.message}</p><button type="button" className="bl-link" onClick={() => loadQuote(null)}>Try again</button></div></div>
                  ) : !quote ? <SummarySkeleton /> : <OrderSummary quote={quote} planName={plan.name} />}
                </div>
                <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
                  <div>
                    <p style={{ fontWeight: 700, marginBottom: 10 }}>Have a promo code?</p>
                    {applied ? (
                      <div className="bl-coupon-badge"><Tag size={15} aria-hidden="true" /> {applied}<button type="button" className="bl-x" style={{ position: 'static', width: 24, height: 24 }} onClick={removeCoupon} aria-label={`Remove coupon ${applied}`}><X size={13} /></button></div>
                    ) : (
                      <form className="bl-coupon" onSubmit={applyCoupon}>
                        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter coupon code" aria-label="Promo code" aria-describedby="bl-coupon-msg" maxLength={40} autoComplete="off" disabled={couponBusy} />
                        <button type="submit" className="bl-btn" data-kind="ghost" disabled={couponBusy || !quote}>{couponBusy ? <Loader2 size={16} className="bl-spin" aria-label="Checking" /> : 'Apply'}</button>
                      </form>
                    )}
                    <p id="bl-coupon-msg" className="bl-msg" data-tone={couponMsg?.tone} role="status" aria-live="polite">
                      {couponMsg?.tone === 'ok' && quote?.coupon ? `Coupon applied successfully. You’re saving ${formatMoney(quote.couponDiscountMinor, quote.currency)}` : couponMsg?.text}
                    </p>
                  </div>
                  <dl className="bl-kv">
                    <div><dt>Payment method</dt><dd style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><CreditCard size={14} aria-hidden="true" /> {free ? 'None needed' : 'Razorpay (UPI, cards, netbanking)'}</dd></div>
                    <div><dt>Billing period</dt><dd>{quote ? `${quote.months} ${quote.months === 1 ? 'month' : 'months'}` : '—'}</dd></div>
                    <div><dt>Currency</dt><dd>{quote?.currency || '—'}</dd></div>
                  </dl>
                  <div className="bl-fine" style={{ textAlign: 'left', margin: 0 }}>
                    {quote?.interval === 'yearly' && <p><strong>Yearly plans are charged upfront for the full year.</strong></p>}
                    <p>{meta.renewalTerms}</p>
                    {meta.taxNote && <p>{meta.taxNote}</p>}
                  </div>
                  <button type="button" className="bl-btn" data-kind="primary" disabled={!quote || busy} onClick={pay} data-autofocus>
                    <ShieldCheck size={17} aria-hidden="true" /> {free ? 'Activate plan' : quote ? `Pay ${formatMoney(quote.totalMinor, quote.currency)}` : 'Pay'}
                  </button>
                </div>
              </div>
            </>
          )}

          {(phase === 'processing' || phase === 'verifying') && (
            <div className="bl-center" role="status" aria-live="polite">
              <Loader2 size={34} className="bl-spin" aria-hidden="true" />
              <h2 id={titleId}>{phase === 'processing' ? 'Preparing your payment…' : 'Confirming your payment…'}</h2>
              <p className="bl-hint">Please don’t close this window.</p>
            </div>
          )}

          {phase === 'pending' && (
            <div className="bl-center" role="status" aria-live="polite">
              <div className="bl-icon-wrap"><Clock size={24} aria-hidden="true" /></div>
              <h2 id={titleId}>Waiting for confirmation</h2>
              <p className="bl-hint">Your bank is still confirming the payment. Your plan activates automatically once it’s confirmed. You can close this window.</p>
              <button type="button" className="bl-btn" data-kind="ghost" onClick={onClose}>Close</button>
            </div>
          )}

          {phase === 'success' && (
            <div className="bl-center" role="status" aria-live="polite">
              <div className="bl-icon-wrap" data-tone="ok"><CheckCircle2 size={26} aria-hidden="true" /></div>
              <h2 id={titleId}>You’re on {plan.name}</h2>
              <p className="bl-hint">{quote && quote.requiresPayment ? `Payment of ${formatMoney(quote.totalMinor, quote.currency)} received. ` : ''}Your new allowance is available right now.</p>
              <button type="button" className="bl-btn" data-kind="primary" data-autofocus onClick={onClose}>Start building</button>
            </div>
          )}

          {phase === 'failed' && (
            <div className="bl-center" role="alert">
              <div className="bl-icon-wrap" data-tone="bad"><XCircle size={26} aria-hidden="true" /></div>
              <h2 id={titleId}>Payment didn’t go through</h2>
              <p className="bl-hint">{failure || 'Something went wrong.'} You haven’t been given a plan for this attempt. If money left your account it will be refunded automatically by your bank.</p>
              <div className="bl-modal-actions"><button type="button" className="bl-btn" data-kind="ghost" onClick={onClose}>Close</button><button type="button" className="bl-btn" data-kind="primary" data-autofocus onClick={() => setPhase('review')}><RotateCcw size={15} aria-hidden="true" /> Try again</button></div>
            </div>
          )}

          {phase === 'cancelled' && (
            <div className="bl-center">
              <div className="bl-icon-wrap"><XCircle size={24} aria-hidden="true" /></div>
              <h2 id={titleId}>Payment cancelled</h2>
              <p className="bl-hint">No charge was made. You can pick up where you left off.</p>
              <div className="bl-modal-actions"><button type="button" className="bl-btn" data-kind="ghost" onClick={onClose}>Not now</button><button type="button" className="bl-btn" data-kind="primary" data-autofocus onClick={() => setPhase('review')}>Back to checkout</button></div>
            </div>
          )}
          {phase === 'review' && quote?.kind === 'renewal' && <p className="bl-hint">Renewing extends your current term; the time you have left is kept.</p>}
        </>
      )}
    </BillingModal>
  );
}
