// W16 (round 10): the Orders page itself — list, filters, status changes
// (single + bulk), rider assignment, payment received, weights, house
// numbers, delete, return to store, live tracking, and what a view-only role
// is (not) offered.
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Orders } from '@/pages/Orders';
import { orderService } from '@/services/order.service';
import { riderService } from '@/services/rider.service';
import { addressService } from '@/services/address.service';
import { printOrderSlips } from '@/lib/orderSlip';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children, onSearch }: { title: string; children: React.ReactNode; onSearch?: (q: string) => void }) => (
    <div>
      <h1>{title}</h1>
      <input aria-label="Search orders" onChange={(e) => onSearch?.(e.target.value)} />
      {children}
    </div>
  ),
}));
const mockUser: { role: string; permissions: string[] } = { role: 'admin', permissions: [] };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
const mockNotify = { isSocketConnected: true, flashingOrderIds: new Set<string>(), newOrderCount: 0, clearNewOrderAlerts: jest.fn() };
jest.mock('@/context/NotificationContext', () => ({ useNotifications: () => mockNotify }));
jest.mock('@/hooks/useBadgeCounts', () => ({ useBadgeCounts: () => ({ data: { consumerOrders: 3, restaurantOrders: 0 } }) }));
const mockSocketHandlers: Record<string, (p?: unknown) => void> = {};
jest.mock('@/services/socket', () => ({
  onSocketEvent: (ev: string, fn: (p?: unknown) => void) => { mockSocketHandlers[ev] = fn; },
  offSocketEvent: jest.fn(),
}));
jest.mock('@/components/ui/GoogleMarkerMap', () => ({ GoogleMarkerMap: () => <div data-testid="rider-map" /> }));
jest.mock('@/components/riders/RiderDetail', () => ({ TaskRowCard: ({ task }: { task: { status: string } }) => <div>task {task.status}</div> }));
jest.mock('@/lib/orderSlip', () => ({ ...jest.requireActual('@/lib/orderSlip'), printOrderSlips: jest.fn() }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/order.service', () => ({
  orderService: {
    getOrders: jest.fn(), getOrderById: jest.fn(), updateOrderStatus: jest.fn(), bulkUpdateOrderStatus: jest.fn(),
    assignRider: jest.fn(), returnToStore: jest.fn(), togglePhoneVisibility: jest.fn(), markPaymentReceived: jest.fn(),
    deleteOrder: jest.fn(), updateItemWeight: jest.fn(), assignToOcp: jest.fn(), setOcpPhoneVisibility: jest.fn(),
  },
}));
jest.mock('@/services/rider.service', () => ({ riderService: { getRiders: jest.fn(), getRiderLocation: jest.fn() } }));
jest.mock('@/services/ocp.service', () => ({ ocpService: { list: jest.fn(async () => []) } }));
jest.mock('@/services/address.service', () => ({
  addressService: { assignHouseNumber: jest.fn(), clearDoorPicture: jest.fn(), clearLocation: jest.fn() },
}));

const toast = require('react-hot-toast').default;
const orders = orderService as jest.Mocked<typeof orderService>;
const riders = riderService as jest.Mocked<typeof riderService>;
const addresses = addressService as jest.Mocked<typeof addressService>;

const FULL = ['orders.view', 'orders.update', 'orders.cancel', 'orders.assign_rider', 'riders.view', 'addresses.update'];

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1', orderNumber: 'ORD-1001', status: 'pending', paymentStatus: 'pending', paymentMethod: 'cash_on_delivery',
  customerName: 'Ali Raza', customerPhone: '03451230001', totalAmount: 500, subtotal: 450, deliveryCharge: 50,
  placedAt: '2026-11-18T05:00:00Z', showCustomerPhone: false, addressId: 'addr-1',
  deliveryAddressSnapshot: { writtenAddress: 'House 5, Street 2', areaName: 'Model Town', city: 'Gujrat', houseNumber: '' },
  items: [], ...over,
});

let listed: any[];
beforeEach(() => {
  mockUser.role = 'admin';
  mockUser.permissions = [...FULL];
  mockNotify.newOrderCount = 0;
  listed = [order(), order({ id: 'o2', orderNumber: 'ORD-1002', status: 'confirmed', customerName: 'Sara Khan' })];
  orders.getOrders.mockImplementation(async () => ({ orders: listed, pagination: { page: 1, limit: 10, total: listed.length, totalPages: 1 } }) as any);
  orders.getOrderById.mockImplementation(async (id: string) => listed.find((o) => o.id === id) as any);
  orders.updateOrderStatus.mockResolvedValue({} as any);
  orders.bulkUpdateOrderStatus.mockResolvedValue({ updated: 2 } as any);
  orders.assignRider.mockResolvedValue({ order: {}, riderPay: 100, payWarning: null } as any);
  riders.getRiders.mockResolvedValue([
    { id: 'r1', fullName: 'Bilal Rider', verificationStatus: 'verified', status: 'available', activeTasks: 0 },
    { id: 'r2', fullName: 'Off Duty', verificationStatus: 'verified', status: 'offline' },
  ] as any);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

const row = async (orderNumber: string) => (await screen.findByText(orderNumber)).closest('tr') as HTMLElement;

describe('Orders list', () => {
  it('lists the orders and filters by status (one "All Statuses" choice, not two)', async () => {
    render(<Orders />);
    expect(await screen.findByText('ORD-1001')).toBeInTheDocument();
    expect(screen.getByText('Sara Khan')).toBeInTheDocument();
    const status = screen.getByLabelText('Status');
    expect(within(status).getAllByRole('option', { name: 'All Statuses' })).toHaveLength(1);
    fireEvent.change(status, { target: { value: 'confirmed' } });
    await waitFor(() => expect(orders.getOrders).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'confirmed', page: 1 })));
  });

  it('search and the Restaurants tab ask the server for the right set', async () => {
    render(<Orders />);
    await screen.findByText('ORD-1001');
    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'ORD-1002' } });
    await waitFor(() => expect(orders.getOrders).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'ORD-1002' })));
    fireEvent.click(screen.getByRole('button', { name: 'Restaurants' }));
    await waitFor(() => expect(orders.getOrders).toHaveBeenLastCalledWith(expect.objectContaining({ restaurant: true })));
  });

  it('shows the unread badge and the new-order counter, which clears on click', async () => {
    mockNotify.newOrderCount = 2;
    render(<Orders />);
    expect(await screen.findByRole('button', { name: /Customer\s*3/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /2 new orders/ }));
    expect(mockNotify.clearNewOrderAlerts).toHaveBeenCalled();
  });

  it('a rider event from the socket reloads the list', async () => {
    render(<Orders />);
    await screen.findByText('ORD-1001');
    const before = orders.getOrders.mock.calls.length;
    act(() => mockSocketHandlers['rider:task_completed']?.());
    await waitFor(() => expect(orders.getOrders.mock.calls.length).toBeGreaterThan(before));
  });
});

describe('status changes', () => {
  it('Update starts on the next step (pending → confirmed), sends it with the note, reloads the list', async () => {
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: 'Update' }));
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByLabelText('New Status') as HTMLSelectElement).value).toBe('confirmed');
    fireEvent.change(within(dialog).getByLabelText('Note (Optional)'), { target: { value: 'called customer' } });
    const before = orders.getOrders.mock.calls.length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update Status' }));
    await waitFor(() => expect(orders.updateOrderStatus).toHaveBeenCalledWith('o1', 'confirmed', 'called customer'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(orders.getOrders.mock.calls.length).toBeGreaterThan(before);
  });

  it('a delivered order cannot be moved: the choice is locked and says why', async () => {
    listed = [order({ status: 'delivered', paymentStatus: 'completed' })];
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: 'Update' }));
    const select = within(screen.getByRole('dialog')).getByLabelText('New Status');
    expect(select).toBeDisabled();
    expect(screen.getByText(/its status can no longer be changed/)).toBeInTheDocument();
  });

  it('bulk: two selected orders are updated together', async () => {
    render(<Orders />);
    await screen.findByText('ORD-1001');
    fireEvent.click(screen.getByLabelText('Select row o1'));
    fireEvent.click(screen.getByLabelText('Select row o2'));
    expect(screen.getByText('2 orders selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));
    const dialog = screen.getByRole('dialog', { name: 'Update 2 Orders' });
    fireEvent.change(within(dialog).getByLabelText('New Status'), { target: { value: 'preparing' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update Status' }));
    await waitFor(() => expect(orders.bulkUpdateOrderStatus).toHaveBeenCalledWith(['o1', 'o2'], 'preparing', ''));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('2 order(s) updated successfully'));
    expect(screen.queryByText('2 orders selected')).toBeNull();
  });

  it('bulk print loads every selected order and prints them', async () => {
    render(<Orders />);
    await screen.findByText('ORD-1001');
    fireEvent.click(screen.getByLabelText('Select all rows'));
    fireEvent.click(screen.getByRole('button', { name: 'Print Slips' }));
    await waitFor(() => expect(printOrderSlips).toHaveBeenCalledWith([expect.objectContaining({ id: 'o1' }), expect.objectContaining({ id: 'o2' })]));
  });

  it('Payment Received asks first; "no" sends nothing, "yes" marks it', async () => {
    orders.markPaymentReceived.mockResolvedValue({} as any);
    render(<Orders />);
    const r = await row('ORD-1001');
    (window.confirm as jest.Mock).mockReturnValueOnce(false);
    fireEvent.click(within(r).getByRole('button', { name: /Payment Received/ }));
    expect(orders.markPaymentReceived).not.toHaveBeenCalled();
    fireEvent.click(within(r).getByRole('button', { name: /Payment Received/ }));
    await waitFor(() => expect(orders.markPaymentReceived).toHaveBeenCalledWith('o1'));
  });
});

describe('riders', () => {
  it('only riders who can take work are offered; picking one assigns and passes on a pay warning', async () => {
    orders.assignRider.mockResolvedValue({ order: {}, riderPay: 0, payWarning: 'No pay rule for this city' } as any);
    render(<Orders />);
    const r = await row('ORD-1001');
    await waitFor(() => expect(within(r).getByRole('option', { name: /Bilal Rider/ })).toBeInTheDocument());
    expect(within(r).queryByRole('option', { name: /Off Duty/ })).toBeNull();
    // G34: the row's rider list has a name (it was an unnamed box for screen readers).
    fireEvent.change(within(r).getByRole('combobox', { name: 'Assign a rider to order ORD-1001' }), { target: { value: 'r1' } });
    await waitFor(() => expect(orders.assignRider).toHaveBeenCalledWith('o1', 'r1'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('No pay rule for this city', expect.anything()));
  });

  it('in the order details, going back to "Select Rider" does not send an empty rider', async () => {
    listed = [order({ riderId: 'r1', riderName: 'Bilal Rider', status: 'confirmed' })];
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: 'View' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Bilal Rider ·/ })).toBeInTheDocument());
    const select = within(dialog).getAllByRole('combobox').pop() as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });
    expect(orders.assignRider).not.toHaveBeenCalled();
  });

  it('Track shows where the rider is; a failed load says so', async () => {
    listed = [order({ riderId: 'r1', riderName: 'Bilal Rider', status: 'out_for_delivery' })];
    riders.getRiderLocation.mockResolvedValueOnce({ latitude: 32.57, longitude: 74.07, accuracy: 8, locationUpdatedAt: '2026-11-18T05:00:00Z' } as any);
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: /Track/ }));
    expect(await screen.findByTestId('rider-map')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute('href', 'https://www.google.com/maps?q=32.57,74.07');
    // A live socket position replaces the old one.
    act(() => mockSocketHandlers['rider:location']?.({ riderId: 'r1', latitude: 32.6, longitude: 74.1 }));
    expect(screen.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute('href', 'https://www.google.com/maps?q=32.6,74.1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    riders.getRiderLocation.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: /Track/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to load rider location'));
  });

  it('a failed delivery with no rider left can be returned to the store (with a reason)', async () => {
    orders.returnToStore.mockResolvedValue({} as any);
    listed = [order({ status: 'out_for_delivery', riderTasks: [{ id: 't1', status: 'failed', notes: 'Customer not home' }] })];
    const prompt = jest.spyOn(window, 'prompt').mockReturnValueOnce(null).mockReturnValueOnce('Customer not home');
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: 'View' }));
    const button = await screen.findByRole('button', { name: 'Return to store' });
    fireEvent.click(button); // cancelled prompt → nothing
    expect(orders.returnToStore).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(orders.returnToStore).toHaveBeenCalledWith('o1', 'Customer not home'));
    expect(prompt).toHaveBeenCalledTimes(2);
  });
});

describe('order details', () => {
  const variable = () =>
    order({
      items: [{ id: 'i1', productName: 'Chicken', quantity: 1, unitPrice: 600, totalPrice: 600, unit: 'full', isVariableWeight: true, finalWeightKg: null }],
    });

  it('a variable-weight item: a bad weight is refused, a good one is saved and the order reloaded', async () => {
    listed = [variable()];
    orders.updateItemWeight.mockResolvedValue({} as any);
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: 'View' }));
    const input = await screen.findByPlaceholderText('kg e.g. 5.3');
    fireEvent.change(input, { target: { value: '-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(toast.error).toHaveBeenCalledWith('Enter a valid weight in kg (e.g. 5.3 = 5 kg 300 g)');
    expect(orders.updateItemWeight).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '5.3' } });
    expect(screen.getByText(/5 kg 300 g/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    await waitFor(() => expect(orders.updateItemWeight).toHaveBeenCalledWith('o1', 'i1', 5.3));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Weight saved — order amount updated'));
  });

  it('the house number can be set from the order', async () => {
    addresses.assignHouseNumber.mockResolvedValue({} as any);
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: 'View' }));
    fireEvent.click(await screen.findByTitle('Edit house number'));
    fireEvent.change(screen.getByPlaceholderText('e.g. H-12, Street 5'), { target: { value: 'H-12' } });
    fireEvent.click(screen.getByTitle('Save'));
    await waitFor(() => expect(addresses.assignHouseNumber).toHaveBeenCalledWith('addr-1', 'H-12'));
    expect(await screen.findByText(/House #: H-12/)).toBeInTheDocument();
  });

  it('the phone switch hides / shows the customer phone for the rider and slip', async () => {
    orders.togglePhoneVisibility.mockResolvedValue({ showCustomerPhone: true } as any);
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: 'View' }));
    expect(await screen.findByText('Phone Number is Hidden')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Phone hidden from slip/ }));
    await waitFor(() => expect(orders.togglePhoneVisibility).toHaveBeenCalledWith('o1', true));
    expect(await screen.findByRole('button', { name: /Phone visible on slip/ })).toBeInTheDocument();
  });

  it('only the super admin may delete an order, and only after confirming', async () => {
    orders.deleteOrder.mockResolvedValue(undefined as any);
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: 'View' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: /Delete Order/ })).toBeNull();
  });

  it('super admin: delete, remove location and remove door picture each ask first', async () => {
    mockUser.role = 'super_admin';
    listed = [order({ addressLatitude: 32.5, addressLongitude: 74.0, addressDoorPictureUrl: '/uploads/door.jpg' })];
    orders.deleteOrder.mockResolvedValue(undefined as any);
    addresses.clearLocation.mockResolvedValue(undefined as any);
    addresses.clearDoorPicture.mockResolvedValue(undefined as any);
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: 'View' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove location' }));
    await waitFor(() => expect(addresses.clearLocation).toHaveBeenCalledWith('addr-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
    await waitFor(() => expect(addresses.clearDoorPicture).toHaveBeenCalledWith('addr-1'));
    (window.confirm as jest.Mock).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: /Delete Order/ }));
    expect(orders.deleteOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Delete Order/ }));
    await waitFor(() => expect(orders.deleteOrder).toHaveBeenCalledWith('o1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('a view-only role (orders.view)', () => {
  beforeEach(() => {
    mockUser.permissions = ['orders.view'];
  });

  it('sees the orders but no Update / Payment Received / rider choice, and riders are not fetched', async () => {
    render(<Orders />);
    const r = await row('ORD-1001');
    expect(within(r).queryByRole('button', { name: 'Update' })).toBeNull();
    expect(within(r).queryByRole('button', { name: /Payment Received/ })).toBeNull();
    expect(within(r).queryByRole('combobox')).toBeNull();
    expect(within(r).getByRole('button', { name: /Hidden/ })).toBeDisabled();
    expect(riders.getRiders).not.toHaveBeenCalled();
  });

  it('is not offered the weight or house-number edits the server would refuse', async () => {
    listed = [order({ items: [{ id: 'i1', productName: 'Chicken', quantity: 1, unitPrice: 600, totalPrice: 600, unit: 'full', isVariableWeight: true }] })];
    render(<Orders />);
    fireEvent.click(within(await row('ORD-1001')).getByRole('button', { name: 'View' }));
    await screen.findByRole('dialog');
    expect(screen.getByText('Variable weight')).toBeInTheDocument(); // still shown, read-only
    expect(screen.queryByRole('button', { name: 'Save weight' })).toBeNull();
    expect(screen.queryByTitle('Edit house number')).toBeNull();
  });
});
