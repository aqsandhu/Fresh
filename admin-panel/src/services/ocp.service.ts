import { api } from './api';
import type { ApiResponse } from '@/types';

export interface Ocp {
  id: string;
  name: string;
  ownerName?: string | null;
  phone: string;
  cityId: string | null;
  city?: string | null;
  address?: string | null;
  status: 'active' | 'disabled';
  orderCount?: number;
}

export interface OcpStockLine { productId: string; quality: 'A' | 'B' | 'C'; quantity: number }

export const ocpService = {
  list: async (cityId?: string): Promise<Ocp[]> => {
    const res = await api.get<ApiResponse<Ocp[]>>('/admin/ocp', cityId ? { city_id: cityId } : undefined);
    return res.data || [];
  },
  create: async (data: {
    name: string; phone: string; pin: string; cityId: string; ownerName?: string; address?: string;
  }): Promise<Ocp> => {
    const res = await api.post<ApiResponse<Ocp>>('/admin/ocp', {
      name: data.name, phone: data.phone, pin: data.pin, city_id: data.cityId,
      owner_name: data.ownerName, address: data.address,
    });
    return res.data;
  },
  update: async (id: string, data: Record<string, any>): Promise<Ocp> => {
    const res = await api.put<ApiResponse<Ocp>>(`/admin/ocp/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/admin/ocp/${id}`);
  },

  listStockRequests: async (ocpId: string): Promise<any[]> => {
    const res = await api.get<ApiResponse<any[]>>(`/admin/ocp/${ocpId}/stock-requests`);
    return res.data || [];
  },
  sendStock: async (ocpId: string, items: OcpStockLine[], note?: string): Promise<void> => {
    await api.post(`/admin/ocp/${ocpId}/stock-requests`, {
      items: items.map((i) => ({ product_id: i.productId, quality: i.quality, quantity: i.quantity })),
      note,
    });
  },

  listSettlements: async (status: 'pending' | 'received' | 'rejected' = 'pending'): Promise<any[]> => {
    const res = await api.get<ApiResponse<any[]>>('/admin/ocp/settlements', { status });
    return res.data || [];
  },
  receiveSettlement: async (id: string, password: string): Promise<void> => {
    await api.post(`/admin/ocp/settlements/${id}/receive`, { password });
  },
  rejectSettlement: async (id: string): Promise<void> => {
    await api.post(`/admin/ocp/settlements/${id}/reject`, {});
  },
};
