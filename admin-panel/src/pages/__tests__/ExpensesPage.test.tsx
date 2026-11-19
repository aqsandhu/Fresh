// W16 (round 10): the Expenses page — what each role sees (G22: the "no list
// for your role" text showed "quot;" garbage), period / type filters reach the
// server, per-type totals, stock purchase (seller required, A+B+C+waste must
// equal the raw weight, pending vs applied), and an expense that needs a
// second admin or waits for approval.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Expenses } from '@/pages/Expenses';
import { financeService } from '@/services/finance.service';
import { QueuedForApproval } from '@/lib/approvalQueue';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
jest.mock('@/components/finance/PurchaseRequests', () => ({ PurchaseRequests: () => null }));
const mockUser: { role: string; permissions: string[] } = { role: 'admin', permissions: [] };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/finance.service', () => ({
  financeService: { listExpenses: jest.fn(), products: jest.fn(), addStockPurchase: jest.fn(), addExpense: jest.fn() },
}));

const toast = require('react-hot-toast').default;
const svc = financeService as jest.Mocked<typeof financeService>;

beforeEach(() => {
  mockUser.permissions = ['finance.expenses.view', 'finance.expenses.create', 'finance.stock_purchase.create'];
  svc.listExpenses.mockResolvedValue({
    total: 7500,
    byType: { stockPurchase: 5000, riderPayment: 1500, other: 1000 },
    expenses: [
      { id: 'e1', type: 'stock_purchase', amount: 5000, incurredAt: '2026-11-18T05:00:00Z', refLabel: 'Aloo 50 kg', supplierName: 'Mandi Ali', billNumber: '77', billPhotoUrl: '/b.jpg' },
      { id: 'e2', type: 'other', amount: 1000, incurredAt: '2026-11-18T06:00:00Z', category: 'Rent', comment: 'Shop rent' },
      { id: 'e3', type: 'stock_purchase', amount: 1500, incurredAt: '2026-11-18T07:00:00Z', refLabel: 'Pyaz' },
    ],
  } as any);
  svc.products.mockResolvedValue([{ id: 'p1', name: 'Aloo', categoryName: 'Vegetables', unitType: 'kg' }] as any);
  svc.addStockPurchase.mockResolvedValue({ status: 'applied' } as any);
  svc.addExpense.mockResolvedValue({ id: 'x' } as any);
});

describe('list', () => {
  it('shows totals per type (camelCased keys) and each row with its seller / bill', async () => {
    render(<Expenses />);
    expect(await screen.findByText('Aloo 50 kg')).toBeInTheDocument();
    expect(screen.getByText('Rs. 7,500')).toBeInTheDocument();
    expect(screen.getByText(/from Mandi Ali/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'bill photo' })).toHaveAttribute('href', '/b.jpg');
    expect(screen.getByText('supplier not recorded')).toBeInTheDocument();
  });

  it('period and type filters reach the server', async () => {
    render(<Expenses />);
    await waitFor(() => expect(svc.listExpenses).toHaveBeenCalledWith({ period: 'today' }));
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    await waitFor(() => expect(svc.listExpenses).toHaveBeenLastCalledWith({ period: 'month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Specific month' }));
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2025' } });
    await waitFor(() => expect(svc.listExpenses).toHaveBeenLastCalledWith({ month: 3, year: 2025 }));
    fireEvent.click(screen.getByRole('button', { name: 'Specific day' }));
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Expense type filter'), { target: { value: 'rider_payment' } });
    await waitFor(() => expect(svc.listExpenses).toHaveBeenLastCalledWith({ date: '2026-11-01', type: 'rider_payment' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(svc.listExpenses).toHaveBeenLastCalledWith({ type: 'rider_payment' }));
  });

  it('a role that may only ENTER expenses gets the buttons and a readable note — no list call (G22)', () => {
    mockUser.permissions = ['finance.expenses.create'];
    render(<Expenses />);
    expect(screen.getByText(/visible only to roles with "View expenses"\./)).toBeInTheDocument();
    expect(screen.queryByText(/quot;/)).toBeNull();
    expect(screen.getByRole('button', { name: /Add expense/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stock purchase/ })).toBeNull();
    expect(svc.listExpenses).not.toHaveBeenCalled();
  });
});

describe('stock purchase', () => {
  const open = async () => {
    render(<Expenses />);
    fireEvent.click(screen.getByRole('button', { name: /Stock purchase/ }));
    const d = screen.getByRole('dialog', { name: 'Stock purchase' });
    await waitFor(() => expect(within(d).getByRole('option', { name: /Aloo/ })).toBeInTheDocument());
    return d;
  };

  it('needs a seller and a balanced grading before it can be sent', async () => {
    const d = await open();
    const buy = within(d).getByRole('button', { name: 'Purchase' });
    fireEvent.change(within(d).getByLabelText('Product'), { target: { value: 'p1' } });
    fireEvent.change(within(d).getByLabelText(/Raw weight/), { target: { value: '10' } });
    fireEvent.change(within(d).getByLabelText(/Purchase price/), { target: { value: '1200' } });
    fireEvent.change(within(d).getByLabelText(/Quality A/), { target: { value: '7' } });
    fireEvent.change(within(d).getByLabelText(/Waste/), { target: { value: '1' } });
    expect(within(d).getByText(/2 kg unaccounted/)).toBeInTheDocument();
    expect(buy).toBeDisabled();
    fireEvent.change(within(d).getByLabelText(/Quality B/), { target: { value: '2' } });
    expect(within(d).getByText(/balanced/)).toBeInTheDocument();
    expect(buy).toBeDisabled(); // no seller yet
    fireEvent.change(within(d).getByLabelText(/Bought from/), { target: { value: 'Mandi Ali' } });
    fireEvent.click(buy);
    await waitFor(() => expect(svc.addStockPurchase).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'p1', rawWeight: 10, purchasePrice: 1200, gradeA: 7, gradeB: 2, gradeC: 0, waste: 1, supplierName: 'Mandi Ali', billPhoto: null,
    })));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Stock purchased & added to stock'));
  });

  it('a staff entry that waits for the city admin says so', async () => {
    svc.addStockPurchase.mockResolvedValue({ status: 'pending' } as any);
    const d = await open();
    fireEvent.change(within(d).getByLabelText('Product'), { target: { value: 'p1' } });
    fireEvent.change(within(d).getByLabelText(/Raw weight/), { target: { value: '5' } });
    fireEvent.change(within(d).getByLabelText(/Purchase price/), { target: { value: '500' } });
    fireEvent.change(within(d).getByLabelText(/Quality A/), { target: { value: '5' } });
    fireEvent.change(within(d).getByLabelText(/Bought from/), { target: { value: 'Mandi Ali' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Purchase' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Entered — waiting for the city admin to approve'));
  });
});

describe('other expense', () => {
  const fill = () => {
    fireEvent.click(screen.getByRole('button', { name: /Add expense/ }));
    const d = screen.getByRole('dialog', { name: 'Add expense' });
    fireEvent.change(within(d).getByLabelText('Expense type'), { target: { value: 'Rent' } });
    fireEvent.change(within(d).getByLabelText(/Amount/), { target: { value: '25000' } });
    return d;
  };

  it('is added with type, amount and time', async () => {
    render(<Expenses />);
    const d = fill();
    fireEvent.click(within(d).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(svc.addExpense).toHaveBeenCalledWith(expect.objectContaining({ category: 'Rent', amount: 25000, approvalPhone: undefined })));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Expense added'));
  });

  it('a big one asks for a second admin; waiting for approval closes the form quietly', async () => {
    svc.addExpense.mockRejectedValueOnce({ response: { data: { message: 'A second admin must approve amounts above Rs. 20,000' } } });
    render(<Expenses />);
    const d = fill();
    fireEvent.click(within(d).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A second admin must approve amounts above Rs. 20,000'));
    svc.addExpense.mockRejectedValueOnce(new QueuedForApproval('Sent to the city admin.', 'r1'));
    fireEvent.click(within(d).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
