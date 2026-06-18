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

  // Admin places a restaurant order on its behalf (WhatsApp restaurant portion).
  placeOrder: async (data: {
    restaurantId: string;
    items: { productId: string; quantity: number; unit: string; quality: string }[];
    customerNotes?: string;
  }): Promise<any> => {
    const res = await api.post<ApiResponse<any>>('/admin/restaurants/orders', {
      restaurantId: data.restaurantId,
      items: data.items,
      customerNotes: data.customerNotes,
    });
    return res.data;
  },

  // ── Dashboard + global delivery settings ───────────────────────────────
  getDashboard: async (): Promise<Record<string, number>> => {
    const res = await api.get<ApiResponse<Record<string, number>>>('/admin/restaurants/dashboard');
    return res.data || {};
  },
  getSettings: async (): Promise<{ baseCharge: number; freeDeliveryThreshold: number; urgentCharge: number; urgentEta: string }> => {
    const res = await api.get<ApiResponse<any>>('/admin/restaurants/settings');
    const d = res.data as any;
    return {
      baseCharge: Number(d?.baseCharge ?? 100),
      freeDeliveryThreshold: Number(d?.freeDeliveryThreshold ?? 2000),
      urgentCharge: Number(d?.urgentCharge ?? 0),
      urgentEta: String(d?.urgentEta ?? ''),
    };
  },
  updateSettings: async (data: {
    baseCharge: number;
    freeDeliveryThreshold: number;
    urgentCharge?: number;
    urgentEta?: string;
  }): Promise<void> => {
    await api.put('/admin/restaurants/settings', {
      base_charge: data.baseCharge,
      free_delivery_threshold: data.freeDeliveryThreshold,
      ...(data.urgentCharge !== undefined ? { urgent_charge: data.urgentCharge } : {}),
      ...(data.urgentEta !== undefined ? { urgent_eta: data.urgentEta } : {}),
    });
  },

  // Restaurant time slots — reuse the admin settings slot CRUD with audience=restaurant.
  listTimeSlots: async (): Promise<any[]> => {
    const res = await api.get<ApiResponse<any[]>>('/admin/settings/time-slots', { audience: 'restaurant' });
    return res.data || [];
  },
  createTimeSlot: async (data: {
    startTime: string;
    endTime: string;
    maxOrders?: number;
    isActive?: boolean;
    isFreeDeliverySlot?: boolean;
  }): Promise<any> => {
    const res = await api.post<ApiResponse<any>>('/admin/settings/time-slots', {
      start_time: data.startTime,
      end_time: data.endTime,
      max_orders: data.maxOrders ?? 50,
      is_active: data.isActive !== false,
      is_free_delivery_slot: data.isFreeDeliverySlot === true,
      audience: 'restaurant',
    });
    return res.data;
  },
  updateTimeSlot: async (id: string, data: Record<string, any>): Promise<any> => {
    const res = await api.put<ApiResponse<any>>(`/admin/settings/time-slots/${id}`, data);
    return res.data;
  },
  deleteTimeSlot: async (id: string): Promise<void> => {
    await api.delete(`/admin/settings/time-slots/${id}`);
  },
};
