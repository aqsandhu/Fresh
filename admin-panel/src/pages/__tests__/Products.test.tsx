// W16 (round 10): the product catalogue — list + filters, add / edit with
// validation, quality tiers, what is (not) sent (stock never, restaurant
// flags only when the category allows), delete-or-deactivate, bulk move,
// images, and a role without catalogue rights.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Products } from '@/pages/Products';
import { productService } from '@/services/product.service';
import { categoryService } from '@/services/category.service';
import { ROUTER_FUTURE } from '@/lib/routerFuture';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children, onSearch }: { title: string; children: React.ReactNode; onSearch?: (q: string) => void }) => (
    <div>
      <h1>{title}</h1>
      <input aria-label="Search products" onChange={(e) => onSearch?.(e.target.value)} />
      {children}
    </div>
  ),
}));
const mockUser: { role: string; permissions: string[] } = { role: 'admin', permissions: [] };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/product.service', () => ({
  productService: {
    getProducts: jest.fn(), getProductById: jest.fn(), createProduct: jest.fn(), updateProduct: jest.fn(),
    hardDeleteProduct: jest.fn(), deleteProduct: jest.fn(), toggleProductStatus: jest.fn(),
    moveProductsToCategory: jest.fn(), deleteProductImage: jest.fn(),
  },
}));
jest.mock('@/services/category.service', () => ({ categoryService: { getCategories: jest.fn() } }));

const toast = require('react-hot-toast').default;
const svc = productService as jest.Mocked<typeof productService>;

const ALL = ['products.view', 'products.create', 'products.update', 'products.delete'];
const aloo = {
  id: 'p1', nameEn: 'Aloo', nameUr: 'آلو', price: 100, compareAtPrice: 150, stockQuantity: 40, unitType: 'kg',
  categoryId: 'veg', categoryName: 'Vegetables', isActive: true, isFeatured: false, images: ['/uploads/aloo.jpg'], tags: [],
};
const ghee = { id: 'p2', nameEn: 'Ghee', price: 600, stockQuantity: 3, unitType: 'pack', categoryId: 'grocery', categoryName: 'Grocery', isActive: false, isFeatured: false, images: [] };

let listed: any[];
beforeEach(() => {
  mockUser.permissions = [...ALL];
  listed = [aloo, ghee];
  svc.getProducts.mockImplementation(async () => ({ products: listed, pagination: { page: 1, limit: 12, total: 30, totalPages: 3 } }) as any);
  svc.getProductById.mockImplementation(async (id: string) => ({ ...listed.find((p) => p.id === id), priceB: 80 }) as any);
  svc.createProduct.mockResolvedValue({ id: 'new' } as any);
  svc.updateProduct.mockResolvedValue({ id: 'p1' } as any);
  (categoryService.getCategories as jest.Mock).mockResolvedValue([
    { id: 'veg', nameEn: 'Vegetables', availableForRestaurants: true },
    { id: 'grocery', nameEn: 'Grocery', availableForRestaurants: false },
  ]);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

const renderPage = (url = '/products') =>
  render(<MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}><Products /></MemoryRouter>);
const card = async (name: string) => (await screen.findByText(name, { selector: 'h3' })).closest('.group') as HTMLElement;
const dialog = () => screen.getByRole('dialog');

describe('product list', () => {
  it('shows each product with price, stock and state; low stock and inactive are marked', async () => {
    renderPage();
    const a = await card('Aloo');
    expect(within(a).getByText('40 kg')).toBeInTheDocument();
    const g = await card('Ghee');
    expect(within(g).getByText('Low Stock')).toBeInTheDocument();
    expect(within(g).getAllByText('Inactive').length).toBeGreaterThan(0);
  });

  it('filters: category (one "All Categories" choice), status, search and pages reach the server', async () => {
    renderPage();
    await card('Aloo');
    const category = screen.getByLabelText('Category filter');
    expect(within(category).getAllByRole('option', { name: 'All Categories' })).toHaveLength(1);
    fireEvent.change(category, { target: { value: 'veg' } });
    await waitFor(() => expect(svc.getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 'veg', page: 1 })));
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'all' } });
    await waitFor(() => expect(svc.getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ isActive: undefined })));
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'pyaz' } });
    await waitFor(() => expect(svc.getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'pyaz' })));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(svc.getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it('arriving from a category opens with that category filtered', async () => {
    renderPage('/products?category=grocery');
    await waitFor(() => expect(svc.getProducts).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'grocery' })));
  });

  it('the eye button switches a product on / off', async () => {
    svc.toggleProductStatus.mockResolvedValue({ isActive: true } as any);
    renderPage();
    fireEvent.click(within(await card('Ghee')).getByTitle('Activate'));
    await waitFor(() => expect(svc.toggleProductStatus).toHaveBeenCalledWith('p2'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Product activated'));
  });
});

describe('adding a product', () => {
  it('an empty form is refused with the reasons and nothing is sent', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /Add Product/ }))[0]);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create' }));
    expect(toast.error).toHaveBeenCalledWith('Please fix the form errors');
    expect(within(dialog()).getByText('Product name (English) is required')).toBeInTheDocument();
    expect(within(dialog()).getByText('Price must be greater than 0')).toBeInTheDocument();
    expect(within(dialog()).getByText('Please select a category')).toBeInTheDocument();
    expect(svc.createProduct).not.toHaveBeenCalled();
  });

  it('an offered Quality B needs its own price; an original price must be above the price', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /Add Product/ }))[0]);
    const d = dialog();
    fireEvent.change(within(d).getByLabelText(/Product Name .English./), { target: { value: 'Pyaz' } });
    fireEvent.change(within(d).getAllByLabelText(/Consumer price/)[0], { target: { value: '120' } });
    fireEvent.change(within(d).getByLabelText(/Category/), { target: { value: 'veg' } });
    fireEvent.click(within(d).getByLabelText('Offer Quality B'));
    fireEvent.change(within(d).getByLabelText('Original Price (Optional)'), { target: { value: '100' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    expect(within(d).getByText('Quality B price must be greater than 0 (or remove the tier)')).toBeInTheDocument();
    expect(within(d).getByText('Compare at price should be higher than regular price')).toBeInTheDocument();
    expect(svc.createProduct).not.toHaveBeenCalled();
  });

  it('a valid product is created without stock fields; restaurant switches are off for a non-restaurant category', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /Add Product/ }))[0]);
    const d = dialog();
    fireEvent.change(within(d).getByLabelText(/Product Name .English./), { target: { value: 'Ghee Tin' } });
    fireEvent.change(within(d).getAllByLabelText(/Consumer price/)[0], { target: { value: '650' } });
    fireEvent.change(within(d).getByLabelText(/Unit/), { target: { value: 'pack' } });
    fireEvent.change(within(d).getByLabelText(/Category/), { target: { value: 'grocery' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(svc.createProduct).toHaveBeenCalled());
    const sent = svc.createProduct.mock.calls[0][0] as any;
    expect(sent).toMatchObject({ nameEn: 'Ghee Tin', price: 650, unitType: 'pack', categoryId: 'grocery', availableForRestaurants: false, restaurantEnabledA: false });
    expect('stockQuantity' in sent).toBe(false);
    expect('stockQuantityB' in sent).toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a picture over 5 MB is refused', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /Add Product/ }))[0]);
    const big = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(within(dialog()).getByLabelText('Product Images'), { target: { files: [big] } });
    expect(toast.error).toHaveBeenCalledWith('huge.jpg is too large. Max size is 5MB');
  });

  it('a 0 in a ½ kg box is refused — blank means automatic (B37)', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /Add Product/ }))[0]);
    const d = dialog();
    fireEvent.change(within(d).getByLabelText(/Product Name .English./), { target: { value: 'Pyaz' } });
    fireEvent.change(within(d).getAllByLabelText(/Consumer price/)[0], { target: { value: '120' } });
    fireEvent.change(within(d).getByLabelText(/Category/), { target: { value: 'veg' } });
    fireEvent.change(within(d).getAllByLabelText('½ kg (Rs.)')[0], { target: { value: '0' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    expect(within(d).getByRole('alert')).toHaveTextContent('Quality A ½ kg price must be greater than 0 — leave it blank for the automatic price');
    expect(svc.createProduct).not.toHaveBeenCalled();
  });
});

describe('editing a product', () => {
  it('loads the full product (Quality B price) and keeps the stored pictures on update', async () => {
    renderPage();
    fireEvent.click(within(await card('Aloo')).getByTitle('Edit'));
    await waitFor(() => expect(svc.getProductById).toHaveBeenCalledWith('p1'));
    const d = await screen.findByRole('dialog', { name: 'Edit Product' });
    await waitFor(() => expect(within(d).getAllByLabelText(/Consumer price/)[1]).toHaveValue(80));
    fireEvent.click(within(d).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(svc.updateProduct).toHaveBeenCalled());
    const [id, data] = svc.updateProduct.mock.calls[0] as [string, any];
    expect(id).toBe('p1');
    expect(data).toMatchObject({ nameEn: 'Aloo', price: 100, priceB: 80, compareAtPrice: 150, existingImages: ['/uploads/aloo.jpg'] });
  });

  it('emptying the original price removes it (sends 0, not NaN — the server refused NaN)', async () => {
    renderPage();
    fireEvent.click(within(await card('Aloo')).getByTitle('Edit'));
    const d = await screen.findByRole('dialog', { name: 'Edit Product' });
    fireEvent.change(within(d).getByLabelText('Original Price (Optional)'), { target: { value: '' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(svc.updateProduct).toHaveBeenCalled());
    expect((svc.updateProduct.mock.calls[0][1] as any).compareAtPrice).toBe(0);
  });

  it('a stored picture can be removed', async () => {
    svc.deleteProductImage.mockResolvedValue(undefined as any);
    renderPage();
    fireEvent.click(within(await card('Aloo')).getByTitle('Edit'));
    const d = await screen.findByRole('dialog', { name: 'Edit Product' });
    fireEvent.click(await within(d).findByRole('button', { name: 'Remove image 1' }));
    await waitFor(() => expect(svc.deleteProductImage).toHaveBeenCalledWith('p1', 0));
    await waitFor(() => expect(within(d).queryByAltText('Image 1')).toBeNull());
  });
});

describe('delete and bulk move', () => {
  it('delete asks first; a product in past orders is offered deactivation instead', async () => {
    svc.hardDeleteProduct.mockRejectedValueOnce(new Error('Product is used in past orders'));
    svc.deleteProduct.mockResolvedValue(undefined as any);
    renderPage();
    const a = await card('Aloo');
    (window.confirm as jest.Mock).mockReturnValueOnce(false);
    fireEvent.click(within(a).getByTitle('Delete product'));
    expect(svc.hardDeleteProduct).not.toHaveBeenCalled();
    fireEvent.click(within(a).getByTitle('Delete product'));
    await waitFor(() => expect(svc.deleteProduct).toHaveBeenCalledWith('p1'));
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringMatching(/Deactivate this product instead\?/));
  });

  it('selected products are moved to another category in one go', async () => {
    svc.moveProductsToCategory.mockResolvedValue({ moved: 2 } as any);
    renderPage();
    await card('Aloo');
    fireEvent.click(screen.getByLabelText('Select Aloo'));
    fireEvent.click(screen.getByLabelText('Select Ghee'));
    expect(screen.getByText('2 products selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Move to Category/ }));
    const d = screen.getByRole('dialog', { name: 'Move products to category' });
    fireEvent.change(within(d).getByLabelText('Target Category'), { target: { value: 'grocery' } });
    fireEvent.click(within(d).getByRole('button', { name: /^Move/ }));
    await waitFor(() => expect(svc.moveProductsToCategory).toHaveBeenCalledWith(['p1', 'p2'], 'grocery'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Moved 2 product(s)'));
    expect(screen.queryByText('2 products selected')).toBeNull();
  });
});

describe('a role that may only look', () => {
  it('cannot add, edit, switch, move or delete', async () => {
    mockUser.permissions = ['products.view'];
    renderPage();
    const a = await card('Aloo');
    expect(screen.getAllByRole('button', { name: /Add Product/ })[0]).toBeDisabled();
    const updateButtons = within(a).getAllByTitle('You do not have permission to update products'); // switch + edit
    expect(updateButtons).toHaveLength(2);
    updateButtons.forEach((b) => expect(b).toBeDisabled());
    expect(within(a).getByTitle('You do not have permission to delete products')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Select Aloo'));
    expect(screen.getByRole('button', { name: /Move to Category/ })).toBeDisabled();
  });
});
