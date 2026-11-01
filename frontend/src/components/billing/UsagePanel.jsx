import React from 'react';
import { Infinity as InfinityIcon } from 'lucide-react';
import { formatDate } from './billingUtils';

function Meter({ label, used, limit, remainingLabel }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return (
    <div className="bl-meter">
      <div className="bl-meter-head"><span>{label}</span><strong>{used} / {limit} used</strong></div>
      <div className="bl-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-valuetext={`${used} of ${limit} used`}>
        <div className="bl-fill" data-warn={pct >= 75 && pct < 100} data-full={pct >= 100} style={{ width: `${pct}%` }} />
      </div>
      <span className="bl-hint">{remainingLabel}</span>
    </div>
  );
}

/** Pure view of GET /api/billing/usage. */
export default function UsagePanel({ usage }) {
  const g = usage.generations; const e = usage.edits;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return (
    <div className="bl-panel">
      <h3>Usage</h3>
      <div className="bl-plan-pill">{usage.plan.name}<span className="bl-status" data-s={usage.subscriptionStatus === 'free' ? '' : usage.subscriptionStatus}>{usage.subscriptionStatus === 'free' ? 'Free plan' : usage.subscriptionStatus === 'cancelling' ? 'Ends at term end' : usage.subscriptionStatus}</span></div>
      <Meter label="Website Generations" used={g.used} limit={g.limit} remainingLabel={`${plural(g.remaining, 'generation')} remaining`} />
      {e.unlimited ? (
        <div className="bl-meter">
          <div className="bl-meter-head"><span>AI Edits</span><strong style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><InfinityIcon size={16} aria-hidden="true" /> Unlimited</strong></div>
          <span className="bl-hint">Fair use applies ({e.fairUsePerHour} edits per hour).</span>
        </div>
      ) : (
        <Meter label="AI Edits" used={e.used} limit={e.limit} remainingLabel={`${plural(e.remaining, 'edit')} remaining`} />
      )}
      <dl className="bl-kv">
        {usage.billingInterval && <div><dt>Billing interval</dt><dd style={{ textTransform: 'capitalize' }}>{usage.billingInterval}</dd></div>}
        {usage.renewalDate && <div><dt>Plan term ends</dt><dd>{formatDate(usage.renewalDate)}</dd></div>}
        <div><dt>Next quota reset</dt><dd>{usage.nextQuotaReset ? formatDate(usage.nextQuotaReset) : 'Does not reset'}</dd></div>
      </dl>
    </div>
  );
}
