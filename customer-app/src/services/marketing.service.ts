import apiClient from './api';
import { withCityParams } from '@/lib/apiHelpers';

export interface CartSnapshotItem {
  name: string;
  quantity: number;
  price: number;
  quality?: string;
}

export const marketingService = {
  async snapshotCart(payload: {
    deviceId: string;
    items: CartSnapshotItem[];
    subtotal: number;
    phone?: string;
  }): Promise<void> {
    try {
      await apiClient.post('/marketing/cart-snapshot', payload, { params: withCityParams() });
    } catch {
      // Non-blocking — snapshot failures must never affect shopping.
    }
  },
};

export default marketingService;
