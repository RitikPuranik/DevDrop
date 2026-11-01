import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../../../../api/admin', () => ({
  adminAPI: {
    getWhatsAppOverview: vi.fn(), getWhatsAppReportStats: vi.fn(), previewWhatsAppReport: vi.fn(),
    sendWhatsAppReport: vi.fn(), getWhatsAppNotifications: vi.fn(), updateWhatsAppSettings: vi.fn(),
    retryWhatsAppNotification: vi.fn(), sendWhatsAppTest: vi.fn(),
  },
}));

import { adminAPI } from '../../../../api/admin';
import WhatsAppSection from '../WhatsAppSection';
import { describeStat } from '../whatsappStats';

const ok = (data) => Promise.resolve({ data: { success: true, data } });
const METRICS = [
  { id: 'pending_verifications', label: 'Pending Website Verifications', description: 'd' },
  { id: 'pending_payouts', label: 'Pending Payouts', description: 'd' },
  { id: 'subscriptions', label: 'Total Subscriptions', description: 'd' },
  { id: 'bought_websites', label: 'Total Bought Websites', description: 'd' },
];
const overview = (over = {}) => ({ config: { masterEnabled: true, configured: true, recipient: '+91******3210', graphApiVersion: 'v23.0' }, settings: { enabled: true, categories: { subscription: true, renewal: true, websitePurchase: true, adminReport: true } }, metrics: METRICS, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  adminAPI.getWhatsAppOverview.mockReturnValue(ok(overview()));
  adminAPI.getWhatsAppReportStats.mockReturnValue(ok({ stats: { pending_verifications: { count: 4 }, pending_payouts: { count: 2, totalAmount: 1500 }, subscriptions: { totalActive: 5, historicalPurchases: 9 }, bought_websites: { total: 10, paid: 8, free: 2 } } }));
  adminAPI.previewWhatsAppReport.mockReturnValue(ok({ message: 'EXACT TEXT', previewToken: 'tok1' }));
  adminAPI.sendWhatsAppReport.mockResolvedValue({ data: { message: 'Report queued' } });
});

describe('describeStat', () => {
  it('summarises backend numbers', () => {
    expect(describeStat('pending_payouts', { count: 1, totalAmount: 1500 })).toContain('1 request');
    expect(describeStat('subscriptions', { totalActive: 5, historicalPurchases: 9 })).toBe('5 active · 9 purchased to date');
    expect(describeStat('x', undefined)).toBe('—');
  });
});

describe('WhatsApp Admin Reports', () => {
  it('shows live counts from the backend on selectable cards', async () => {
    render(<WhatsAppSection />);
    expect(await screen.findByText('4 awaiting review')).toBeInTheDocument();
    expect(screen.getByText(/2 requests · ₹1,500\.00/)).toBeInTheDocument();
  });

  it('supports select all and clear selection, and gates actions on a selection', async () => {
    const user = userEvent.setup();
    render(<WhatsAppSection />);
    await screen.findByText('4 awaiting review');
    const preview = screen.getByRole('button', { name: /preview report/i });
    expect(preview).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /select all/i }));
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(4);
    expect(preview).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    expect(preview).toBeDisabled();
  });

  it('previews only the selected metrics and sends with the preview token', async () => {
    const user = userEvent.setup();
    render(<WhatsAppSection />);
    await user.click(await screen.findByRole('button', { name: /Pending Payouts/ }));
    await user.click(screen.getByRole('button', { name: /preview report/i }));
    expect(adminAPI.previewWhatsAppReport).toHaveBeenCalledWith(['pending_payouts']);
    expect(await screen.findByTestId('whatsapp-preview')).toHaveTextContent('EXACT TEXT');
    await user.click(screen.getByRole('button', { name: /send whatsapp report/i }));
    await waitFor(() => expect(adminAPI.sendWhatsAppReport).toHaveBeenCalledWith(['pending_payouts'], 'tok1'));
  });

  it('never sends blind: Send without a preview only shows the preview first', async () => {
    const user = userEvent.setup();
    render(<WhatsAppSection />);
    await user.click(await screen.findByRole('button', { name: /Total Subscriptions/ }));
    await user.click(screen.getByRole('button', { name: /send whatsapp report/i }));
    expect(await screen.findByTestId('whatsapp-preview')).toBeInTheDocument();
    expect(adminAPI.sendWhatsAppReport).not.toHaveBeenCalled();
  });

  it('a changed selection invalidates the preview, so a stale message is never sent', async () => {
    const user = userEvent.setup();
    render(<WhatsAppSection />);
    await user.click(await screen.findByRole('button', { name: /Pending Payouts/ }));
    await user.click(screen.getByRole('button', { name: /preview report/i }));
    await screen.findByTestId('whatsapp-preview');
    await user.click(screen.getByRole('button', { name: /Total Bought Websites/ }));
    await user.click(screen.getByRole('button', { name: /send whatsapp report/i }));
    expect(adminAPI.sendWhatsAppReport).not.toHaveBeenCalled();
  });

  it('disables sending and explains why when notifications are off on the server', async () => {
    adminAPI.getWhatsAppOverview.mockReturnValue(ok(overview({ config: { masterEnabled: false, configured: true, recipient: '+91******3210', graphApiVersion: 'v23.0' } })));
    const user = userEvent.setup();
    render(<WhatsAppSection />);
    await user.click(await screen.findByRole('button', { name: /Pending Payouts/ }));
    expect(screen.getByRole('button', { name: /send whatsapp report/i })).toBeDisabled();
    expect(screen.getByText(/Sending is unavailable/i)).toBeInTheDocument();
  });

  it('shows a failure state when the overview cannot load', async () => {
    adminAPI.getWhatsAppOverview.mockRejectedValue({ response: { data: { message: 'Nope' } } });
    render(<WhatsAppSection />);
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });
});
