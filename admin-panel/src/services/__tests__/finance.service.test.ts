import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { financeService } from '@/services/finance.service';

// The error-path tests make the service log its error (console.error) on
// purpose; keep that out of the test output so real warnings stand out.
let consoleErrorSpy: jest.SpyInstance;
beforeEach(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => consoleErrorSpy.mockRestore());

describe('financeService', () => {
  beforeEach(() => resetApiMocks());

  it('listExpenses builds only the provided filters', async () => {
    const list = { expenses: [{ id: 'e1' }], total: 500, byType: { other: 500 } };
    mockApi.get.mockResolvedValue({ success: true, data: list });

    const result = await financeService.listExpenses({ type: 'other', period: 'today' });

    expect(mockApi.get).toHaveBeenCalledWith('/finance/expenses', { type: 'other', period: 'today' });
    expect(result).toEqual(list);
  });

  it('listExpenses returns safe defaults when the payload is empty', async () => {
    mockApi.get.mockResolvedValue({ success: true });

    expect(await financeService.listExpenses()).toEqual({ expenses: [], total: 0, byType: {} });
  });

  it('addStockPurchase sends JSON when there is no bill photo', async () => {
    mockApi.post.mockResolvedValue({ success: true, data: { id: 'p1' } });
    await financeService.addStockPurchase({ productId: 'x', purchasePrice: 100, supplierName: 'Mandi A', billPhoto: null });
    expect(mockApi.post).toHaveBeenCalledWith('/finance/stock-purchase', { productId: 'x', purchasePrice: 100, supplierName: 'Mandi A' });
  });

  it('addStockPurchase sends multipart with snake_case fields and the bill photo', async () => {
    mockApi.postForm.mockResolvedValue({ success: true, data: { id: 'p2' } });
    const bill = new File(['x'], 'bill.png', { type: 'image/png' });
    await financeService.addStockPurchase({ productId: 'x', purchasePrice: 100, rawWeight: 10, supplierName: 'Mandi A', billNumber: 'B-1', billPhoto: bill });
    const form = mockApi.postForm.mock.calls[0][1] as FormData;
    expect(mockApi.postForm.mock.calls[0][0]).toBe('/finance/stock-purchase');
    expect(form.get('product_id')).toBe('x');
    expect(form.get('raw_weight')).toBe('10');
    expect(form.get('supplier_name')).toBe('Mandi A');
    expect(form.get('bill_number')).toBe('B-1');
    expect(form.get('bill_photo')).toBeInstanceOf(File);
  });

  it('addExpense POSTs and unwraps the created id', async () => {
    mockApi.post.mockResolvedValue({ success: true, data: { id: 'e2' } });

    const created = await financeService.addExpense({ category: 'Rent', amount: 5000 });

    expect(mockApi.post).toHaveBeenCalledWith('/finance/expenses', { category: 'Rent', amount: 5000 });
    expect(created).toEqual({ id: 'e2' });
  });

  it('addStockPurchase POSTs the graded weights', async () => {
    mockApi.post.mockResolvedValue({ success: true, data: { id: 's1' } });
    const purchase = { productId: 'p1', purchasePrice: 1200, rawWeight: 10, gradeA: 6, gradeB: 3, waste: 1 };

    await financeService.addStockPurchase(purchase);

    expect(mockApi.post).toHaveBeenCalledWith('/finance/stock-purchase', purchase);
  });

  it('addRiderPayment POSTs to /finance/rider-payment', async () => {
    mockApi.post.mockResolvedValue({ success: true, data: { id: 'rp1' } });

    await financeService.addRiderPayment({ riderId: 'r1', category: 'salary', amount: 30000 });

    expect(mockApi.post).toHaveBeenCalledWith('/finance/rider-payment', {
      riderId: 'r1',
      category: 'salary',
      amount: 30000,
    });
  });

  it('addExpense propagates an empty-envelope failure', async () => {
    mockApi.post.mockResolvedValue({ success: true });

    await expect(financeService.addExpense({ category: 'Misc', amount: 1 })).rejects.toThrow();
  });
});
