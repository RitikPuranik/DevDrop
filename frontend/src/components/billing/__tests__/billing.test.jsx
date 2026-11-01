import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../api/billing', () => ({
  billingAPI: { plans: vi.fn(), subscription: vi.fn(), usage: vi.fn(), orders: vi.fn(), quote: vi.fn(), validateCoupon: vi.fn(), checkout: vi.fn(), verify: vi.fn(), checkoutStatus: vi.fn(), cancel: vi.fn(), resume: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { billingAPI } from '../../../api/billing';
import { formatMoney, quotaModalFromError, pricingPath } from '../billingUtils';
import QuotaModal from '../QuotaModal';
import UsagePanel from '../UsagePanel';
import PricingPage from '../PricingPage';
import CheckoutModal from '../CheckoutModal';

const apiErr = (status, code, data) => ({ response: { status, data: { success: false, code, message: 'msg', data } } });
const ok = (data) => Promise.resolve({ data: { success: true, data } });

describe('formatMoney (presentation of integer paise only)', () => {
  it('shows whole rupees without decimals and fractional amounts with two', () => {
    expect(formatMoney(79900)).toBe('₹799');
    expect(formatMoney(910860)).toBe('₹9,108.60');
    expect(formatMoney(1402920)).toBe('₹14,029.20');
    expect(formatMoney(0)).toBe('₹0');
  });
});

describe('quotaModalFromError', () => {
  it.each([
    ['GENERATION_QUOTA_EXCEEDED', 'quota'], ['EDIT_QUOTA_EXCEEDED', 'quota'], ['PLAN_UPGRADE_REQUIRED', 'unlock'],
    ['SUBSCRIPTION_INACTIVE', 'inactive'], ['FAIR_USE_LIMIT_REACHED', 'fair'],
  ])('%s -> %s modal', (code, variant) => {
    expect(quotaModalFromError(apiErr(402, code, { a: 1 }))).toMatchObject({ variant, data: { a: 1 } });
  });
  it('leaves unrelated errors alone', () => {
    expect(quotaModalFromError(apiErr(500, 'BILLING_INTERNAL_ERROR'))).toBeNull();
    expect(quotaModalFromError(new Error('network'))).toBeNull();
    expect(quotaModalFromError(apiErr(400, 'COUPON_INVALID'))).toBeNull();
  });
  it('deep-links into the pricing tab', () => {
    expect(pricingPath('plus')).toBe('/workspace?section=pricing&plan=plus');
    expect(pricingPath()).toBe('/workspace?section=pricing');
  });
});

describe('QuotaModal', () => {
  const quotaData = { currentPlan: { id: 'pro', name: 'Pro' }, used: 20, limit: 20, resetAt: '2026-12-01T10:00:00.000Z', upgradeOptions: [{ planId: 'plus', name: 'Plus', monthlyPriceMinor: 129900, currency: 'INR', generationQuota: 50 }] };
  const setup = (props) => { const h = { onClose: vi.fn(), onUpgrade: vi.fn(), onViewPricing: vi.fn(), onExplore: vi.fn() }; render(<QuotaModal open {...h} {...props} />); return h; };

  it('quota exhausted: title, usage, reset date, upgrade options and all three buttons', () => {
    const h = setup({ variant: 'quota', data: quotaData });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /used all your website generations/i })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Pro');
    expect(dialog).toHaveTextContent('20');
    expect(dialog).toHaveTextContent('1 Dec 2026');
    expect(dialog).toHaveTextContent('Plus');
    fireEvent.click(screen.getByRole('button', { name: /upgrade plan/i }));
    expect(h.onUpgrade).toHaveBeenCalledWith('plus');
    fireEvent.click(screen.getByRole('button', { name: /view pricing/i }));
    expect(h.onViewPricing).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /maybe later/i }));
    expect(h.onClose).toHaveBeenCalled();
  });
  it('a Plus user is never told to upgrade to Plus; the reset date is shown instead', () => {
    setup({ variant: 'quota', data: { currentPlan: { id: 'plus', name: 'Plus' }, used: 50, limit: 50, resetAt: '2026-12-01T10:00:00.000Z', upgradeOptions: [], isTopPlan: true } });
    expect(screen.queryByRole('button', { name: /upgrade plan/i })).toBeNull();
    expect(screen.getByRole('dialog')).toHaveTextContent(/highest tier/i);
    expect(screen.getByRole('dialog')).toHaveTextContent('1 Dec 2026');
    expect(screen.getByRole('button', { name: /view pricing/i })).toBeInTheDocument();
  });
  it('no generation access: a different modal with a single Explore Plans action', () => {
    const h = setup({ variant: 'unlock', data: { upgradeOptions: [] } });
    expect(screen.getByRole('heading', { name: 'Unlock AI Website Generation' })).toBeInTheDocument();
    expect(screen.getByText('Choose a plan to start building websites with DevDrop AI.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /explore plans/i }));
    expect(h.onExplore).toHaveBeenCalled();
    expect(screen.queryByText(/used all your website generations/i)).toBeNull();
  });
  it('lapsed subscription offers renewal', () => {
    setup({ variant: 'inactive', data: { upgradeOptions: [{ planId: 'pro', name: 'Pro', monthlyPriceMinor: 79900, currency: 'INR', generationQuota: 20 }] } });
    expect(screen.getByRole('button', { name: /renew plan/i })).toBeInTheDocument();
  });
  it('is an accessible modal dialog and Escape closes it', () => {
    const h = setup({ variant: 'quota', data: quotaData });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(h.onClose).toHaveBeenCalled();
  });
});

describe('UsagePanel', () => {
  const base = { plan: { id: 'pro', name: 'Pro' }, subscriptionStatus: 'active', billingInterval: 'monthly', renewalDate: '2026-12-01T10:00:00.000Z', nextQuotaReset: '2026-12-01T10:00:00.000Z', generations: { used: 12, limit: 20, remaining: 8 }, edits: { unlimited: true, fairUsePerHour: 60 } };
  it('renders 12 / 20, a progressbar, 8 remaining and unlimited edits from backend data', () => {
    render(<UsagePanel usage={base} />);
    expect(screen.getByText('12 / 20 used')).toBeInTheDocument();
    expect(screen.getByText('8 generations remaining')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Website Generations' });
    expect(bar).toHaveAttribute('aria-valuenow', '12');
    expect(bar).toHaveAttribute('aria-valuemax', '20');
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });
  it('Free plan has finite edits and no reset', () => {
    render(<UsagePanel usage={{ ...base, plan: { id: 'free', name: 'Free' }, subscriptionStatus: 'free', billingInterval: null, renewalDate: null, nextQuotaReset: null, generations: { used: 1, limit: 1, remaining: 0 }, edits: { unlimited: false, used: 2, limit: 5, remaining: 3 } }} />);
    expect(screen.getByText('0 generations remaining')).toBeInTheDocument();
    expect(screen.getByText('3 edits remaining')).toBeInTheDocument();
    expect(screen.getByText('Does not reset')).toBeInTheDocument();
  });
});

const plansView = {
  currency: 'INR', taxNote: 'Prices include GST.', yearlyTerms: 'Yearly plans are charged upfront for the full year. Monthly plans are charged for one month at a time.',
  renewalTerms: 'Plans are prepaid.', quotaTerms: 'Quota resets monthly.', fairUse: { editsPerHour: 60, text: 'Fair use: 60 edits per hour.' }, currentPlanId: 'free', subscriptionStatus: 'free',
  plans: [
    { id: 'free', name: 'Free', description: 'Try it.', currency: 'INR', monthlyPriceMinor: 0, purchasable: false, isCurrent: true, cta: 'Get Started', features: ['1 website generation'], pricing: null, eligibility: { canPurchase: false, action: 'current' } },
    { id: 'pro', name: 'Pro', description: 'Ship.', currency: 'INR', monthlyPriceMinor: 79900, purchasable: true, recommended: true, cta: 'Upgrade to Pro', features: ['20 website generations per billing cycle'], pricing: { monthly: { totalMinor: 79900 }, yearly: { listPriceMinor: 958800, totalMinor: 910860, annualDiscountBps: 500, savingsMinor: 47940, monthlyEquivalentMinor: 75905 } }, eligibility: { canPurchase: true, action: 'subscribe' } },
    { id: 'plus', name: 'Plus', description: 'Scale.', currency: 'INR', monthlyPriceMinor: 129900, purchasable: true, premium: true, cta: 'Upgrade to Plus', features: ['50 website generations per billing cycle'], pricing: { monthly: { totalMinor: 129900 }, yearly: { listPriceMinor: 1558800, totalMinor: 1402920, annualDiscountBps: 1000, savingsMinor: 155880, monthlyEquivalentMinor: 116910 } }, eligibility: { canPurchase: true, action: 'subscribe' } },
  ],
};
const usage = { plan: { id: 'free', name: 'Free' }, subscriptionStatus: 'free', billingInterval: null, renewalDate: null, nextQuotaReset: null, generations: { used: 0, limit: 1, remaining: 1 }, edits: { unlimited: false, used: 0, limit: 5, remaining: 5 } };
const sub = { plan: { id: 'free', name: 'Free' }, status: 'free', interval: null, canCancel: false, canResume: false, downgrade: null, lapsed: null };

describe('PricingPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const mountPage = () => render(<MemoryRouter><PricingPage /></MemoryRouter>);
  const loadAll = () => { billingAPI.plans.mockReturnValue(ok(plansView)); billingAPI.subscription.mockReturnValue(ok(sub)); billingAPI.usage.mockReturnValue(ok(usage)); billingAPI.orders.mockReturnValue(ok([])); };

  it('shows skeletons while loading, then backend-provided plans', async () => {
    loadAll(); mountPage();
    expect(screen.getByLabelText('Loading plans')).toBeInTheDocument();
    expect(await screen.findByLabelText('Pro plan')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText('₹799')).toBeInTheDocument();
    expect(screen.getByText('₹1,299')).toBeInTheDocument();
  });
  it('yearly toggle shows monthly equivalent, original annual price, discount, savings and upfront charge', async () => {
    loadAll(); mountPage();
    await screen.findByLabelText('Pro plan');
    fireEvent.click(screen.getByRole('radio', { name: /yearly/i }));
    const pro = screen.getByLabelText('Pro plan');
    expect(pro).toHaveTextContent('₹759.05');
    expect(pro).toHaveTextContent('₹9,588');
    expect(pro).toHaveTextContent('₹9,108.60 billed yearly');
    expect(pro).toHaveTextContent('Save ₹479.40 (5% off)');
    expect(pro).toHaveTextContent(/charged upfront for the full year/i);
    const plus = screen.getByLabelText('Plus plan');
    expect(plus).toHaveTextContent('₹14,029.20 billed yearly');
    expect(plus).toHaveTextContent('Save ₹1,558.80 (10% off)');
  });
  it('the Free card is marked current and cannot be purchased', async () => {
    loadAll(); mountPage();
    const free = await screen.findByLabelText('Free plan');
    expect(within(free).getByRole('button', { name: 'Current plan' })).toBeDisabled();
    expect(within(screen.getByLabelText('Pro plan')).getByRole('button', { name: 'Upgrade to Pro' })).toBeEnabled();
  });
  it('shows an error state with retry when the backend fails', async () => {
    billingAPI.plans.mockRejectedValueOnce(apiErr(500, 'BILLING_INTERNAL_ERROR')); billingAPI.subscription.mockReturnValue(ok(sub)); billingAPI.usage.mockReturnValue(ok(usage)); billingAPI.orders.mockReturnValue(ok([]));
    mountPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('msg');
    loadAll();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByLabelText('Pro plan')).toBeInTheDocument();
  });
  it('renders the billing history empty state and disclosures from the backend', async () => {
    loadAll(); mountPage();
    await screen.findByLabelText('Pro plan');
    expect(screen.getByText(/No payments yet/)).toBeInTheDocument();
    expect(screen.getByText(plansView.yearlyTerms)).toBeInTheDocument();
    expect(screen.getByText(plansView.fairUse.text)).toBeInTheDocument();
  });
  it('selecting a plan opens checkout priced by the backend quote (client sends only ids)', async () => {
    loadAll();
    billingAPI.quote.mockReturnValue(ok({ currency: 'INR', interval: 'monthly', months: 1, listPriceMinor: 79900, annualDiscountMinor: 0, annualDiscountBps: 0, couponDiscountMinor: 0, creditAppliedMinor: 0, platformFeeMinor: 0, tax: { mode: 'inclusive', label: 'GST', percentBps: 1800, amountMinor: 12188 }, totalMinor: 79900, requiresPayment: true, coupon: null }));
    mountPage();
    fireEvent.click(within(await screen.findByLabelText('Pro plan')).getByRole('button', { name: 'Upgrade to Pro' }));
    expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
    expect(billingAPI.quote).toHaveBeenCalledWith('pro', 'monthly');
    const dlg = screen.getByRole('dialog');
    expect(await within(dlg).findByRole('button', { name: /pay ₹799/i })).toBeInTheDocument();
    expect(dlg).toHaveTextContent('Platform fee');
    expect(dlg).toHaveTextContent('₹0');
    expect(dlg).toHaveTextContent('Includes GST of ₹121.88');
  });
});

describe('CheckoutModal coupon UX', () => {
  const quote = (over = {}) => ({ currency: 'INR', interval: 'monthly', months: 1, listPriceMinor: 79900, annualDiscountMinor: 0, annualDiscountBps: 0, couponDiscountMinor: 0, creditAppliedMinor: 0, platformFeeMinor: 0, tax: { mode: 'inclusive', label: 'GST', percentBps: 1800, amountMinor: 0 }, totalMinor: 79900, requiresPayment: true, coupon: null, ...over });
  const mount = () => render(<CheckoutModal open plan={{ id: 'pro', name: 'Pro' }} interval="monthly" meta={{ renewalTerms: 'Prepaid.', taxNote: '' }} onClose={() => {}} />);
  beforeEach(() => { vi.clearAllMocks(); billingAPI.quote.mockReturnValue(ok(quote())); });

  it('apply -> success message, discount line, updated total; remove restores the original total', async () => {
    billingAPI.validateCoupon.mockReturnValue(ok({ valid: true, quote: quote({ couponDiscountMinor: 7990, totalMinor: 71910, coupon: { code: 'SAVE10', discountType: 'percent', discountValue: 10, discountMinor: 7990 } }) }));
    mount();
    const input = await screen.findByLabelText('Promo code');
    fireEvent.change(input, { target: { value: 'save10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/Coupon applied successfully\. You’re saving ₹79\.90/)).toBeInTheDocument();
    expect(screen.getByText('−₹79.90')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pay ₹719\.10/i })).toBeInTheDocument();
    expect(billingAPI.validateCoupon).toHaveBeenCalledWith('pro', 'monthly', 'save10');
    fireEvent.click(screen.getByRole('button', { name: /remove coupon SAVE10/i }));
    expect(await screen.findByRole('button', { name: /pay ₹799/i })).toBeInTheDocument();
  });
  it('shows the backend reason when a coupon is rejected, e.g. stacking', async () => {
    billingAPI.validateCoupon.mockRejectedValue({ response: { status: 400, data: { code: 'COUPON_NOT_STACKABLE', message: 'This coupon cannot be combined with the yearly billing discount.' } } });
    mount();
    fireEvent.change(await screen.findByLabelText('Promo code'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/cannot be combined with the yearly billing discount/)).toBeInTheDocument();
  });
});
