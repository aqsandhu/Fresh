import { api, unwrap } from './api';
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

/** A restaurant order as the server lists it (only the id is relied on here). */
export interface RestaurantOrderRow {
  id: string;
  order_number?: string;
  status?: string;
  [column: string]: unknown;
}

/** A restaurant delivery slot (older answers use snake_case names). */
export interface RestaurantSlot {
  id: string;
  slotName?: string;
  slot_name?: string;
  maxOrders?: number | null;
  max_orders?: number | null;
  isFreeDeliverySlot?: boolean;
  is_free_delivery_slot?: boolean;
  isActive?: boolean;
  is_active?: boolean;
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
  getOrders: async (status?: string): Promise<{ orders: RestaurantOrderRow[]; counts: Record<string, number> }> => {
    const res = await api.get<ApiResponse<{ orders: RestaurantOrderRow[]; counts: Record<string, number> }>>(
      '/admin/restaurants/orders',
      status ? { status } : undefined
    );
    const data = (res.data || {}) as Partial<{ orders: RestaurantOrderRow[]; counts: Record<string, number> }>;
    return { orders: data.orders || [], counts: data.counts || {} };
  },
  updateOrderStatus: async (id: string, data: { status?: string; riderId?: string | null }): Promise<RestaurantOrderRow> => {
    const body: Record<string, unknown> = {};
    if (data.status !== undefined) body.status = data.status;
    if (data.riderId !== undefined) body.rider_id = data.riderId;
    const res = await api.put<ApiResponse<RestaurantOrderRow>>(`/admin/restaurants/orders/${id}/status`, body);
    return unwrap(res);
  },

  // Admin places a restaurant order on its behalf (WhatsApp restaurant portion).
  placeOrder: async (data: {
    restaurantId: string;
    items: { productId: string; quantity: number; unit: string; quality: string }[];
    customerNotes?: string;
  }): Promise<RestaurantOrderRow> => {
    const res = await api.post<ApiResponse<RestaurantOrderRow>>('/admin/restaurants/orders', {
      restaurantId: data.restaurantId,
      items: data.items,
      customerNotes: data.customerNotes,
    });
    return unwrap(res);
  },

  // ── Dashboard + global delivery settings ───────────────────────────────
  getDashboard: async (): Promise<Record<string, number>> => {
    const res = await api.get<ApiResponse<Record<string, number>>>('/admin/restaurants/dashboard');
    return res.data || {};
  },
  getSettings: async (): Promise<{ baseCharge: number; freeDeliveryThreshold: number; urgentCharge: number; urgentEta: string; slotCutoffPercent: number }> => {
    const res = await api.get<ApiResponse<Partial<Record<'baseCharge' | 'freeDeliveryThreshold' | 'urgentCharge' | 'urgentEta' | 'slotCutoffPercent', unknown>>>>('/admin/restaurants/settings');
    const d = res.data;
    return {
      baseCharge: Number(d?.baseCharge ?? 100),
      freeDeliveryThreshold: Number(d?.freeDeliveryThreshold ?? 2000),
      urgentCharge: Number(d?.urgentCharge ?? 0),
      urgentEta: String(d?.urgentEta ?? ''),
      slotCutoffPercent: Number(d?.slotCutoffPercent ?? 60),
    };
  },
  updateSettings: async (data: {
    baseCharge: number;
    freeDeliveryThreshold: number;
    urgentCharge?: number;
    urgentEta?: string;
    slotCutoffPercent?: number;
  }): Promise<void> => {
    await api.put('/admin/restaurants/settings', {
      base_charge: data.baseCharge,
      free_delivery_threshold: data.freeDeliveryThreshold,
      ...(data.urgentCharge !== undefined ? { urgent_charge: data.urgentCharge } : {}),
      ...(data.urgentEta !== undefined ? { urgent_eta: data.urgentEta } : {}),
      ...(data.slotCutoffPercent !== undefined ? { slot_cutoff_percent: data.slotCutoffPercent } : {}),
    });
  },

  // Restaurant time slots — reuse the admin settings slot CRUD with audience=restaurant.
  listTimeSlots: async (): Promise<RestaurantSlot[]> => {
    const res = await api.get<ApiResponse<RestaurantSlot[]>>('/admin/settings/time-slots', { audience: 'restaurant' });
    return res.data || [];
  },
  createTimeSlot: async (data: {
    startTime: string;
    endTime: string;
    /** null / undefined = no limit. */
    maxOrders?: number | null;
    isActive?: boolean;
    isFreeDeliverySlot?: boolean;
  }): Promise<RestaurantSlot> => {
    // `?audience=restaurant` on every call lets the backend permission map
    // grant these to `restaurants.manage` admins without Settings rights.
    const res = await api.post<ApiResponse<RestaurantSlot>>('/admin/settings/time-slots?audience=restaurant', {
      start_time: data.startTime,
      end_time: data.endTime,
      max_orders: data.maxOrders ?? null,
      is_active: data.isActive !== false,
      is_free_delivery_slot: data.isFreeDeliverySlot === true,
      audience: 'restaurant',
    });
    return unwrap(res);
  },
  updateTimeSlot: async (id: string, data: Record<string, unknown>): Promise<RestaurantSlot> => {
    const res = await api.put<ApiResponse<RestaurantSlot>>(`/admin/settings/time-slots/${id}?audience=restaurant`, data);
    return unwrap(res);
  },
  deleteTimeSlot: async (id: string): Promise<void> => {
    await api.delete(`/admin/settings/time-slots/${id}?audience=restaurant`);
  },
};
