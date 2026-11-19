// W16 (round 10): stock management — the per-quality table, every stock action
// with what it still needs (OCP, reason, matching evidence + photo), the
// count warning (A33), approval queue, history, waste report, and G23: a role
// that may only LOOK (products.view) was offered every action the server
// refuses.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StockManagement } from '@/pages/StockManagement';
import { stockService } from '@/services/stock.service';
import { QueuedForApproval } from '@/lib/approvalQueue';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
const mockUser: { role: string; permissions: string[] } = { role: 'admin', permissions: [] };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/stock.service', () => ({
  stockService: {
    overview: jest.fn(), movements: jest.fn(), wasteReport: jest.fn(), waste: jest.fn(), convert: jest.fn(),
    shift: jest.fn(), returnFromOcp: jest.fn(), transfer: jest.fn(), count: jest.fn(),
  },
}));

const toast = require('react-hot-toast').default;
const svc = stockService as jest.Mocked<typeof stockService>;

const aloo = {
  id: 'p1', name: 'Aloo', categoryName: 'Vegetables', unitType: 'kg',
  qualities: [
    { quality: 'A', onHand: 50, reserved: 4, available: 46, central: 40, ocps: [{ id: 'k1', name: 'Kiryana One', qty: 10 }] },
    { quality: 'B', onHand: 8, reserved: 0, available: 8, central: 8, ocps: [] },
  ],
};
const pyaz = { id: 'p2', name: 'Pyaz', categoryName: 'Vegetables', unitType: 'kg', qualities: [{ quality: 'A', onHand: 5, reserved: 0, available: 5, central: 5, ocps: [] }] };

beforeEach(() => {
  mockUser.permissions = ['products.view', 'stock.adjust'];
  svc.overview.mockResolvedValue({ products: [aloo, pyaz], ocps: [{ id: 'k1', name: 'Kiryana One' }, { id: 'k2', name: 'Kiryana Two' }] } as any);
  for (const fn of [svc.waste, svc.convert, svc.shift, svc.returnFromOcp, svc.transfer]) fn.mockResolvedValue({} as any);
  svc.count.mockResolvedValue({ message: 'Count saved — no difference', data: { shortForOpenOrders: 0 } } as any);
  svc.movements.mockResolvedValue([{ id: 'm1', reason: 'stock_purchase', quality: 'A', delta: 50, createdAt: '2026-11-18T05:00:00Z', approvedByName: 'Owner' }] as any);
  svc.wasteReport.mockResolvedValue([{ id: 'w1', productName: 'Aloo', quality: 'B', delta: -2, evidenceQuantity: 2, createdByName: 'Asad', createdAt: '2026-11-18T05:00:00Z', proofUrl: '/p.jpg' }] as any);
});

const rowOf = async (product: string, quality: string) => {
  const card = (await screen.findByText(product, { selector: 'h3' })).closest('.space-y-3') as HTMLElement;
  return within(card).getByText(`Q${quality}`).closest('tr') as HTMLElement;
};
const act = async (product: string, quality: string, title: string) => {
  fireEvent.click(within(await rowOf(product, quality)).getByTitle(title));
  return screen.getByRole('dialog');
};

describe('stock table', () => {
  it('shows each quality\'s system / reserved / available / central and OCP holdings; search narrows', async () => {
    render(<StockManagement />);
    const a = await rowOf('Aloo', 'A');
    expect(within(a).getByText('46')).toBeInTheDocument();
    expect(within(a).getByText('Kiryana One: 10')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search products…'), { target: { value: 'pya' } });
    expect(screen.queryByText('Aloo', { selector: 'h3' })).toBeNull();
    expect(screen.getByText('Pyaz', { selector: 'h3' })).toBeInTheDocument();
  });
});

describe('actions', () => {
  it('send to an OCP needs the OCP and a quantity', async () => {
    render(<StockManagement />);
    const d = await act('Aloo', 'A', 'Send to OCP');
    const send = within(d).getByRole('button', { name: 'Send' });
    fireEvent.change(within(d).getByLabelText(/Quantity/), { target: { value: '5' } });
    expect(within(d).getByRole('status')).toHaveTextContent('Still needed: an OCP.');
    expect(send).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('OCP'), { target: { value: 'k1' } });
    fireEvent.click(send);
    await waitFor(() => expect(svc.shift).toHaveBeenCalledWith({ productId: 'p1', quality: 'A', quantity: 5, ocpId: 'k1' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sent — the OCP must confirm receipt in its portal'));
  });

  it('transfer needs a different "to" OCP', async () => {
    render(<StockManagement />);
    const d = await act('Aloo', 'A', 'Transfer OCP→OCP');
    fireEvent.change(within(d).getByLabelText('From OCP'), { target: { value: 'k1' } });
    expect(within(within(d).getByLabelText('To OCP')).queryByRole('option', { name: 'Kiryana One' })).toBeNull();
    fireEvent.change(within(d).getByLabelText('To OCP'), { target: { value: 'k2' } });
    fireEvent.change(within(d).getByLabelText(/Quantity/), { target: { value: '3' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Transfer' }));
    await waitFor(() => expect(svc.transfer).toHaveBeenCalledWith({ productId: 'p1', quality: 'A', quantity: 3, fromOcpId: 'k1', toOcpId: 'k2' }));
  });

  it('return from an OCP and convert quality (with a reason) are sent', async () => {
    render(<StockManagement />);
    let d = await act('Aloo', 'A', 'Return from OCP');
    fireEvent.change(within(d).getByLabelText('OCP'), { target: { value: 'k1' } });
    fireEvent.change(within(d).getByLabelText(/Quantity/), { target: { value: '2' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Return' }));
    await waitFor(() => expect(svc.returnFromOcp).toHaveBeenCalledWith({ productId: 'p1', quality: 'A', quantity: 2, ocpId: 'k1' }));
    d = await act('Aloo', 'A', 'Convert quality');
    expect(within(d).getByLabelText('Convert to quality')).toHaveValue('B');
    fireEvent.change(within(d).getByLabelText(/Quantity/), { target: { value: '4' } });
    expect(within(d).getByRole('button', { name: 'Convert' })).toBeDisabled(); // no reason yet
    fireEvent.change(within(d).getByLabelText(/Reason/), { target: { value: 'soft spots' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Convert' }));
    await waitFor(() => expect(svc.convert).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', fromQuality: 'A', toQuality: 'B', quantity: 4, note: 'soft spots' })));
  });

  it('waste needs a reason, an evidence quantity EQUAL to the quantity, and a photo', async () => {
    render(<StockManagement />);
    const d = await act('Aloo', 'B', 'Waste');
    const btn = within(d).getByRole('button', { name: 'Waste' });
    fireEvent.change(within(d).getByLabelText(/^Quantity/), { target: { value: '2' } });
    fireEvent.change(within(d).getByLabelText(/Reason/), { target: { value: 'rotten' } });
    fireEvent.change(within(d).getByLabelText(/Evidence quantity/), { target: { value: '1.5' } });
    expect(within(d).getByRole('status')).toHaveTextContent('an evidence quantity equal to the quantity, a proof photo');
    fireEvent.change(within(d).getByLabelText(/Evidence quantity/), { target: { value: '2' } });
    const photo = new File(['x'], 'rotten.jpg', { type: 'image/jpeg' });
    fireEvent.change(within(d).getByLabelText(/Proof image/), { target: { files: [photo] } });
    fireEvent.click(btn);
    await waitFor(() => expect(svc.waste).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', quality: 'B', quantity: 2, evidenceQuantity: 2, note: 'rotten', proofFile: photo })));
  });

  it('a waste that waits for the city admin closes quietly', async () => {
    svc.waste.mockRejectedValueOnce(new QueuedForApproval('Sent for approval', 'r1'));
    render(<StockManagement />);
    const d = await act('Aloo', 'B', 'Waste');
    fireEvent.change(within(d).getByLabelText(/^Quantity/), { target: { value: '1' } });
    fireEvent.change(within(d).getByLabelText(/Reason/), { target: { value: 'rotten' } });
    fireEvent.change(within(d).getByLabelText(/Evidence quantity/), { target: { value: '1' } });
    fireEvent.change(within(d).getByLabelText(/Proof image/), { target: { files: [new File(['x'], 'a.jpg')] } });
    fireEvent.click(within(d).getByRole('button', { name: 'Waste' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a count of 0 is allowed; a count below open orders is saved with a warning (A33)', async () => {
    svc.count.mockResolvedValueOnce({ message: 'Saved — open orders need 4, 4 short', data: { shortForOpenOrders: 4 } } as any);
    render(<StockManagement />);
    const d = await act('Aloo', 'A', 'Count stock');
    fireEvent.change(within(d).getByLabelText(/Quantity you counted/), { target: { value: '0' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Save count' }));
    await waitFor(() => expect(svc.count).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', quality: 'A', countedQuantity: 0 })));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Saved — open orders need 4, 4 short', { duration: 10000 }));
  });
});

describe('history and waste report', () => {
  it('history lists movements; the waste report is per day', async () => {
    render(<StockManagement />);
    const card = (await screen.findByText('Aloo', { selector: 'h3' })).closest('.space-y-3') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /History/ }));
    expect(await screen.findByText(/approved by Owner/)).toBeInTheDocument();
    expect(screen.getByText('+50')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Waste report/ }));
    expect(await screen.findByText(/2 wasted · evidence 2 · by Asad/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-01' } });
    await waitFor(() => expect(svc.wasteReport).toHaveBeenLastCalledWith('2026-11-01'));
  });
});

describe('a role that may only look (G23)', () => {
  it('sees stock, history and the waste report — but no actions the server would refuse', async () => {
    mockUser.permissions = ['products.view'];
    render(<StockManagement />);
    const a = await rowOf('Aloo', 'A');
    for (const title of ['Send to OCP', 'Return from OCP', 'Transfer OCP→OCP', 'Convert quality', 'Count stock', 'Waste']) {
      expect(within(a).queryByTitle(title)).toBeNull();
    }
    expect(screen.getAllByRole('button', { name: /History/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Waste report/ })).toBeInTheDocument();
  });
});
