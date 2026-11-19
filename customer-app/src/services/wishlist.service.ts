// The wishlist kept with the account (W22) — product ids, newest first.
import apiClient from './api';

type Answer = { data?: { product_ids?: string[] } };
const ids = (body: Answer | undefined): string[] => body?.data?.product_ids || [];

export const wishlistService = {
  async get(): Promise<string[]> {
    return ids((await apiClient.get('/wishlist')).data);
  },
  async add(productId: string): Promise<string[]> {
    return ids((await apiClient.post(`/wishlist/${productId}`)).data);
  },
  async remove(productId: string): Promise<string[]> {
    return ids((await apiClient.delete(`/wishlist/${productId}`)).data);
  },
  /** At sign-in: join this phone's list to the account's. */
  async merge(productIds: string[]): Promise<string[]> {
    return ids((await apiClient.post('/wishlist/merge', { product_ids: productIds })).data);
  },
};
