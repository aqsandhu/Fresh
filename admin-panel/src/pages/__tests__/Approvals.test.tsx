// Owner's decision J1: staff entries wait for the city admin, who approves
// each one, rejects it, or approves all. Staff see only their own entries.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { newTestQueryClient } from '@/testDoubles/testQueryClient';
import { Approvals } from '../Approvals';
import { approvalsService } from '@/services/approvals.service';
import { queuedFromResponse, isQueued, QueuedForApproval } from '@/lib/approvalQueue';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
jest.mock('@/components/finance/PurchaseRequests', () => ({ PurchaseRequests: () => null }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/services/approvals.service', () => ({
  approvalsService: { list: jest.fn(), approve: jest.fn(), reject: jest.fn(), approveAll: jest.fn() },
}));
const svc = approvalsService as jest.Mocked<typeof approvalsService>;

const entry = (id: string, label: string, value: number) => ({
  id, kind: 'expense', label, value, status: 'pending' as const, requestedAt: '2026-11-17T09:00:00Z', requestedBy: 'staff-1',
  requestedByName: 'Staff One', decidedAt: null, decidedByName: null, note: null, cityName: 'Gujrat', details: `Rs. ${value} · "repairs"`,
});

const renderPage = () => render(
  <QueryClientProvider client={newTestQueryClient()}><Approvals /></QueryClientProvider>
);

beforeEach(() => {
  svc.approve.mockResolvedValue({ id: 'a' } as never);
  svc.reject.mockResolvedValue({ id: 'a' } as never);
  svc.approveAll.mockResolvedValue({ approved: 2, failed: [] });
});

it('the city admin sees each waiting entry with what it is for', async () => {
  svc.list.mockResolvedValue({ requests: [entry('a', 'an expense', 6000), entry('b', 'a rider payment', 5500)], canDecide: true });
  renderPage();
  expect(await screen.findByText(/an expense — Rs\. 6,000/)).toBeTruthy();
  expect(screen.getByText(/a rider payment — Rs\. 5,500/)).toBeTruthy();
  expect(screen.getAllByText(/Sent by Staff One/)).toHaveLength(2);
});

it('Approve runs one entry; Reject refuses one', async () => {
  svc.list.mockResolvedValue({ requests: [entry('a', 'an expense', 6000), entry('b', 'a rider payment', 5500)], canDecide: true });
  renderPage();
  fireEvent.click((await screen.findAllByRole('button', { name: /^Approve$/ }))[0]);
  await waitFor(() => expect(svc.approve).toHaveBeenCalledWith('a'));
  fireEvent.click((await screen.findAllByRole('button', { name: /Reject/ }))[1]);
  await waitFor(() => expect(svc.reject).toHaveBeenCalledWith('b'));
});

it('Approve all handles every waiting entry at once', async () => {
  svc.list.mockResolvedValue({ requests: [entry('a', 'an expense', 6000), entry('b', 'a rider payment', 5500)], canDecide: true });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /Approve all \(2\)/ }));
  await waitFor(() => expect(svc.approveAll).toHaveBeenCalledTimes(1));
});

it('staff see their own entries but no approve buttons', async () => {
  svc.list.mockResolvedValue({ requests: [entry('a', 'an expense', 6000)], canDecide: false });
  renderPage();
  expect(await screen.findByText(/an expense — Rs\. 6,000/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
});

describe('a 202 "waiting for approval" answer', () => {
  it('becomes QueuedForApproval — never a "saved" success', () => {
    const q = queuedFromResponse(202, { message: 'Sent to the city admin for approval: an expense (Rs. 6,000).', data: { queued: true, requestId: 'r1' } });
    expect(q).toBeInstanceOf(QueuedForApproval);
    expect(isQueued(q)).toBe(true);
    expect(q?.requestId).toBe('r1');
  });
  it('anything else is left alone', () => {
    expect(queuedFromResponse(200, { data: { queued: true } })).toBeNull();
    expect(queuedFromResponse(202, { data: {} })).toBeNull();
    expect(isQueued(new Error('x'))).toBe(false);
  });
});
