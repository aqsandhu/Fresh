import { api } from './api';
import type { ApiResponse } from '@/types';

export interface UserTip {
  id: string;
  cityId: string | null;
  cityName: string | null;
  page: string;
  textUr: string;
  priority: number;
  isActive: boolean;
  isSeed: boolean;
  createdAt: string;
}

export interface CreateTipInput {
  page: string;
  textUr: string;
  priority?: number;
  /** Super admin only: '' / undefined = global, a city id = that city. */
  cityId?: string;
}

export interface UpdateTipInput {
  textUr?: string;
  priority?: number;
  isActive?: boolean;
}

// The api layer converts camelCase <-> snake_case both ways.
export const tipsService = {
  list: async (): Promise<UserTip[]> => {
    const res = await api.get<ApiResponse<UserTip[]>>('/admin/tips');
    return (res.data as UserTip[]) || [];
  },
  create: async (data: CreateTipInput): Promise<UserTip> => {
    const res = await api.post<ApiResponse<UserTip>>('/admin/tips', data);
    return res.data as UserTip;
  },
  update: async (id: string, data: UpdateTipInput): Promise<UserTip> => {
    const res = await api.put<ApiResponse<UserTip>>(`/admin/tips/${id}`, data);
    return res.data as UserTip;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/admin/tips/${id}`);
  },
};
