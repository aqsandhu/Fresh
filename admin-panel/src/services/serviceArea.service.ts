import { api } from './api';
import type { ApiResponse } from '@/types';

/** A boundary point is [lng, lat] (GeoJSON order). */
export type LngLat = [number, number];

export interface ServiceArea {
  id: string;
  cityId: string;
  name: string;
  polygon: LngLat[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceAreaMessages {
  title: string;
  messageEn: string;
  messageUr: string;
  whatsapp: string;
}

export const serviceAreaService = {
  list: async (cityId?: string): Promise<ServiceArea[]> => {
    const res = await api.get<ApiResponse<ServiceArea[]>>(
      '/admin/service-areas',
      cityId ? { cityId } : undefined
    );
    return res.data;
  },

  create: async (payload: {
    cityId: string;
    name?: string;
    polygon: LngLat[];
  }): Promise<ServiceArea> => {
    const res = await api.post<ApiResponse<ServiceArea>>('/admin/service-areas', payload);
    return res.data;
  },

  update: async (
    id: string,
    payload: Partial<{ name: string; polygon: LngLat[]; isActive: boolean }>
  ): Promise<ServiceArea> => {
    const res = await api.put<ApiResponse<ServiceArea>>(`/admin/service-areas/${id}`, payload);
    return res.data;
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/admin/service-areas/${id}`);
  },

  getMessages: async (): Promise<ServiceAreaMessages> => {
    const res = await api.get<ApiResponse<ServiceAreaMessages>>('/admin/service-areas/messages');
    return res.data;
  },

  updateMessages: async (
    payload: Partial<ServiceAreaMessages>
  ): Promise<ServiceAreaMessages> => {
    const res = await api.put<ApiResponse<ServiceAreaMessages>>(
      '/admin/service-areas/messages',
      payload
    );
    return res.data;
  },
};
