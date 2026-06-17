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

  // ── Restaurant orders ──────────────────────────────────────────────────
  getOrders: async (status?: string): Promise<{ orders: any[]; counts: Record<string, number> }> => {
    const res = await api.get<ApiResponse<{ orders: any[]; counts: Record<string, number> }>>(
      '/admin/restaurants/orders',
      status ? { status } : undefined
    );
    const data = (res.data || {}) as Partial<{ orders: any[]; counts: Record<string, number> }>;
    return { orders: data.orders || [], counts: data.counts || {} };
  },
  updateOrderStatus: async (id: string, data: { status?: string; riderId?: string | null }): Promise<any> => {
    const body: Record<string, unknown> = {};
    if (data.status !== undefined) body.status = data.status;
    if (data.riderId !== undefined) body.rider_id = data.riderId;
    const res = await api.put<ApiResponse<any>>(`/admin/restaurants/orders/${id}/status`, body);
    return res.data;
  },

  // ── Dashboard + global delivery settings ───────────────────────────────
  getDashboard: async (): Promise<Record<string, number>> => {
    const res = await api.get<ApiResponse<Record<string, number>>>('/admin/restaurants/dashboard');
    return res.data || {};
  },
  getSettings: async (): Promise<{ baseCharge: number; freeDeliveryThreshold: number }> => {
    const res = await api.get<ApiResponse<{ baseCharge: number; freeDeliveryThreshold: number }>>(
      '/admin/restaurants/settings'
    );
    const d = res.data as any;
    return { baseCharge: Number(d?.baseCharge ?? 100), freeDeliveryThreshold: Number(d?.freeDeliveryThreshold ?? 2000) };
  },
  updateSettings: async (data: { baseCharge: number; freeDeliveryThreshold: number }): Promise<void> => {
    await api.put('/admin/restaurants/settings', {
      base_charge: data.baseCharge,
      free_delivery_threshold: data.freeDeliveryThreshold,
    });
  },
};
