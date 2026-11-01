import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, Crown, Loader2, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { billingAPI } from '../../api/billing';
import CheckoutModal from './CheckoutModal';
import UsagePanel from './UsagePanel';
import { errorInfo, formatDate, formatMoney, percentLabel } from './billingUtils';
import './billing.css';

function CardsSkeleton() {
  return (
    <div className="bl-grid" aria-busy="true" aria-label="Loading plans">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bl-card" style={{ minHeight: 420 }}>
          <div className="bl-skel" style={{ height: 26, width: '40%' }} />
          <div className="bl-skel" style={{ height: 14, width: '80%' }} />
          <div className="bl-skel" style={{ height: 46, width: '55%' }} />
          {[1, 2, 3, 4].map((k) => <div key={k} className="bl-skel" style={{ height: 14, width: `${90 - k * 8}%` }} />)}
          <div className="bl-skel" style={{ height: 46, marginTop: 'auto' }} />
        </div>
      ))}
    </div>
  );
}

function PlanCard({ plan, interval, onSelect, busy }) {
  const price = plan.pricing?.[interval];
  const tone = plan.premium ? 'plus' : plan.recommended ? 'pro' : 'free';
  const e = plan.eligibility || {};
  const yearly = interval === 'yearly' && price;
  const label = plan.isCurrent && !e.canPurchase ? 'Current plan' : e.action === 'renew' ? `Renew ${plan.name}` : e.action === 'resubscribe' ? `Renew ${plan.name}` : e.action === 'downgrade_unavailable' ? 'Available after your term' : plan.cta;
  const disabled = busy || (plan.purchasable && !e.canPurchase) || (!plan.purchasable && plan.isCurrent);

  return (
    <div className="bl-card" data-tone={tone} aria-label={`${plan.name} plan`}>
      {plan.recommended && <span className="bl-ribbon">Recommended</span>}
      {plan.premium && <span className="bl-ribbon" data-tone="plus"><Crown size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} aria-hidden="true" />Premium</span>}
      <div>
        <div className="bl-plan-name">{plan.name}{plan.isCurrent && <span className="bl-status" data-s="active">Current</span>}</div>
        <p className="bl-plan-desc">{plan.description}</p>
      </div>

      <div className="bl-price">
        {plan.purchasable && price ? (
          <>
            <div className="bl-price-main">
              <span className="bl-amount">{formatMoney(yearly ? price.monthlyEquivalentMinor : plan.monthlyPriceMinor, plan.currency)}</span>
              <span className="bl-per">/ month</span>
            </div>
            {yearly ? (
              <>
                <span className="bl-sub"><span className="bl-strike">{formatMoney(price.listPriceMinor, plan.currency)}</span> {formatMoney(price.totalMinor, plan.currency)} billed yearly</span>
                <span className="bl-badge-save">Save {formatMoney(price.savingsMinor, plan.currency)} ({percentLabel(price.annualDiscountBps)} off)</span>
                <span className="bl-sub">Charged upfront for the full year.</span>
              </>
            ) : <span className="bl-sub">Billed monthly</span>}
          </>
        ) : (
          <><div className="bl-price-main"><span className="bl-amount">{formatMoney(0, plan.currency)}</span></div><span className="bl-sub">Free to start</span></>
        )}
      </div>

      <ul className="bl-feats">
        {plan.features.map((f) => <li key={f}><Check size={16} aria-hidden="true" /><span>{f}</span></li>)}
      </ul>

      <button type="button" className="bl-btn" data-kind={plan.purchasable && !disabled ? 'primary' : 'ghost'} disabled={disabled} onClick={() => onSelect(plan)}>
        {busy && <Loader2 size={15} className="bl-spin" aria-hidden="true" />}
        {plan.premium && !disabled ? <Sparkles size={15} aria-hidden="true" /> : null}{label}
      </button>
      {e.availableAt && !e.canPurchase && <p className="bl-hint" style={{ textAlign: 'center', marginTop: -8 }}>{e.action === 'current' ? `You can renew from ${formatDate(e.availableAt)}` : `Switch after ${formatDate(e.availableAt)}`}</p>}
    </div>
  );
}

function SubscriptionPanel({ sub, onCancel, onResume, busy, onRenew }) {
  const paid = sub.plan.id !== 'free' && sub.status !== 'expired';
  return (
    <div className="bl-panel">
      <h3>Subscription</h3>
      <div className="bl-plan-pill">{paid ? sub.plan.name : sub.status === 'expired' ? 'Subscription ended' : 'Free'}<span className="bl-status" data-s={sub.status}>{sub.status === 'cancelling' ? 'Ending' : sub.status}</span></div>
      {paid ? (
        <dl className="bl-kv">
          <div><dt>Billing interval</dt><dd style={{ textTransform: 'capitalize' }}>{sub.interval}</dd></div>
          <div><dt>Current term</dt><dd>{formatDate(sub.currentPeriodStart)} – {formatDate(sub.currentPeriodEnd)}</dd></div>
          <div><dt>{sub.cancelAtPeriodEnd ? 'Ends on' : 'Renewal'}</dt><dd>{sub.cancelAtPeriodEnd ? formatDate(sub.currentPeriodEnd) : `Renew manually by ${formatDate(sub.currentPeriodEnd)}`}</dd></div>
          {sub.graceEndsAt && <div><dt>Grace period ends</dt><dd>{formatDate(sub.graceEndsAt)}</dd></div>}
        </dl>
      ) : sub.status === 'expired' && sub.lapsed ? (
        <p className="bl-hint">Your plan ended on {formatDate(sub.lapsed.endedAt)}. You can renew any time; your projects are safe.</p>
      ) : <p className="bl-hint">You’re on the Free plan. Upgrade any time to build more.</p>}
      {sub.downgrade && <p className="bl-hint">{sub.downgrade.note} (from {formatDate(sub.downgrade.availableAt)})</p>}
      <div className="bl-actions">
        {sub.canCancel && <button type="button" className="bl-btn" data-kind="danger" disabled={busy} onClick={onCancel}>Cancel subscription</button>}
        {sub.canResume && <button type="button" className="bl-btn" data-kind="ghost" disabled={busy} onClick={onResume}>Keep my plan</button>}
        {sub.status === 'expired' && <button type="button" className="bl-btn" data-kind="primary" onClick={onRenew}>Renew plan</button>}
      </div>
      {paid && <p className="bl-hint">Plans are prepaid and don’t renew automatically, so cancelling never triggers another charge. Access continues until the end of your term.</p>}
    </div>
  );
}

function History({ orders }) {
  return (
    <div className="bl-panel">
      <h3>Billing history</h3>
      {orders.length === 0 ? <div className="bl-empty">No payments yet. Your receipts will appear here.</div> : (
        <div className="bl-scroll">
          <table className="bl-table">
            <thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{formatDate(o.paidAt || o.createdAt)}</td>
                  <td>{o.planName} · <span style={{ textTransform: 'capitalize' }}>{o.interval}</span>{o.couponCode ? ` · ${o.couponCode}` : ''}</td>
                  <td>{formatMoney(o.amountMinor, o.currency)}</td>
                  <td><span className="bl-status" data-s={o.status === 'paid' ? 'active' : 'expired'}>{o.status}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.paymentReference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The Pricing tab. Everything rendered here comes from /api/billing/*; nothing is hardcoded. */
export default function PricingPage({ initialPlanId }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading' });
  const [interval, setInterval_] = useState('monthly');
  const [checkout, setCheckout] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent) => {
    if (!silent) setState({ status: 'loading' });
    try {
      const [plans, sub, usage, orders] = await Promise.all([billingAPI.plans(), billingAPI.subscription(), billingAPI.usage(), billingAPI.orders()]);
      setState({ status: 'ready', plans: plans.data.data, sub: sub.data.data, usage: usage.data.data, orders: orders.data.data });
    } catch (err) {
      setState((s) => (silent && s.status === 'ready' ? s : { status: 'error', error: errorInfo(err) }));
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const ready = state.status === 'ready' ? state : null;
  const choose = useCallback((plan) => {
    if (!plan.purchasable) { navigate('/ai-studio'); return; }
    setCheckout(plan);
  }, [navigate]);

  // Deep link from the quota modal (?plan=plus) opens checkout for that plan once plans have loaded.
  useEffect(() => {
    if (!ready || !initialPlanId) return;
    const p = ready.plans.plans.find((x) => x.id === initialPlanId);
    if (p?.eligibility?.canPurchase) setCheckout(p);
    const url = new URL(window.location.href); url.searchParams.delete('plan'); window.history.replaceState({}, '', url);
  }, [!!ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxSavings = useMemo(() => {
    if (!ready) return null;
    const best = ready.plans.plans.filter((p) => p.pricing).map((p) => p.pricing.yearly).sort((a, b) => b.annualDiscountBps - a.annualDiscountBps)[0];
    return best ? best.annualDiscountBps : null;
  }, [ready]);

  const manage = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(true); } catch (err) { toast.error(errorInfo(err).message); } finally { setBusy(false); }
  };

  if (state.status === 'loading') return <div className="bl-root"><CardsSkeleton /></div>;
  if (state.status === 'error') {
    return (
      <div className="bl-root">
        <div className="bl-alert" role="alert"><AlertCircle size={18} aria-hidden="true" /><div style={{ display: 'grid', gap: 8 }}><p>{state.error.message}</p><button type="button" className="bl-btn" data-kind="ghost" onClick={() => load(false)}><RefreshCw size={15} aria-hidden="true" /> Try again</button></div></div>
      </div>
    );
  }

  const { plans: view, sub, usage, orders } = ready;
  const yearlySavings = view.plans.filter((p) => p.pricing).map((p) => `${p.name}: save ${formatMoney(p.pricing.yearly.savingsMinor, p.currency)}`);

  return (
    <div className="bl-root">
      {sub.status === 'expired' && <div className="bl-alert" role="status"><Zap size={18} aria-hidden="true" /><p>Your subscription has ended. Renew below to keep building with DevDrop AI.</p></div>}

      <div className="bl-panels">
        <UsagePanel usage={usage} />
        <SubscriptionPanel sub={sub} busy={busy} onRenew={() => { const p = view.plans.find((x) => x.id === sub.lapsed?.planId && x.eligibility?.canPurchase) || view.plans.find((x) => x.eligibility?.canPurchase && x.purchasable); if (p) setCheckout(p); }}
          onCancel={() => { if (window.confirm('Cancel your subscription? You’ll keep access until the end of your current term.')) manage(billingAPI.cancel, 'Cancellation scheduled'); }}
          onResume={() => manage(billingAPI.resume, 'Your plan will stay active')} />
      </div>

      <div className="bl-toolbar">
        <div className="bl-toggle" role="radiogroup" aria-label="Billing interval" data-value={interval}>
          <span className="bl-toggle-pill" aria-hidden="true" />
          <button type="button" role="radio" aria-checked={interval === 'monthly'} onClick={() => setInterval_('monthly')}>Monthly</button>
          <button type="button" role="radio" aria-checked={interval === 'yearly'} onClick={() => setInterval_('yearly')}>Yearly {maxSavings ? <span className="bl-save-chip">Save up to {percentLabel(maxSavings)}</span> : null}</button>
        </div>
      </div>
      <div className="bl-savings-line" aria-live="polite">{interval === 'yearly' ? `Yearly billing saves you — ${yearlySavings.join(' · ')}` : ''}</div>

      <div className="bl-grid">
        {view.plans.map((p) => <PlanCard key={p.id} plan={p} interval={interval} onSelect={choose} busy={false} />)}
      </div>

      <div className="bl-fine">
        <p>{view.yearlyTerms}</p>
        <p>{view.renewalTerms}</p>
        <p>{view.quotaTerms}</p>
        <p>{view.fairUse.text}</p>
        <p>{view.taxNote} No platform or checkout fees.</p>
      </div>

      <History orders={orders} />

      <CheckoutModal open={!!checkout} plan={checkout} interval={interval} meta={view} onClose={() => setCheckout(null)} onCompleted={() => load(true)} />
    </div>
  );
}
