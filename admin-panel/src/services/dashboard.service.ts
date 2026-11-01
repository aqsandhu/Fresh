import { api, unwrap } from './api';
import type { DashboardData, ApiResponse } from '@/types';

export const dashboardService = {
  getDashboardData: async (): Promise<DashboardData> => {
    try {
      const response = await api.get<ApiResponse<DashboardData>>('/admin/dashboard');
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch dashboard data');
    }
  },

};
