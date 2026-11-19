import { api } from './api';
import type { ApiResponse } from '@/types';

export interface BadgeCounts {
  orders: number;
  consumerOrders: number;
  restaurantOrders: number;
  riderApplications: number;
  restaurantRequests: number;
  /** Entries waiting for this admin's approval (J1). */
  approvals?: number;
}

export const badgeService = {
  counts: async (): Promise<BadgeCounts> => {
    const res = await api.get<ApiResponse<BadgeCounts>>('/admin/badge-counts');
    return res.data || {
      orders: 0,
      consumerOrders: 0,
      restaurantOrders: 0,
      riderApplications: 0,
      restaurantRequests: 0,
    };
  },
};
