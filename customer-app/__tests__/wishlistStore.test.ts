// W22: the app's wishlist kept with the account. Signed out: on this phone,
// marked to be joined at the next sign-in. Signed in: each add / remove is
// saved to the account (undone with a message when that fails). After
// sign-in: unsent changes are joined; otherwise the account's list replaces
// this phone's (a product removed elsewhere does not come back). "Clear"
// empties the account too; sign-out only forgets this phone's copy.
const mockWishlist = { get: jest.fn(), add: jest.fn(), remove: jest.fn(), merge: jest.fn() };
const mockProducts = { getProductsByIds: jest.fn() };
const mockAuth = { isAuthenticated: false };
jest.mock('@services/wishlist.service', () => ({ get wishlistService() { return mockWishlist; } }));
jest.mock('@services/product.service', () => ({ get productService() { return mockProducts; } }));
jest.mock('@/lib/cityStorage', () => ({ getSelectedCityId: jest.fn(async () => 'city-1') }));
jest.mock('../src/store/authStore', () => ({ useAuthStore: { getState: () => mockAuth } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));

import Toast from 'react-native-toast-message';
import { useWishlistStore } from '../src/store/wishlistStore';
import type { Product } from '@app-types';

const p = (id: string): Product => ({ id, name: id, price: 100, unit: 'kg', inStock: true });
const w = () => useWishlistStore.getState();
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.isAuthenticated = false;
  useWishlistStore.setState({ items: [], unsynced: false });
  mockWishlist.add.mockResolvedValue([]);
  mockWishlist.remove.mockResolvedValue([]);
});

describe('app wishlist', () => {
  it('signed out: kept on this phone and marked for the next sign-in', () => {
    w().toggle(p('a'));
    w().toggle(p('b'));
    expect(w().items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(w().unsynced).toBe(true);
    w().toggle(p('a'));
    expect(w().isWishlisted('a')).toBe(false);
    expect(mockWishlist.add).not.toHaveBeenCalled();
  });

  it('signed in: saved to the account; a failure is undone with a message', async () => {
    mockAuth.isAuthenticated = true;
    w().add(p('a'));
    expect(mockWishlist.add).toHaveBeenCalledWith('a');
    expect(w().unsynced).toBe(false);
    mockWishlist.remove.mockRejectedValueOnce(new Error('offline'));
    w().remove('a');
    expect(w().items).toHaveLength(0);
    await flush();
    expect(w().items.map((i) => i.id)).toEqual(['a']);
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'Could not update your wishlist' }));
  });

  it("after sign-in, unsent changes are joined to the account's list, in the account's order", async () => {
    useWishlistStore.setState({ items: [{ id: 'g1', product: p('g1'), addedAt: 1 }], unsynced: true });
    mockWishlist.merge.mockResolvedValueOnce(['a1', 'g1']);
    mockProducts.getProductsByIds.mockResolvedValueOnce([p('a1'), p('g1')]);
    await w().syncWithAccount();
    expect(mockWishlist.merge).toHaveBeenCalledWith(['g1']);
    expect(mockProducts.getProductsByIds).toHaveBeenCalledWith(['a1', 'g1'], 'city-1');
    expect(w().items.map((i) => i.id)).toEqual(['a1', 'g1']);
    expect(w().unsynced).toBe(false);
  });

  it("nothing unsent: the account's list replaces this phone's (a removed product does not come back)", async () => {
    useWishlistStore.setState({ items: [{ id: 'removed', product: p('removed'), addedAt: 1 }, { id: 'a1', product: p('a1'), addedAt: 2 }], unsynced: false });
    mockWishlist.get.mockResolvedValueOnce(['a1']);
    mockProducts.getProductsByIds.mockResolvedValueOnce([p('a1')]);
    await w().syncWithAccount();
    expect(mockWishlist.merge).not.toHaveBeenCalled();
    expect(w().items.map((i) => i.id)).toEqual(['a1']);
  });

  it('"Clear" empties the account too; sign-out only forgets this phone', async () => {
    mockAuth.isAuthenticated = true;
    useWishlistStore.setState({ items: [{ id: 'a', product: p('a'), addedAt: 1 }, { id: 'b', product: p('b'), addedAt: 2 }] });
    await w().clearAll();
    expect(mockWishlist.remove).toHaveBeenCalledTimes(2);
    expect(w().items).toEqual([]);
    useWishlistStore.setState({ items: [{ id: 'c', product: p('c'), addedAt: 1 }], unsynced: true });
    w().clear();
    expect(w()).toMatchObject({ items: [], unsynced: false });
    expect(mockWishlist.remove).toHaveBeenCalledTimes(2);
  });
});
