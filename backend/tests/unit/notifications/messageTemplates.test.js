const t = require('../../../src/infrastructure/notifications/messageTemplates');

const SUB_VARS = { plan_name: 'Pro', user_name: 'Asha Rao', user_email: 'asha@example.com', amount: '₹799.00', payment_status: 'Paid', subscription_id: 'sub_123', date_time: '1 Nov 2026, 3:45 pm IST' };

describe('subscription message', () => {
  it('matches the requested layout exactly', () => {
    expect(t.render('SUBSCRIPTION_PURCHASED', SUB_VARS)).toBe(
      [
        '🔔 *DevDrop | New Subscription*',
        '',
        'A user has subscribed to a plan.',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '📦 *Plan:* Pro',
        '👤 *User:* Asha Rao',
        '📧 *Email:* asha@example.com',
        '💰 *Amount:* ₹799.00',
        '💳 *Payment:* Paid',
        '🆔 *Subscription ID:* sub_123',
        '📅 *Date:* 1 Nov 2026, 3:45 pm IST',
        '━━━━━━━━━━━━━━━━━━',
        '',
        'DevDrop Admin Notification',
      ].join('\n')
    );
  });

  it('renewals use a distinct message so they are never mistaken for a new subscription', () => {
    const renewal = t.render('SUBSCRIPTION_RENEWED', SUB_VARS);
    expect(renewal).toContain('Subscription Renewed');
    expect(renewal).not.toContain('New Subscription');
  });
});

describe('website purchase message', () => {
  const vars = { website_name: 'Portfolio Pro', buyer_name: 'Ravi', buyer_email: 'ravi@example.com', seller_name: 'Meera', purchase_amount: '₹1,999.00', payment_status: 'Paid', order_id: 'order_9', date_time: '1 Nov 2026, 4:00 pm IST' };

  it('matches the requested layout exactly', () => {
    expect(t.render('WEBSITE_PURCHASED', vars)).toBe(
      [
        '🛍️ *DevDrop | New Website Purchase*',
        '',
        'A website has been purchased!',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '🌐 *Website:* Portfolio Pro',
        '👤 *Buyer:* Ravi',
        '📧 *Buyer Email:* ravi@example.com',
        '👨‍💻 *Seller:* Meera',
        '💰 *Purchase Amount:* ₹1,999.00',
        '💳 *Payment:* Paid',
        '🆔 *Order ID:* order_9',
        '📅 *Date:* 1 Nov 2026, 4:00 pm IST',
        '━━━━━━━━━━━━━━━━━━',
        '',
        'DevDrop Admin Notification',
      ].join('\n')
    );
  });

  it('shows "Unavailable" instead of failing when seller information is missing', () => {
    const msg = t.render('WEBSITE_PURCHASED', { ...vars, seller_name: undefined });
    expect(msg).toContain('👨‍💻 *Seller:* Unavailable');
    expect(t.render('WEBSITE_PURCHASED', { ...vars, seller_name: null })).toContain('*Seller:* Unavailable');
    expect(t.render('WEBSITE_PURCHASED', { ...vars, seller_name: '   ' })).toContain('*Seller:* Unavailable');
  });
});

describe('value sanitising', () => {
  it('strips WhatsApp formatting characters, newlines and template markers from user-controlled text', () => {
    expect(t.sanitizeValue('*Evil*\n~name~ `x` {{plan_name}}')).toBe('Evil name x plan_name');
  });
  it('keeps underscores that are inside an e-mail address', () => {
    expect(t.sanitizeValue('john_doe@example.com')).toBe('john_doe@example.com');
    expect(t.sanitizeValue('_italic_ word')).toBe('italic word');
  });
  it('caps very long values', () => {
    expect(t.sanitizeValue('x'.repeat(500)).length).toBe(120);
  });
  it('cannot be tricked into injecting a second template placeholder', () => {
    const msg = t.render('SUBSCRIPTION_PURCHASED', { ...SUB_VARS, user_name: '{{user_email}}' });
    expect(msg).toContain('*User:* user_email');
  });
});

describe('formatting helpers', () => {
  it('formats minor units with the stored currency', () => {
    expect(t.formatMoneyMinor(79900, 'INR')).toBe('₹799.00');
    expect(t.formatMoneyMinor(0, 'INR')).toBe('₹0.00');
    expect(t.formatMoneyMinor(1050, 'USD')).toBe('$10.50');
    expect(t.formatMoneyMinor('abc')).toBe('Unavailable');
  });
  it('formats rupee amounts without float drift', () => {
    expect(t.formatMoneyMajor(1999)).toBe('₹1,999.00');
    expect(t.formatMoneyMajor(19.99)).toBe('₹19.99');
  });
  it('renders dates in the configured time zone', () => {
    expect(t.formatDateTime(new Date('2026-11-01T10:15:00Z'), 'Asia/Kolkata')).toMatch(/1 Nov 2026, 3:45\s?pm IST/i);
    expect(t.formatDateTime('not a date')).toBe('Unavailable');
  });
});

describe('admin report message', () => {
  const stats = {
    pending_verifications: { count: 3 },
    pending_payouts: { count: 2, totalAmount: 4500.5 },
    subscriptions: { totalActive: 5, cancelling: 1, byPlan: [{ name: 'Pro', count: 3 }, { name: 'Plus', count: 2 }], historicalPurchases: 12 },
    bought_websites: { total: 10, paid: 7, free: 3 },
  };
  const at = new Date('2026-11-01T10:00:00Z');

  it('includes only the selected statistics', () => {
    const msg = t.renderReport({ metrics: ['pending_payouts'], stats, generatedAt: at });
    expect(msg).toContain('Pending Payouts:* 2 requests · ₹4,500.50');
    expect(msg).not.toContain('Pending Website Verifications');
    expect(msg).not.toContain('Active Subscriptions');
    expect(msg).not.toContain('Total Bought Websites');
  });

  it('keeps a stable order whatever order the metrics were selected in', () => {
    const msg = t.renderReport({ metrics: ['bought_websites', 'pending_verifications'], stats, generatedAt: at });
    expect(msg.indexOf('Pending Website Verifications')).toBeLessThan(msg.indexOf('Total Bought Websites'));
  });

  it('separates active subscriptions from historical purchases', () => {
    const msg = t.renderReport({ metrics: ['subscriptions'], stats, generatedAt: at });
    expect(msg).toContain('Active Subscriptions:* 5');
    expect(msg).toContain('Pro: 3');
    expect(msg).toContain('Plus: 2');
    expect(msg).toContain('Subscription purchases to date: 12');
  });

  it('pluralises a single payout request', () => {
    const msg = t.renderReport({ metrics: ['pending_payouts'], stats: { pending_payouts: { count: 1, totalAmount: 10 } }, generatedAt: at });
    expect(msg).toContain('1 request ·');
  });
});
