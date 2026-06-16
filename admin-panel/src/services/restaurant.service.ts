import { api } from './api';
import type { ApiResponse } from '@/types';

export interface Restaurant {
  id: string;
  businessName: string;
  ownerName: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  cityId: string | null;
  cityName: string | null;
  status: 'pending' | 'approved' | 'disabled' | 'banned';
  freeDeliveryThreshold: number | null;
  deliveryBaseCharge: number | null;
  adminNotes: string | null;
  approvedAt: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
}

export const restaurantService = {
  list: async (
    status?: string
  ): Promise<{ restaurants: Restaurant[]; counts: Record<string, number> }> => {
    const res = await api.get<ApiResponse<{ restaurants: Restaurant[]; counts: Record<string, number> }>>(
      '/admin/restaurants',
      status ? { status } : undefined
    );
    const data = (res.data || {}) as Partial<{ restaurants: Restaurant[]; counts: Record<string, number> }>;
    return { restaurants: data.restaurants || [], counts: data.counts || {} };
  },

  approve: async (id: string): Promise<void> => {
    await api.post(`/admin/restaurants/${id}/approve`);
  },
  disable: async (id: string): Promise<void> => {
    await api.post(`/admin/restaurants/${id}/disable`);
  },
  ban: async (id: string): Promise<void> => {
    await api.post(`/admin/restaurants/${id}/ban`);
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/admin/restaurants/${id}`);
  },
  update: async (
    id: string,
    data: { adminNotes?: string; freeDeliveryThreshold?: number | null; deliveryBaseCharge?: number | null }
  ): Promise<Restaurant> => {
    const res = await api.put<ApiResponse<Restaurant>>(`/admin/restaurants/${id}`, data);
    return res.data as Restaurant;
  },
};
