import { api, unwrap } from './api';
import type { ApiResponse } from '@/types';

export interface BasketItem {
  id?: string;
  productId: string;
  quality: string;
  quantity: number;
  unit: string;
  nameEn?: string;
  nameUr?: string;
  primaryImage?: string;
}

export interface Basket {
  id: string;
  cityId: string | null;
  name: string;
  description?: string | null;
  totalPrice: number;
  imageUrl?: string | null;
  isActive: boolean;
  items: BasketItem[];
  createdAt: string;
  updatedAt: string;
}

export interface BasketPayload {
  cityId?: string | null;
  name: string;
  description?: string;
  totalPrice: number;
  imageUrl?: string;
  isActive?: boolean;
  items: Array<{ productId: string; quality: string; quantity: number; unit: string }>;
}

export const basketService = {
  list: async (cityId?: string): Promise<Basket[]> => {
    const res = await api.get<ApiResponse<Basket[]>>(
      '/admin/baskets',
      cityId ? { cityId } : undefined
    );
    return unwrap(res);
  },

  create: async (payload: BasketPayload): Promise<Basket> => {
    const res = await api.post<ApiResponse<Basket>>('/admin/baskets', payload);
    return unwrap(res);
  },

  update: async (id: string, payload: Partial<BasketPayload>): Promise<Basket> => {
    const res = await api.put<ApiResponse<Basket>>(`/admin/baskets/${id}`, payload);
    return unwrap(res);
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/admin/baskets/${id}`);
  },
};
