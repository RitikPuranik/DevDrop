const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(n) || 0);

// One-line live value for each card; the numbers come straight from the backend aggregation.
export const describeStat = (id, s) => {
  if (!s) return '—';
  switch (id) {
    case 'pending_verifications': return `${s.count} awaiting review`;
    case 'pending_payouts': return `${s.count} request${s.count === 1 ? '' : 's'} · ${inr(s.totalAmount)}`;
    case 'subscriptions': return `${s.totalActive} active · ${s.historicalPurchases} purchased to date`;
    case 'bought_websites': return `${s.total} completed (${s.paid} paid · ${s.free} free)`;
    default: return '—';
  }
};
