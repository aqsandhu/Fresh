// W16 (round 10): the one-screen price editor — only changed products are
// saved, blank keeps / derives a price, 0 is refused in EVERY price box (B37:
// a 0 ½ kg / restaurant price sold that unit for Rs. 0), restaurant prices
// only for a restaurant category, filters, discard.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PriceManager } from '@/pages/PriceManager';
import { productService } from '@/services/product.service';
import { categoryService } from '@/services/category.service';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/product.service', () => ({ productService: { getProducts: jest.fn(), updateProduct: jest.fn() } }));
jest.mock('@/services/category.service', () => ({ categoryService: { getCategories: jest.fn() } }));

const toast = require('react-hot-toast').default;
const svc = productService as jest.Mocked<typeof productService>;

const aloo = {
  id: 'p1', nameEn: 'Aloo', categoryId: 'veg', categoryName: 'Vegetables', unitType: 'kg', isActive: true,
  price: 100, halfKgPrice: null, quarterKgPrice: null, priceB: 80, restaurantEnabledA: true, restaurantPriceA: 90,
  allowHalfKg: true, allowQuarterKg: true,
};
const ghee = { id: 'p2', nameEn: 'Ghee', categoryId: 'grocery', categoryName: 'Grocery', unitType: 'pack', isActive: false, price: 600 };

beforeEach(() => {
  svc.getProducts.mockResolvedValue({ products: [aloo, ghee] } as any);
  svc.updateProduct.mockResolvedValue({} as any);
  (categoryService.getCategories as jest.Mock).mockResolvedValue([
    { id: 'veg', nameEn: 'Vegetables', availableForRestaurants: true },
    { id: 'grocery', nameEn: 'Grocery', availableForRestaurants: false },
  ]);
});

const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('PriceManager', () => {
  it('shows every product\'s prices; only the changed product is saved', async () => {
    render(<PriceManager />);
    await waitFor(() => expect(box('Aloo QA price per unit')).toHaveValue(100));
    expect(box('Aloo QB price per unit')).toHaveValue(80);
    expect(box('Aloo QA ½ kg price')).toHaveAttribute('placeholder', 'auto 50');
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
    fireEvent.change(box('Aloo QA ½ kg price'), { target: { value: '55' } });
    expect(screen.getByText(/unsaved change/)).toHaveTextContent('1 unsaved change');
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(svc.updateProduct).toHaveBeenCalledTimes(1));
    const [id, data] = svc.updateProduct.mock.calls[0] as [string, any];
    expect(id).toBe('p1');
    expect(data).toMatchObject({ price: 100, halfKgPrice: 55, quarterKgPrice: null, priceB: 80, priceC: null, restaurantEnabledA: true, restaurantPriceA: 90, availableForRestaurants: true });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 product updated'));
  });

  it.each([
    ['Aloo QA ½ kg price', '"Aloo": ½ kg price must be greater than 0'],
    ['Aloo QA restaurant price per unit', '"Aloo": restaurant price must be greater than 0'],
    ['Aloo QB ¼ kg price', '"Aloo": Quality B ¼ kg price must be greater than 0'],
  ])('a 0 in "%s" is refused before saving (B37)', async (label, message) => {
    render(<PriceManager />);
    await waitFor(() => expect(box('Aloo QA price per unit')).toHaveValue(100));
    fireEvent.change(box(label), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(toast.error).toHaveBeenCalledWith(message);
    expect(svc.updateProduct).not.toHaveBeenCalled();
  });

  it('a cleared per-unit price is left out (never sent as Rs. 0)', async () => {
    render(<PriceManager />);
    await waitFor(() => expect(box('Aloo QA price per unit')).toHaveValue(100));
    fireEvent.change(box('Aloo QA price per unit'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(svc.updateProduct).toHaveBeenCalled());
    expect('price' in (svc.updateProduct.mock.calls[0][1] as object)).toBe(false);
  });

  it('turning Quality B off clears all of its prices; a non-restaurant category cannot sell to restaurants', async () => {
    render(<PriceManager />);
    await waitFor(() => expect(box('Aloo QA price per unit')).toHaveValue(100));
    expect(screen.getByLabelText('Sell Ghee quality A to restaurants')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Offer Aloo quality B'));
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(svc.updateProduct).toHaveBeenCalled());
    expect(svc.updateProduct.mock.calls[0][1]).toMatchObject({ priceB: null, halfKgPriceB: null, restaurantEnabledB: false });
  });

  it('pausing a product is saved; a failed save says how many failed', async () => {
    svc.updateProduct.mockRejectedValueOnce(new Error('down'));
    render(<PriceManager />);
    await waitFor(() => expect(box('Aloo QA price per unit')).toHaveValue(100));
    fireEvent.click(screen.getAllByLabelText('Active')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('1 failed to update'));
    expect(svc.updateProduct.mock.calls[0][1]).toMatchObject({ isActive: false });
  });

  it('discard puts every value back', async () => {
    render(<PriceManager />);
    await waitFor(() => expect(box('Aloo QA price per unit')).toHaveValue(100));
    fireEvent.change(box('Aloo QA price per unit'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Discard/ }));
    expect(box('Aloo QA price per unit')).toHaveValue(100);
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
  });

  it('filters by category, status and name', async () => {
    render(<PriceManager />);
    await waitFor(() => expect(box('Aloo QA price per unit')).toHaveValue(100));
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'paused' } });
    expect(screen.queryByText('Aloo')).toBeNull();
    expect(screen.getByText('Ghee')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Category filter'), { target: { value: 'Vegetables' } });
    expect(screen.queryByText('Ghee')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'zzz' } });
    expect(screen.getByText('No products match.')).toBeInTheDocument();
  });
});
