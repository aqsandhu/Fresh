import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { stockService } from '@/services/stock.service';

describe('stockService', () => {
  beforeEach(() => resetApiMocks());

  it('overview fetches /admin/stock and returns the payload', async () => {
    const payload = { products: [{ id: 'p1' }], ocps: [{ id: 'ocp1', name: 'Main' }] };
    mockApi.get.mockResolvedValue({ success: true, data: payload });

    const result = await stockService.overview();

    expect(mockApi.get).toHaveBeenCalledWith('/admin/stock', undefined);
    expect(result).toEqual(payload);
  });

  it('overview passes the search filter and falls back to empty lists on empty data', async () => {
    mockApi.get.mockResolvedValue({ success: true });

    const result = await stockService.overview('tomato');

    expect(mockApi.get).toHaveBeenCalledWith('/admin/stock', { search: 'tomato' });
    expect(result).toEqual({ products: [], ocps: [] });
  });

  it('movements fetches the per-product history', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: [{ id: 'm1' }] });

    const result = await stockService.movements('p1');

    expect(mockApi.get).toHaveBeenCalledWith('/admin/stock/p1/movements');
    expect(result).toEqual([{ id: 'm1' }]);
  });

  it('add POSTs snake_case stock fields', async () => {
    mockApi.post.mockResolvedValue({ success: true });

    await stockService.add({ productId: 'p1', quality: 'A', quantity: 12 });

    expect(mockApi.post).toHaveBeenCalledWith('/admin/stock/add', {
      product_id: 'p1',
      quality: 'A',
      quantity: 12,
    });
  });

  it('waste submits multipart form data including the proof file', async () => {
    mockApi.postForm.mockResolvedValue({ success: true });
    const proof = new File(['x'], 'proof.jpg', { type: 'image/jpeg' });

    await stockService.waste({
      productId: 'p1',
      quality: 'B',
      quantity: 3,
      note: 'spoiled',
      proofFile: proof,
      evidenceQuantity: 3,
    });

    expect(mockApi.postForm).toHaveBeenCalledTimes(1);
    const [url, form] = mockApi.postForm.mock.calls[0];
    expect(url).toBe('/admin/stock/waste');
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('product_id')).toBe('p1');
    expect(form.get('quality')).toBe('B');
    expect(form.get('quantity')).toBe('3');
    expect(form.get('note')).toBe('spoiled');
    expect(form.get('evidence_quantity')).toBe('3');
    expect(form.get('proof')).toBe(proof);
    // Optional approval credentials must be omitted when not provided.
    expect(form.get('approval_phone')).toBeNull();
    expect(form.get('approval_password')).toBeNull();
  });

  it('wasteReport passes the date filter through', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: [] });

    await stockService.wasteReport('2026-07-10');

    expect(mockApi.get).toHaveBeenCalledWith('/admin/stock/waste-report', { date: '2026-07-10' });
  });
});
