// W16 (round 10): placing an order on a customer's behalf — lookup, saved
// address vs typed address, quality / unit prices, delivery charge (slot,
// free slot, urgent, threshold), tomorrow's date, complaint replacements, and
// an order that waits for approval (B35).
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WhatsAppOrders } from '@/pages/WhatsAppOrders';
import { whatsappService } from '@/services/whatsapp.service';
import { productService } from '@/services/product.service';
import { api } from '@/services/api';
import { QueuedForApproval } from '@/lib/approvalQueue';
import { ROUTER_FUTURE } from '@/lib/routerFuture';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
const mockUser: { role: string; permissions: string[] } = { role: 'admin', permissions: [] };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('@/pages/RestaurantWhatsAppOrder', () => ({ RestaurantWhatsAppOrder: () => <div>restaurant order form</div> }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/whatsapp.service', () => ({ whatsappService: { lookupCustomer: jest.fn(), createOrder: jest.fn() } }));
jest.mock('@/services/product.service', () => ({ productService: { getProducts: jest.fn() } }));
jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));

const toast = require('react-hot-toast').default;
const wa = whatsappService as jest.Mocked<typeof whatsappService>;
const products = productService as jest.Mocked<typeof productService>;
const apiGet = api.get as jest.Mock;

const aloo = {
  id: 'p1', nameEn: 'Aloo', unitType: 'kg', price: 100, priceB: 80, halfKgPriceB: 45,
  allowHalfKg: true, allowQuarterKg: false, qualifiesForFreeDelivery: true,
};
const ghee = { id: 'p2', nameEn: 'Ghee', unitType: 'pack', price: 600, qualifiesForFreeDelivery: false };
const slots = [
  { id: 's-std', slotName: 'Evening', startTime: '17:00:00', endTime: '23:59:00', availableSlots: 5 },
  { id: 's-free', slotName: 'Free Evening', startTime: '18:00:00', endTime: '23:59:00', availableSlots: 5, isFreeDeliverySlot: true },
  { id: 's-full', slotName: 'Full Slot', startTime: '19:00:00', endTime: '23:59:00', availableSlots: 0 },
];
const pad = (n: number) => String(n).padStart(2, '0');
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

beforeEach(() => {
  mockUser.permissions = ['products.view', 'orders.update'];
  products.getProducts.mockResolvedValue({ products: [aloo, ghee] } as any);
  apiGet.mockImplementation(async (url: string) =>
    url === '/site-settings/delivery'
      ? { data: { baseCharge: 100, freeDeliveryThreshold: 500, urgentCharge: 150, urgentEnabled: true, urgentEta: '45 min' } }
      : { data: slots });
  wa.lookupCustomer.mockResolvedValue({
    customer: { id: 'u1', fullName: 'Ali Raza' },
    addresses: [{ id: 'a1', writtenAddress: 'Street 4', areaName: 'Model Town', city: 'Gujrat', houseNumber: '12', latitude: 32.5, longitude: 74.0, hasLocation: true, isDefault: true }],
  } as any);
  wa.createOrder.mockResolvedValue({ id: 'o1' });
});

const renderPage = (url = '/whatsapp-orders') =>
  render(<MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}><WhatsAppOrders /></MemoryRouter>);

const number = () => screen.getByPlaceholderText('+923XXXXXXXXX');
async function lookUp(phone = '03451230001') {
  fireEvent.change(number(), { target: { value: phone } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up customer' }));
  await screen.findByText(/Existing customer: Ali Raza/);
}
async function pickAlooHalfKgB() {
  await waitFor(() => expect(within(screen.getByLabelText('Product 1')).getByRole('option', { name: 'Aloo' })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: 'p1' } });
  fireEvent.change(screen.getByLabelText('Quality 1'), { target: { value: 'B' } });
  fireEvent.change(screen.getByLabelText('Unit 1'), { target: { value: 'half_kg' } });
  fireEvent.click(screen.getByLabelText('Increase quantity 1'));
}
const summary = (label: string) => (screen.getByText(label).parentElement as HTMLElement).textContent;

describe('customer lookup', () => {
  it('no number → asks for one; unknown number → new customer; error → says so', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Look up customer' }));
    expect(toast.error).toHaveBeenCalledWith('Enter a phone number first');
    wa.lookupCustomer.mockResolvedValueOnce({ customer: null, addresses: [] });
    fireEvent.change(number(), { target: { value: '03009999999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up customer' }));
    expect(await screen.findByText(/New number — a customer record is created/)).toBeInTheDocument();
    wa.lookupCustomer.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(screen.getByRole('button', { name: 'Look up customer' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Lookup failed'));
  });

  it('a known customer fills the name and the default saved address with its pin', async () => {
    renderPage();
    await lookUp();
    expect(screen.getByLabelText('Customer Name', { exact: false })).toHaveValue('Ali Raza');
    expect(screen.getByLabelText('Address *')).toHaveValue('House 12, Street 4, Model Town, Gujrat');
    expect(screen.getByLabelText('Latitude (optional)')).toHaveValue('32.5');
    expect(screen.getByRole('link', { name: /View pinned location/ })).toBeInTheDocument();
  });
});

describe('pricing and delivery', () => {
  it('quality B half-kg uses its own price; below the threshold delivery is charged and the gap shown', async () => {
    renderPage();
    await pickAlooHalfKgB();
    expect(screen.getByText('Rs. 45')).toBeInTheDocument(); // explicit B half-kg price, not 80 / 2
    expect(summary('Items subtotal')).toContain('Rs. 90');
    expect(summary('Delivery charge')).toContain('Rs. 100');
    expect(screen.getByText(/Add Rs. 410 more in free-delivery-eligible items/)).toBeInTheDocument();
    expect(summary('Total')).toContain('Rs. 190');
  });

  it('items that do not count for free delivery do not reach the threshold', async () => {
    renderPage();
    await waitFor(() => expect(within(screen.getByLabelText('Product 1')).getByRole('option', { name: 'Ghee' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: 'p2' } }); // Rs 600, not eligible
    expect(screen.getByLabelText('Quality 1')).toBeDisabled(); // only A offered
    expect(summary('Delivery charge')).toContain('Rs. 100');
  });

  it('a free-delivery slot makes delivery free; a full slot cannot be picked', async () => {
    renderPage();
    await pickAlooHalfKgB();
    expect(await screen.findByRole('button', { name: /Full Slot/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Free Evening/ }));
    expect(summary('Delivery charge')).toContain('FREE');
    expect(summary('Total')).toContain('Rs. 90');
  });

  it('urgent delivery replaces the slot and charges the urgent fee', async () => {
    renderPage();
    await pickAlooHalfKgB();
    fireEvent.click(await screen.findByRole('button', { name: /Urgent delivery/ }));
    expect(screen.queryByRole('button', { name: /Free Evening/ })).toBeNull();
    expect(summary('Delivery charge')).toContain('Rs. 150');
  });
});

describe('placing the order', () => {
  it('a saved customer + saved address + tomorrow\'s slot: exactly what the server needs', async () => {
    renderPage();
    await lookUp();
    await pickAlooHalfKgB();
    fireEvent.click(screen.getByRole('button', { name: /tomorrow/i }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/orders/time-slots', { date: tomorrow() }));
    fireEvent.click(await screen.findByRole('button', { name: /^Evening/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }));
    await waitFor(() => expect(wa.createOrder).toHaveBeenCalled());
    expect(wa.createOrder.mock.calls[0][0]).toEqual({
      whatsappNumber: '03451230001', customerName: 'Ali Raza', userId: 'u1', addressId: 'a1',
      items: [{ productId: 'p1', quantity: 2, unit: 'half_kg', quality: 'B' }],
      urgentDelivery: false, timeSlotId: 's-std', requestedDeliveryDate: tomorrow(), adminNotes: undefined,
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('WhatsApp order placed — visible in Orders'));
    expect(number()).toHaveValue(''); // the form starts over
  });

  it('editing the saved address sends the typed address (and pin) instead of the saved one', async () => {
    renderPage();
    await lookUp();
    fireEvent.change(screen.getByLabelText('Address *'), { target: { value: 'House 99, New Street' } });
    await pickAlooHalfKgB();
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }));
    await waitFor(() => expect(wa.createOrder).toHaveBeenCalled());
    const sent = wa.createOrder.mock.calls[0][0] as any;
    expect(sent.addressId).toBeUndefined();
    expect(sent).toMatchObject({ addressText: 'House 99, New Street', latitude: '32.5', longitude: '74' });
  });

  it('nothing filled → the form says what is missing and sends nothing', async () => {
    const { container } = renderPage();
    expect(screen.getByRole('button', { name: 'Place Order' })).toBeDisabled();
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(toast.error).toHaveBeenCalledWith('Enter the customer’s WhatsApp / phone number');
    fireEvent.change(number(), { target: { value: '03009999999' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(toast.error).toHaveBeenCalledWith('Select a saved address or type a delivery address');
    fireEvent.change(screen.getByLabelText('Address *'), { target: { value: 'House 1' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(toast.error).toHaveBeenCalledWith('Please add at least one item');
    expect(wa.createOrder).not.toHaveBeenCalled();
  });

  it('a discounted order that waits for the city admin clears the form without an error (B35)', async () => {
    wa.createOrder.mockRejectedValueOnce(new QueuedForApproval('Sent to the city admin for approval.', 'req-1'));
    renderPage();
    await lookUp();
    await pickAlooHalfKgB();
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }));
    await waitFor(() => expect(number()).toHaveValue(''));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a refused order keeps the form and shows the reason', async () => {
    wa.createOrder.mockRejectedValueOnce(new Error('Not enough stock for Aloo'));
    renderPage();
    await lookUp();
    await pickAlooHalfKgB();
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not enough stock for Aloo'));
    expect(number()).toHaveValue('03451230001');
  });

  it('a second item can be added and removed; the last one cannot be removed', async () => {
    renderPage();
    expect(screen.getByLabelText('Remove item 1')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Add Item/ }));
    expect(screen.getByLabelText('Product 2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove item 2'));
    expect(screen.queryByLabelText('Product 2')).toBeNull();
  });
});

describe('complaint replacement', () => {
  it('a replacement price (0 = free) is shown in the total and sent with the complaint link', async () => {
    renderPage('/whatsapp-orders?replacementFor=o9&complaintId=c1');
    expect(screen.getByText('Complaint replacement order')).toBeInTheDocument();
    await lookUp();
    await pickAlooHalfKgB();
    fireEvent.change(screen.getByLabelText('Replacement price 1'), { target: { value: '0' } });
    expect(summary('Items subtotal')).toContain('Rs. 0');
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }));
    await waitFor(() => expect(wa.createOrder).toHaveBeenCalled());
    expect(wa.createOrder.mock.calls[0][0]).toMatchObject({
      items: [{ productId: 'p1', quantity: 2, unit: 'half_kg', quality: 'B', overridePrice: 0 }],
      replacementForOrderId: 'o9', complaintId: 'c1',
    });
  });
});

describe('roles', () => {
  it('without "View products" the page says why and loads no products', async () => {
    mockUser.permissions = ['orders.update'];
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot see the product list/);
    expect(products.getProducts).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Restaurant' })).toBeNull();
  });

  it('with "Manage restaurants" the Restaurant tab opens the restaurant order form', async () => {
    mockUser.permissions = ['products.view', 'orders.update', 'restaurants.manage'];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurant' }));
    expect(screen.getByText('restaurant order form')).toBeInTheDocument();
  });
});
