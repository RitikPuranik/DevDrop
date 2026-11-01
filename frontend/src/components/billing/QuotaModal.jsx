import React from 'react';
import { Lock, Sparkles, Clock, ArrowUpRight, RefreshCw, Gauge } from 'lucide-react';
import BillingModal from './BillingModal';
import { formatDate, formatMoney } from './billingUtils';

/**
 * Shown when the backend refuses a generation (it never reaches ai-service). Everything displayed comes from
 * the structured error: current plan, used / allowed, reset date and the upgrade options that actually exist.
 */
export default function QuotaModal({ open, onClose, variant, data = {}, onUpgrade, onViewPricing, onExplore }) {
  if (!open) return null;
  const plan = data.currentPlan || {};
  const options = data.upgradeOptions || [];
  const reset = formatDate(data.resetAt);
  const isTop = Boolean(data.isTopPlan) || (options.length === 0 && variant === 'quota');
  const next = options[0];
  const isEdit = data.kind === 'edit';

  const config = {
    unlock: { icon: <Lock size={22} />, title: 'Unlock AI Website Generation', body: 'Choose a plan to start building websites with DevDrop AI.' },
    quota: {
      icon: <Gauge size={22} />,
      title: isEdit ? 'You’ve used all your AI edits' : 'You’ve used all your website generations',
      body: isEdit ? 'You’ve reached your AI edit limit for this plan. Upgrade your plan to keep refining your site with DevDrop AI.' : 'You’ve reached your generation limit for this billing period. Upgrade your plan to keep building with DevDrop AI.',
    },
    inactive: { icon: <RefreshCw size={22} />, title: 'Your subscription has ended', body: 'Renew your plan to keep building with DevDrop AI. Your projects are safe.' },
    fair: { icon: <Clock size={22} />, title: 'Slow down for a moment', body: `You’re editing very quickly. Please wait a little while before sending more edits${data.fairUsePerHour ? ` (fair-use limit: ${data.fairUsePerHour} edits per hour)` : ''}.` },
  }[variant] || { icon: <Sparkles size={22} />, title: 'Upgrade to continue', body: 'Choose a plan to keep building with DevDrop AI.' };

  if (variant === 'quota' && isTop) {
    config.body = reset
      ? `You’ve used your whole allowance on the ${plan.name || 'top'} plan, which is our highest tier. It resets on ${reset}.`
      : `You’ve used your whole allowance on the ${plan.name || 'top'} plan, which is our highest tier.`;
  }

  return (
    <BillingModal open={open} onClose={onClose}>
      {({ titleId }) => (
        <>
          <div className="bl-icon-wrap" aria-hidden="true">{config.icon}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <h2 id={titleId}>{config.title}</h2>
            <p className="bl-hint" style={{ fontSize: 15, lineHeight: 1.55 }}>{config.body}</p>
          </div>

          {variant === 'quota' && (
            <div className="bl-stats" role="group" aria-label="Your usage">
              <div className="bl-stat"><span>Current plan</span><strong>{plan.name || '—'}</strong></div>
              <div className="bl-stat"><span>{isEdit ? 'Edits used' : 'Generations used'}</span><strong>{data.used ?? '—'}</strong></div>
              <div className="bl-stat"><span>Allowance</span><strong>{data.limit ?? '—'}</strong></div>
              <div className="bl-stat"><span>{reset ? 'Resets on' : 'Resets'}</span><strong>{reset || 'Never'}</strong></div>
            </div>
          )}

          {(variant === 'quota' || variant === 'unlock' || variant === 'inactive') && options.length > 0 && (
            <div className="bl-opts" aria-label="Available plans">
              {options.map((o) => (
                <div key={o.planId} className="bl-opt">
                  <span><strong>{o.name}</strong> · {o.generationQuota} generations / cycle</span>
                  <span style={{ fontWeight: 700 }}>{formatMoney(o.monthlyPriceMinor, o.currency)}<span className="bl-hint"> /mo</span></span>
                </div>
              ))}
            </div>
          )}

          <div className="bl-modal-actions">
            <button type="button" className="bl-btn" data-kind="ghost" onClick={onClose}>Maybe Later</button>
            {variant === 'fair' ? (
              <button type="button" className="bl-btn" data-kind="primary" data-autofocus onClick={onClose}>Got it</button>
            ) : variant === 'unlock' ? (
              <button type="button" className="bl-btn" data-kind="primary" data-autofocus onClick={onExplore || onViewPricing}>Explore Plans <ArrowUpRight size={16} /></button>
            ) : (
              <>
                <button type="button" className="bl-btn" data-kind="ghost" onClick={onViewPricing}>View Pricing</button>
                {!isTop && (
                  <button type="button" className="bl-btn" data-kind="primary" data-autofocus onClick={() => onUpgrade?.(next?.planId)}>
                    {variant === 'inactive' ? 'Renew Plan' : 'Upgrade Plan'} <ArrowUpRight size={16} />
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </BillingModal>
  );
}
