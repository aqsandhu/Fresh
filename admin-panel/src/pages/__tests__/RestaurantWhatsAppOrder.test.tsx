// W16 (round 10): placing a restaurant (B2B) order from the office — only
// products / qualities enabled for restaurants, the restaurant price (and its
// own ½ kg price) wins over the shop price, the restaurant's own delivery
// rules, and what is sent.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RestaurantWhatsAppOrder } from '@/pages/RestaurantWhatsAppOrder';
import { restaurantService } from '@/services/restaurant.service';
import { productService } from '@/services/product.service';

jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/restaurant.service', () => ({ restaurantService: { list: jest.fn(), getSettings: jest.fn(), placeOrder: jest.fn() } }));
jest.mock('@/services/product.service', () => ({ productService: { getProducts: jest.fn() } }));

const toast = require('react-hot-toast').default;
const rest = restaurantService as jest.Mocked<typeof restaurantService>;

const onion = {
  id: 'p1', nameEn: 'Onion', unitType: 'kg', isActive: true, availableForRestaurants: true,
  price: 160, restaurantEnabledA: true, restaurantPriceA: 140, restaurantHalfKgPriceA: 65,
  priceB: 120, restaurantEnabledB: true, restaurantPriceB: null, allowHalfKg: true, allowQuarterKg: false,
};
const shopOnly = { id: 'p2', nameEn: 'Shop Only', unitType: 'kg', isActive: true, availableForRestaurants: false, price: 100, restaurantEnabledA: true };
const noTier = { id: 'p3', nameEn: 'No Tier', unitType: 'kg', isActive: true, availableForRestaurants: true, price: 100 };

beforeEach(() => {
  rest.list.mockResolvedValue({ restaurants: [
    { id: 'r1', businessName: 'Dhaba One', phone: '03001234567', deliveryBaseCharge: 150, freeDeliveryThreshold: 1000 },
    { id: 'r2', businessName: 'Cafe Two', phone: '03007654321' },
  ] } as any);
  rest.getSettings.mockResolvedValue({ baseCharge: 100, freeDeliveryThreshold: 2000 } as any);
  rest.placeOrder.mockResolvedValue({ id: 'o1' } as any);
  (productService.getProducts as jest.Mock).mockResolvedValue({ products: [onion, shopOnly, noTier], pagination: { total: 3 } });
});

// The rate badge under the line: 'Rs. 140 / kg · QA'.
const rate = () => (document.querySelector('.bg-primary-50') as HTMLElement | null)?.textContent?.replace(/\s+/g, ' ').trim();
const summary = (label: string) => (screen.getByText(label).parentElement as HTMLElement).textContent;
async function pick(restaurant = 'r1') {
  render(<RestaurantWhatsAppOrder />);
  await waitFor(() => expect(within(screen.getByLabelText('Restaurant')).getByRole('option', { name: /Dhaba One/ })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Restaurant'), { target: { value: restaurant } });
  await waitFor(() => expect(within(screen.getByLabelText('Product 1')).getByRole('option', { name: 'Onion' })).toBeInTheDocument());
}

describe('restaurant order', () => {
  it('lists only products sold to restaurants (with an enabled quality)', async () => {
    await pick();
    const products = within(screen.getByLabelText('Product 1'));
    expect(products.queryByRole('option', { name: 'Shop Only' })).toBeNull();
    expect(products.queryByRole('option', { name: 'No Tier' })).toBeNull();
  });

  it('the restaurant price is used (A Rs 140, not 160; ½ kg its own Rs 65; B falls back to the B shop price)', async () => {
    await pick();
    fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: 'p1' } });
    expect(rate()).toBe('Rs. 140 / kg · QA');
    fireEvent.change(screen.getByLabelText('Unit 1'), { target: { value: 'half_kg' } });
    expect(rate()).toBe('Rs. 65 / ½ kg · QA');
    fireEvent.change(screen.getByLabelText('Unit 1'), { target: { value: 'full' } });
    fireEvent.change(screen.getByLabelText('Quality 1'), { target: { value: 'B' } });
    expect(rate()).toBe('Rs. 120 / kg · QB');
    expect(within(screen.getByLabelText('Unit 1')).queryByRole('option', { name: /Quarter/ })).toBeNull();
  });

  it('the restaurant\'s own delivery rule: Rs 150 below Rs 1,000, free from Rs 1,000', async () => {
    await pick();
    fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: 'p1' } });
    expect(summary('Delivery')).toContain('Rs. 150');
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByLabelText('Increase quantity 1')); // 8 × 140 = 1,120
    expect(summary('Subtotal')).toContain('Rs. 1,120');
    expect(summary('Delivery')).toMatch(/FREE|Rs\. 0/);
  });

  it('places the order with every line\'s product, quality, unit and quantity', async () => {
    await pick();
    fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: 'p1' } });
    fireEvent.click(screen.getByLabelText('Increase quantity 1'));
    fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));
    fireEvent.change(screen.getByLabelText('Product 2'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Quality 2'), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText('Unit 2'), { target: { value: 'half_kg' } });
    fireEvent.click(screen.getByRole('button', { name: /Place Restaurant Order/ }));
    await waitFor(() => expect(rest.placeOrder).toHaveBeenCalledWith({
      restaurantId: 'r1',
      items: [
        { productId: 'p1', quantity: 2, unit: 'full', quality: 'A' },
        { productId: 'p1', quantity: 1, unit: 'half_kg', quality: 'B' },
      ],
      customerNotes: undefined,
    }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Restaurant order placed — visible in Orders → Restaurants'));
    expect(screen.queryByLabelText('Product 2')).toBeNull(); // the form starts over
  });

  it('no restaurant / no item → says what is missing; a refusal shows the reason', async () => {
    const { container } = render(<RestaurantWhatsAppOrder />);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(toast.error).toHaveBeenCalledWith('Select a restaurant');
    await waitFor(() => expect(within(screen.getByLabelText('Restaurant')).getByRole('option', { name: /Cafe Two/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Restaurant'), { target: { value: 'r2' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(toast.error).toHaveBeenCalledWith('Add at least one item');
    await waitFor(() => expect(within(screen.getByLabelText('Product 1')).getByRole('option', { name: 'Onion' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: 'p1' } });
    expect(summary('Delivery')).toContain('Rs. 100'); // no own rule → the shared restaurant setting
    rest.placeOrder.mockRejectedValueOnce({ response: { data: { message: 'Quality B is not available' } } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Quality B is not available'));
  });
});
