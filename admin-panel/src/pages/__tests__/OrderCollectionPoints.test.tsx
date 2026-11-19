// W16 (round 10): order collection points — points (add / edit / switch /
// remove), sending stock in base units, settlements (receive with password,
// blocked by open shortages, reject), shortages, and which tabs each OCP
// permission opens (G18: tabs the server refuses were shown to every role).
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OrderCollectionPoints } from '@/pages/OrderCollectionPoints';
import { ocpService } from '@/services/ocp.service';
import { productService } from '@/services/product.service';
import { api } from '@/services/api';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
const mockUser: { role: string; permissions: string[] } = { role: 'admin', permissions: [] };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/ocp.service', () => ({
  ocpService: {
    list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(), sendStock: jest.fn(),
    listSettlements: jest.fn(), receiveSettlement: jest.fn(), rejectSettlement: jest.fn(),
    listShortages: jest.fn(), resolveShortage: jest.fn(),
  },
}));
jest.mock('@/services/product.service', () => ({ productService: { getProducts: jest.fn() } }));
jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));

const toast = require('react-hot-toast').default;
const ocp = ocpService as jest.Mocked<typeof ocpService>;

const points = [
  { id: 'k1', name: 'Kiryana One', phone: '03001110001', city: 'Gujrat', cityId: 'c1', status: 'active', orderCount: 4, openShortageCount: 1, address: 'Main Bazar' },
  { id: 'k2', name: 'Closed Shop', phone: '03001110002', city: 'Gujrat', cityId: 'c1', status: 'disabled', orderCount: 0 },
];

beforeEach(() => {
  mockUser.permissions = ['ocp.manage'];
  ocp.list.mockResolvedValue(points as any);
  ocp.create.mockResolvedValue({} as any);
  ocp.update.mockResolvedValue({} as any);
  ocp.sendStock.mockResolvedValue({} as any);
  ocp.listSettlements.mockResolvedValue([
    { id: 'st1', amount: 1500, ocpName: 'Kiryana One', orderCount: 3, requestedAt: '2026-11-18T05:00:00Z', openShortageCount: 0 },
    { id: 'st2', amount: 700, ocpName: 'Kiryana One', orderCount: 1, requestedAt: '2026-11-18T06:00:00Z', openShortageCount: 2 },
  ] as any);
  ocp.receiveSettlement.mockResolvedValue({} as any);
  ocp.rejectSettlement.mockResolvedValue({} as any);
  ocp.listShortages.mockResolvedValue([
    { id: 'sh1', status: 'open', productName: 'Aloo', quality: 'A', ocpName: 'Kiryana One', shortageQty: 1.5, orderNumber: 'ORD-1', createdAt: '2026-11-18T05:00:00Z' },
  ] as any);
  ocp.resolveShortage.mockResolvedValue({} as any);
  (api.get as jest.Mock).mockResolvedValue({ data: [{ id: 'c1', name: 'Gujrat' }, { id: 'c2', name: 'Lahore' }] });
  (productService.getProducts as jest.Mock).mockResolvedValue({
    products: [{ id: 'p1', nameEn: 'Aloo', unitType: 'kg', priceB: 80, allowHalfKg: true, categoryName: 'Veg' }],
  });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

const card = async (name: string) => (await screen.findByText(name)).closest('.space-y-2') as HTMLElement;

describe('collection points', () => {
  it('lists points with city, orders and open shortages; a disabled point cannot get stock', async () => {
    render(<OrderCollectionPoints />);
    const one = await card('Kiryana One');
    expect(within(one).getByText('4 orders')).toBeInTheDocument();
    expect(within(one).getByText('1 open shortage')).toBeInTheDocument();
    expect(within(await card('Closed Shop')).queryByRole('button', { name: /Send stock/ })).toBeNull();
  });

  it('adds a point with login phone, PIN and city', async () => {
    render(<OrderCollectionPoints />);
    fireEvent.click(await screen.findByRole('button', { name: /Add OCP/ }));
    const d = screen.getByRole('dialog', { name: 'Add OCP' });
    fireEvent.change(within(d).getByLabelText(/^Name/), { target: { value: 'New Point' } });
    fireEvent.change(within(d).getByLabelText(/Phone/), { target: { value: '03004445555' } });
    fireEvent.change(within(d).getByLabelText(/PIN/), { target: { value: '4826' } });
    await waitFor(() => expect(within(d).getByRole('option', { name: 'Lahore' })).toBeInTheDocument());
    fireEvent.change(within(d).getByLabelText('City'), { target: { value: 'c2' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(ocp.create).toHaveBeenCalledWith({ name: 'New Point', phone: '03004445555', pin: '4826', cityId: 'c2', ownerName: '', address: '' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('OCP created'));
  });

  it('editing never changes the login phone and sends a PIN only when one is typed', async () => {
    render(<OrderCollectionPoints />);
    fireEvent.click(within(await card('Kiryana One')).getByTitle('Edit'));
    const d = screen.getByRole('dialog', { name: 'Edit OCP' });
    expect(within(d).getByLabelText(/Phone/)).toBeDisabled();
    fireEvent.change(within(d).getByLabelText(/^Name/), { target: { value: 'Kiryana 1' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(ocp.update).toHaveBeenCalledWith('k1', { name: 'Kiryana 1', owner_name: '', address: 'Main Bazar', city_id: 'c1' }));
  });

  it('switch on / off, and remove after confirming', async () => {
    ocp.remove.mockResolvedValue(undefined as any);
    render(<OrderCollectionPoints />);
    const two = await card('Closed Shop');
    fireEvent.click(within(two).getByTitle('Toggle status'));
    await waitFor(() => expect(ocp.update).toHaveBeenCalledWith('k2', { status: 'active' }));
    (window.confirm as jest.Mock).mockReturnValueOnce(false);
    fireEvent.click(within(two).getByTitle('Remove'));
    expect(ocp.remove).not.toHaveBeenCalled();
    fireEvent.click(within(two).getByTitle('Remove'));
    await waitFor(() => expect(ocp.remove).toHaveBeenCalledWith('k2'));
  });
});

describe('sending stock', () => {
  it('quantities are converted to base units (4 × ½ kg = 2 kg) per quality', async () => {
    render(<OrderCollectionPoints />);
    fireEvent.click(within(await card('Kiryana One')).getByRole('button', { name: /Send stock/ }));
    const d = screen.getByRole('dialog', { name: 'Send stock to Kiryana One' });
    expect(within(d).getByRole('button', { name: /^Send$/ })).toBeDisabled();
    fireEvent.change(await within(d).findByLabelText('Aloo quality A unit'), { target: { value: 'half_kg' } });
    fireEvent.change(within(d).getByLabelText('Aloo quality A quantity'), { target: { value: '4' } });
    fireEvent.change(within(d).getByLabelText('Aloo quality B quantity'), { target: { value: '1.25' } });
    expect(within(d).getByText('2 items to send')).toBeInTheDocument();
    fireEvent.click(within(d).getByRole('button', { name: /^Send$/ }));
    await waitFor(() => expect(ocp.sendStock).toHaveBeenCalledWith('k1', [
      { productId: 'p1', quality: 'A', quantity: 2 },
      { productId: 'p1', quality: 'B', quantity: 1.25 },
    ]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Stock sent — OCP will verify & receive'));
  });
});

describe('settlements and shortages', () => {
  it('pending settlements: total, receive with password, blocked while shortages are open, reject', async () => {
    render(<OrderCollectionPoints />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settlements' }));
    expect(await screen.findByText('Rs. 2,200')).toBeInTheDocument();
    const receives = screen.getAllByRole('button', { name: /Receive/ });
    expect(receives[1]).toBeDisabled(); // 2 open shortages
    fireEvent.click(receives[0]);
    const d = screen.getByRole('dialog', { name: 'Confirm cash received' });
    expect(within(d).getByRole('button', { name: 'Confirm receive' })).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('Your password'), { target: { value: 'Manager123' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Confirm receive' }));
    await waitFor(() => expect(ocp.receiveSettlement).toHaveBeenCalledWith('st1', 'Manager123'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    await waitFor(() => expect(ocp.rejectSettlement).toHaveBeenCalledWith('st1'));
    fireEvent.click(screen.getByRole('button', { name: 'received' }));
    await waitFor(() => expect(ocp.listSettlements).toHaveBeenLastCalledWith('received'));
  });

  it('a shortage is resolved with a note and the admin\'s password', async () => {
    render(<OrderCollectionPoints />);
    fireEvent.click(await screen.findByRole('button', { name: 'Shortages' }));
    expect(await screen.findByText(/Kiryana One · short 1.5/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Resolve/ }));
    const d = screen.getByRole('dialog', { name: 'Resolve shortage' });
    fireEvent.change(within(d).getByLabelText('Resolution note'), { target: { value: 'Paid from OCP cash' } });
    expect(within(d).getByRole('button', { name: 'Resolve' })).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('Your password'), { target: { value: 'Manager123' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(ocp.resolveShortage).toHaveBeenCalledWith('sh1', { note: 'Paid from OCP cash', password: 'Manager123' }));
  });
});

describe('what each OCP permission opens (G18)', () => {
  it('stock-send only: points + Send stock; no settlements / shortages tabs, no management', async () => {
    mockUser.permissions = ['ocp.stock.send'];
    render(<OrderCollectionPoints />);
    expect(within(await card('Kiryana One')).getByRole('button', { name: /Send stock/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settlements' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Shortages' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add OCP/ })).toBeNull();
    expect(ocp.listSettlements).not.toHaveBeenCalled();
  });

  it('settlements only: the Settlements tab, not Shortages', async () => {
    mockUser.permissions = ['ocp.settlements.receive'];
    render(<OrderCollectionPoints />);
    expect(await screen.findByRole('button', { name: 'Settlements' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shortages' })).toBeNull();
  });
});
