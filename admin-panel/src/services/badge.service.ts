import { api } from './api';
import type { ApiResponse } from '@/types';

export interface BadgeCounts {
  orders: number;
  riderApplications: number;
  restaurantRequests: number;
}

export const badgeService = {
  counts: async (): Promise<BadgeCounts> => {
    const res = await api.get<ApiResponse<BadgeCounts>>('/admin/badge-counts');
    return res.data || { orders: 0, riderApplications: 0, restaurantRequests: 0 };
  },
};
