// Bug A26 (round 6): a shareholder payout pays ONE period and is recorded
// against it. The pay form must say which period, send that period, and never
// prefill an all-time number as if it were this month's.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { newTestQueryClient } from '@/testDoubles/testQueryClient';
import { Profit } from '../Profit';
import { financeService } from '@/services/finance.service';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
const mockPerms: { list: string[] } = { list: ['finance.profit.view', 'finance.shareholders.view', 'finance.shareholders.pay'] };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: { role: 'admin', permissions: mockPerms.list } }) }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/services/finance.service', () => ({
  financeService: {
    getProfit: jest.fn(), listShareholders: jest.fn(), getProfitSettings: jest.fn(), updateProfitSettings: jest.fn(),
    payShareholder: jest.fn(), createShareholder: jest.fn(), updateShareholder: jest.fn(),
  },
}));
const svc = financeService as jest.Mocked<typeof financeService>;

const holder = { id: 'sh-1', name: 'Ali Partner', email: 'ali@example.com', status: 'active', sharePercent: 50, share: 5000, received: 0, pending: 1000, balance: 4000 };

const renderPage = () => render(
  <QueryClientProvider client={newTestQueryClient()}><Profit /></QueryClientProvider>
);

beforeEach(() => {
  svc.getProfit.mockResolvedValue({
    needsCity: false, ready: true, totalSale: 10000, orderCount: 1, totalExpenses: 0, profit: 10000, freshbazarShare: 0, distributable: 10000,
    settings: { enabled: false, mode: 'per_order_fixed', perOrder: 0, marginPercent: 0 }, shareholders: [holder],
  } as any);
  svc.listShareholders.mockResolvedValue({ needsCity: false, canManage: false, shareholders: [] });
  svc.getProfitSettings.mockResolvedValue({ needsCity: false, canEdit: false, settings: { enabled: false, mode: 'per_order_fixed', perOrder: 0, marginPercent: 0 }, categoryShares: [] });
  svc.payShareholder.mockResolvedValue({ id: 'p-1' } as any);
});

it('pays this month by default: says so, prefills what is left, sends this month', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /Pay/ }));
  expect(screen.getByTestId('pay-period').textContent).toMatch(/for this month/);
  expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('4000');
  fireEvent.click(screen.getByRole('button', { name: 'Send payment' }));
  await waitFor(() => expect(svc.payShareholder).toHaveBeenCalledWith('sh-1', { amount: 4000, note: undefined }, { period: 'month' }));
});

it('a chosen month is the period paid and named', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Specific month' }));
  fireEvent.click(await screen.findByRole('button', { name: /Pay/ }));
  expect(screen.getByTestId('pay-period').textContent).toMatch(/for [A-Z][a-z]{2} \d{4}/);
});

it('the all-time view pays this month and prefills nothing', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'All time' }));
  await waitFor(() => expect(svc.getProfit).toHaveBeenLastCalledWith({}));
  fireEvent.click(await screen.findByRole('button', { name: /Pay/ }));
  expect(screen.getByText(/counts for this month/)).toBeTruthy();
  expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('');
});

// G12 (round 7, permission sweep): a formula-only role must not ask for the
// profit report (refused) — it sees the formula and a plain note instead.
it('a profit-formula-only role sees the formula, not the report, and makes no refused call', async () => {
  mockPerms.list = ['finance.profit.manage'];
  try {
    renderPage();
    expect(await screen.findByText(/visible only to roles with/)).toBeTruthy();
    expect(svc.getProfit).not.toHaveBeenCalled();
    expect(svc.listShareholders).not.toHaveBeenCalled();
    await waitFor(() => expect(svc.getProfitSettings).toHaveBeenCalled());
  } finally {
    mockPerms.list = ['finance.profit.view', 'finance.shareholders.view', 'finance.shareholders.pay'];
  }
});
