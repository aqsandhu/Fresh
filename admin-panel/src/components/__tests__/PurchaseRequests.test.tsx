// Owner decision J1: stock purchases entered by staff wait for the city admin,
// who approves them one by one or all at once.
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { newTestQueryClient } from '@/testDoubles/testQueryClient';

const mockService = {
  purchaseRequests: jest.fn(),
  approvePurchase: jest.fn(async () => ({ id: 'x' })),
  rejectPurchase: jest.fn(async () => ({ id: 'x' })),
  approveAllPurchases: jest.fn(async () => ({ approved: 2, skipped: [] })),
};
jest.mock('@/services/finance.service', () => ({ get financeService() { return mockService; } }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));
const mockAuth = { user: { role: 'admin', permissions: ['finance.stock_purchase.approve'] as string[] } };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => mockAuth }));

import { PurchaseRequests } from '@/components/finance/PurchaseRequests';

const row = (id: string, name: string) => ({
  id, productId: 'p', productName: name,
  payload: { rawWeight: 10, purchasePrice: 5000, gradeA: 8, gradeB: 1, gradeC: 0, waste: 1, supplierName: 'Mandi Ali', supplierPhone: null, billNumber: null },
  billPhotoUrl: null, requestedAt: '2026-11-15T10:00:00Z', requestedByName: 'Staff One',
});

const renderIt = () => render(
  <QueryClientProvider client={newTestQueryClient()}>
    <PurchaseRequests />
  </QueryClientProvider>
);

// restoreMocks (jest config) wipes implementations set in the factory, so set them here.
beforeEach(() => {
  mockService.approvePurchase.mockResolvedValue({ id: 'x' });
  mockService.rejectPurchase.mockResolvedValue({ id: 'x' });
  mockService.approveAllPurchases.mockResolvedValue({ approved: 2, skipped: [] });
});

const twoWaiting = () => {
  mockService.purchaseRequests.mockResolvedValue({ requests: [row('a', 'Tomato'), row('b', 'Onion')], canApprove: true });
  return renderIt();
};

it('the city admin sees each entry with its details', async () => {
  twoWaiting();
  expect(await screen.findByText(/waiting for your approval \(2\)/)).toBeTruthy();
  expect(screen.getByText(/Tomato — 10 bought for Rs. 5,000/)).toBeTruthy();
  expect(screen.getAllByText(/From Mandi Ali/)).toHaveLength(2);
});

it('Approve accepts one entry', async () => {
  twoWaiting();
  fireEvent.click((await screen.findAllByRole('button', { name: /^Approve$/ }))[0]);
  await waitFor(() => expect(mockService.approvePurchase).toHaveBeenCalledWith('a'));
});

it('Reject refuses one entry', async () => {
  twoWaiting();
  fireEvent.click((await screen.findAllByRole('button', { name: /Reject/ }))[1]);
  await waitFor(() => expect(mockService.rejectPurchase).toHaveBeenCalledWith('b'));
});

it('Approve all accepts everything at once', async () => {
  twoWaiting();
  fireEvent.click(await screen.findByRole('button', { name: /Approve all/ }));
  await waitFor(() => expect(mockService.approveAllPurchases).toHaveBeenCalledTimes(1));
});

it('staff only see what is still waiting — no approve buttons', async () => {
  mockService.purchaseRequests.mockResolvedValue({ requests: [row('a', 'Tomato')], canApprove: false });
  renderIt();
  expect(await screen.findByText(/Your purchases waiting for approval \(1\)/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
});

it('nothing waiting: nothing is shown', async () => {
  mockService.purchaseRequests.mockResolvedValue({ requests: [], canApprove: true });
  const { container } = renderIt();
  await waitFor(() => expect(mockService.purchaseRequests).toHaveBeenCalled());
  expect(container.querySelector('[data-testid="purchase-requests"]')).toBeNull();
});

it('a role without stock-purchase rights does not ask the server (no "no permission" pop-up)', async () => {
  mockAuth.user.permissions = ['orders.view', 'approvals.decide'];
  mockService.purchaseRequests.mockResolvedValue({ requests: [row('a', 'Tomato')], canApprove: true });
  try {
    const { container } = renderIt();
    await new Promise((r) => setTimeout(r, 20));
    expect(mockService.purchaseRequests).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="purchase-requests"]')).toBeNull();
  } finally {
    mockAuth.user.permissions = ['finance.stock_purchase.approve'];
  }
});
