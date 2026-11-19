// W16 (round 10): complaints — tabs with counts, open a ticket, reply + status,
// refund (capped, reason required, waits for approval), replacement order, and
// G26: Refund needs orders.refund and a replacement needs orders.update (the
// server's / the WhatsApp page's codes) — both were offered on
// complaints.manage and refused.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Complaints } from '@/pages/Complaints';
import { feedbackService } from '@/services/feedback.service';
import { QueuedForApproval } from '@/lib/approvalQueue';
import { ROUTER_FUTURE } from '@/lib/routerFuture';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
const mockUser: { role: string; permissions: string[] } = { role: 'admin', permissions: [] };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCityId: 'c1' }) }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/feedback.service', () => ({
  feedbackService: { listComplaints: jest.fn(), updateComplaint: jest.fn(), getComplaint: jest.fn(), refundComplaint: jest.fn() },
}));

const toast = require('react-hot-toast').default;
const svc = feedbackService as jest.Mocked<typeof feedbackService>;

const ticket = {
  id: 'cm1', ticketNumber: 'CMP-1001', status: 'open', category: 'product_quality', subject: 'Rotten tomatoes',
  message: 'Half the tomatoes were rotten', customerName: 'Ali Raza', customerPhone: '03451230001',
  orderId: 'o1', orderNumber: 'ORD-77', createdAt: '2026-11-18T05:00:00Z', images: ['/c/1.jpg'], adminResponse: null,
};

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin/complaints']} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/admin/complaints" element={<Complaints />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
const open = async () => {
  fireEvent.click(await screen.findByText('Rotten tomatoes'));
  return (await screen.findByText('Half the tomatoes were rotten')).closest('.border-t') as HTMLElement;
};

beforeEach(() => {
  mockUser.permissions = ['complaints.view', 'complaints.manage', 'orders.update', 'orders.refund'];
  svc.listComplaints.mockResolvedValue({ complaints: [ticket], counts: { open: 1, inProgress: 2 } } as any);
  svc.updateComplaint.mockResolvedValue({} as any);
  svc.getComplaint.mockResolvedValue({ ...ticket, order: { totalAmount: 900, paidAmount: 900, refundedTotal: 200, refundable: 700, refunds: [{ id: 'rf1', amount: 200, source: 'admin', note: 'missing item', createdAt: '2026-11-18T06:00:00Z' }] } } as any);
  svc.refundComplaint.mockResolvedValue({ id: 'rf2' } as any);
});

describe('complaints', () => {
  it('tabs show counts (camelCased too) and filter on the server', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Open (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In progress (2)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Resolved/ }));
    await waitFor(() => expect(svc.listComplaints).toHaveBeenLastCalledWith('resolved'));
  });

  it('a ticket opens with the message and photos; reply + status are saved', async () => {
    renderPage();
    const body = await open();
    expect(within(body).getByRole('img', { name: 'Complaint photo 1' })).toHaveAttribute('src', expect.stringContaining('/c/1.jpg'));
    fireEvent.change(within(body).getByLabelText('Status'), { target: { value: 'resolved' } });
    fireEvent.change(within(body).getByLabelText('Response to customer'), { target: { value: 'Sorry — refunded.' } });
    fireEvent.click(within(body).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.updateComplaint).toHaveBeenCalledWith('cm1', { status: 'resolved', adminResponse: 'Sorry — refunded.' }));
  });

  it('refund: prefilled with what is left, needs a reason, sends amount + source + note', async () => {
    renderPage();
    const body = await open();
    expect(await within(body).findByText(/refundable Rs\. 700/)).toBeInTheDocument();
    expect(within(body).getByText(/Rs\. 200 · admin · missing item/)).toBeInTheDocument();
    fireEvent.click(within(body).getByRole('button', { name: /Refund/ }));
    const d = screen.getByRole('dialog', { name: 'Record refund' });
    expect(within(d).getByLabelText('Amount (Rs.)')).toHaveValue(700);
    fireEvent.change(within(d).getByLabelText('Amount (Rs.)'), { target: { value: '300' } });
    expect(within(d).getByRole('button', { name: 'Refund' })).toBeDisabled(); // no reason yet
    fireEvent.change(within(d).getByLabelText('Reason (required)'), { target: { value: 'half rotten' } });
    fireEvent.change(within(d).getByLabelText(/collected by/), { target: { value: 'ocp' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Refund' }));
    await waitFor(() => expect(svc.refundComplaint).toHaveBeenCalledWith('cm1', { amount: 300, source: 'ocp', note: 'half rotten' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Refund recorded'));
  });

  it('a big refund that waits for the city admin closes the form quietly', async () => {
    svc.refundComplaint.mockRejectedValueOnce(new QueuedForApproval('Sent to the city admin', 'r1'));
    renderPage();
    const body = await open();
    fireEvent.click(await within(body).findByRole('button', { name: /Refund/ }));
    const d = screen.getByRole('dialog', { name: 'Record refund' });
    fireEvent.change(within(d).getByLabelText('Reason (required)'), { target: { value: 'all rotten' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Refund' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('nothing left to refund → Refund is off; Send replacement opens the linked WhatsApp order', async () => {
    svc.getComplaint.mockResolvedValue({ ...ticket, order: { paidAmount: 900, refundedTotal: 900, refundable: 0, refunds: [] } } as any);
    renderPage();
    const body = await open();
    await within(body).findByText(/refundable Rs\. 0/);
    expect(within(body).getByRole('button', { name: /Refund/ })).toBeDisabled();
    fireEvent.click(within(body).getByRole('button', { name: /Send replacement/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/whatsapp-orders?replacementFor=o1&complaintId=cm1');
  });
});

describe('what each role is offered (G26)', () => {
  it('complaints.manage WITHOUT orders.refund / orders.update: can reply, cannot refund or send a replacement', async () => {
    mockUser.permissions = ['complaints.view', 'complaints.manage'];
    renderPage();
    const body = await open();
    expect(within(body).getByRole('button', { name: 'Save' })).toBeEnabled();
    await within(body).findByText(/refundable/);
    expect(within(body).getByRole('button', { name: /Refund/ })).toBeDisabled();
    expect(within(body).getByRole('button', { name: /Send replacement/ })).toBeDisabled();
  });

  it('orders.refund alone may refund', async () => {
    mockUser.permissions = ['complaints.view', 'orders.refund'];
    renderPage();
    const body = await open();
    await within(body).findByText(/refundable Rs\. 700/);
    expect(within(body).getByRole('button', { name: /Refund/ })).toBeEnabled();
    expect(within(body).getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
