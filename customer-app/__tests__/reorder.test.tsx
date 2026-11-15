// "Reorder" must put back what was bought — same size, same quality — at
// TODAY's price. It used to rebuild every line as a full unit of Quality A
// carrying the old line's price (Sept audit; fixed Nov 2026).
import { reorderItems } from '../src/lib/reorder';
import type { OrderItem, StoreProduct } from '../src/types';

const line = (over: Partial<OrderItem>): OrderItem =>
  ({ id: 'i', productName: 'x', quantity: 1, price: 50, ...over }) as OrderItem;
const today = (id: string, extra: Partial<StoreProduct> = {}): StoreProduct =>
  ({ id, name: id, price: 120, unit: 'kg', inStock: true, ...extra }) as StoreProduct;

describe('reorderItems', () => {
  it('adds each line again in the same size and quality, from the product as it is today', async () => {
    const addItem = jest.fn(async () => undefined);
    const added = await reorderItems(
      [line({ productId: 'onion', quantity: 2, price: 60, saleUnit: 'half_kg', quality: 'B' })],
      { fetchProduct: async (id) => today(id), addItem }
    );
    expect(added).toBe(2);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'onion', price: 120 }), 2, 'half_kg', 'B');
  });

  it('skips products that are gone or out of stock, and lines with no product', async () => {
    const addItem = jest.fn(async () => undefined);
    const added = await reorderItems(
      [
        line({ productId: 'gone', quantity: 3 }),
        line({ productId: 'empty', quantity: 4 }),
        line({ productId: undefined, quantity: 5 }),
        line({ productId: 'ok', quantity: 1 }),
      ],
      {
        fetchProduct: async (id) => {
          if (id === 'gone') throw new Error('404');
          return today(id, { inStock: id !== 'empty' });
        },
        addItem,
      }
    );
    expect(added).toBe(1);
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'ok' }), 1, 'full', 'A');
  });
});
