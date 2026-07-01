import { api, unwrap } from './api';
import type { ApiResponse } from '@/types';

export interface AbandonedCartItem {
  name: string;
  quantity: number;
  price: number;
  quality?: string;
}

export interface AbandonedCart {
  id: string;
  deviceId: string;
  userId: string | null;
  customerName: string;
  phone: string | null;
  cityId: string | null;
  itemCount: number;
  subtotal: number;
  status: string;
  lastActivityAt: string;
  remindedAt: string | null;
  createdAt: string;
  items: AbandonedCartItem[];
}

export interface MarketingSettings {
  fbPixelId: string;
  googleTagId: string;
  reminderEnabled: boolean;
  reminderDelayHours: number;
}

export const marketingService = {
  listAbandonedCarts: async (olderThanHours?: number): Promise<AbandonedCart[]> => {
    const res = await api.get<ApiResponse<AbandonedCart[]>>(
      '/admin/marketing/abandoned-carts',
      olderThanHours ? { olderThanHours } : undefined
    );
    return unwrap(res);
  },

  runReminders: async (): Promise<{ sent: number }> => {
    const res = await api.post<ApiResponse<{ sent: number }>>('/admin/marketing/run-reminders');
    return unwrap(res);
  },

  getSettings: async (): Promise<MarketingSettings> => {
    const res = await api.get<ApiResponse<MarketingSettings>>('/admin/marketing/settings');
    return unwrap(res);
  },

  updateSettings: async (payload: Partial<MarketingSettings>): Promise<MarketingSettings> => {
    const res = await api.put<ApiResponse<MarketingSettings>>('/admin/marketing/settings', payload);
    return unwrap(res);
  },
};
