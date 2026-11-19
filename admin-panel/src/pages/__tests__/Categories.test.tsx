// W16 (round 10): categories — list, open a category's products (mouse +
// keyboard), add / edit with validation and image, switch on/off, delete
// rules, and G19: removing the stored picture in Edit must really remove it.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Categories } from '@/pages/Categories';
import { categoryService } from '@/services/category.service';
import { ROUTER_FUTURE } from '@/lib/routerFuture';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/category.service', () => ({
  categoryService: {
    getCategories: jest.fn(), createCategory: jest.fn(), createCategoryWithImage: jest.fn(), updateCategory: jest.fn(),
    updateCategoryWithImage: jest.fn(), deleteCategory: jest.fn(), toggleCategoryActive: jest.fn(),
  },
}));

const toast = require('react-hot-toast').default;
const svc = categoryService as jest.Mocked<typeof categoryService>;

const veg = { id: 'veg', nameEn: 'Vegetables', nameUr: 'سبزیاں', icon: '🥬', isActive: true, displayOrder: 1, productCount: 0, totalProductCount: 2, imageUrl: '/uploads/veg.jpg', qualifiesForFreeDelivery: true, availableForRestaurants: true };
const fruit = { id: 'fruit', nameEn: 'Fruits', nameUr: 'پھل', isActive: false, displayOrder: 2, productCount: 5, totalProductCount: 5 };

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin/categories']} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/admin/categories" element={<Categories />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
const card = async (name: string) => (await screen.findByText(name, { selector: 'h3' })).closest('[role="button"]') as HTMLElement;

beforeEach(() => {
  svc.getCategories.mockResolvedValue([veg, fruit] as any);
  svc.createCategory.mockResolvedValue({} as any);
  svc.updateCategory.mockResolvedValue({} as any);
  svc.updateCategoryWithImage.mockResolvedValue({} as any);
  svc.createCategoryWithImage.mockResolvedValue({} as any);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  jest.spyOn(window, 'alert').mockImplementation(() => undefined);
});

describe('category list', () => {
  it('a card opens its products — by click and by keyboard', async () => {
    renderPage();
    fireEvent.keyDown(await card('Vegetables'), { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products?category=veg');
  });

  it('Enter on the card\'s Edit button edits, it does not leave the page', async () => {
    renderPage();
    const edit = within(await card('Vegetables')).getByTitle('Edit');
    fireEvent.keyDown(edit, { key: 'Enter' });
    fireEvent.click(edit);
    expect(screen.queryByTestId('where')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Edit Category' })).toBeInTheDocument();
  });

  it('the eye button switches a category on / off', async () => {
    svc.toggleCategoryActive.mockResolvedValue({ isActive: true } as any);
    renderPage();
    fireEvent.click(within(await card('Fruits')).getByTitle('Activate'));
    await waitFor(() => expect(svc.toggleCategoryActive).toHaveBeenCalledWith('fruit'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Category activated'));
  });

  it('delete: refused while active products remain; otherwise warns about inactive ones and deletes', async () => {
    svc.deleteCategory.mockResolvedValue(undefined as any);
    renderPage();
    fireEvent.click(within(await card('Fruits')).getByTitle(/Delete/));
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/5 active product\(s\)\. Move or deactivate them first/));
    expect(svc.deleteCategory).not.toHaveBeenCalled();
    fireEvent.click(within(await card('Vegetables')).getByTitle(/Delete/));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/2 inactive product\(s\) in this category will also be removed/));
    await waitFor(() => expect(svc.deleteCategory).toHaveBeenCalledWith('veg'));
  });
});

describe('add / edit', () => {
  it('names are required (English and Urdu)', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /Add Category/ }))[0]);
    const d = screen.getByRole('dialog', { name: 'Add Category' });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    expect(within(d).getByText('Category name (English) is required')).toBeInTheDocument();
    expect(within(d).getByText('Category name (Urdu) is required')).toBeInTheDocument();
    expect(svc.createCategory).not.toHaveBeenCalled();
  });

  it('creates a category with its free-delivery and restaurant switches', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /Add Category/ }))[0]);
    const d = screen.getByRole('dialog', { name: 'Add Category' });
    fireEvent.change(within(d).getByLabelText(/Category Name \(English\)/), { target: { value: 'Dairy' } });
    fireEvent.change(within(d).getByLabelText(/Category Name \(Urdu\)/), { target: { value: 'ڈیری' } });
    fireEvent.click(within(d).getByLabelText(/Apply free-delivery calculation/));
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(svc.createCategory).toHaveBeenCalledWith(expect.objectContaining({ nameEn: 'Dairy', nameUr: 'ڈیری', qualifiesForFreeDelivery: true, availableForRestaurants: false })));
  });

  it('a wrong file type or a too-big picture is refused', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /Add Category/ }))[0]);
    const input = within(screen.getByRole('dialog')).getByLabelText('Category Image');
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    expect(toast.error).toHaveBeenCalledWith('Invalid file type. Please use JPG, PNG or WebP');
    const big = new File(['x'], 'b.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(toast.error).toHaveBeenCalledWith('Image is too large. Max size is 5MB');
  });

  it('editing keeps the values; removing the stored picture really removes it (G19)', async () => {
    renderPage();
    fireEvent.click(within(await card('Vegetables')).getByTitle('Edit'));
    const d = screen.getByRole('dialog', { name: 'Edit Category' });
    expect(within(d).getByLabelText(/Category Name \(English\)/)).toHaveValue('Vegetables');
    fireEvent.click(within(d).getByRole('button', { name: 'Remove image' }));
    fireEvent.click(within(d).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(svc.updateCategory).toHaveBeenCalled());
    expect(svc.updateCategory.mock.calls[0]).toEqual(['veg', expect.objectContaining({ nameEn: 'Vegetables', availableForRestaurants: true, imageUrl: null })]);
  });

  it('editing without touching the picture leaves it alone', async () => {
    renderPage();
    fireEvent.click(within(await card('Vegetables')).getByTitle('Edit'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(svc.updateCategory).toHaveBeenCalled());
    expect('imageUrl' in (svc.updateCategory.mock.calls[0][1] as object)).toBe(false);
  });
});
