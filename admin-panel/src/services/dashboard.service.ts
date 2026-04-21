import { api } from './api';
import type { DashboardData, ApiResponse } from '@/types';

export const dashboardService = {
  getDashboardData: async (): Promise<DashboardData> => {
    try {
      const response = await api.get<ApiResponse<DashboardData>>('/admin/dashboard');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch dashboard data');
    }
  },

  getSalesReport: async (startDate: string, endDate: string) => {
    try {
      const response = await api.get<ApiResponse<any>>('/admin/reports/sales', { startDate, endDate });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching sales report:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch sales report');
    }
  },

  getOrderReport: async (startDate: string, endDate: string, groupBy: 'day' | 'week' | 'month' = 'day') => {
    try {
      const response = await api.get<ApiResponse<any>>('/admin/reports/orders', { 
        startDate, 
        endDate,
        groupBy,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching order report:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch order report');
    }
  },

  getProductReport: async (startDate: string, endDate: string, limit: number = 10) => {
    try {
      const response = await api.get<ApiResponse<any>>('/admin/reports/products', { 
        startDate, 
        endDate,
        limit,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching product report:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch product report');
    }
  },

  getRiderReport: async (startDate: string, endDate: string) => {
    try {
      const response = await api.get<ApiResponse<any>>('/admin/reports/riders', { startDate, endDate });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching rider report:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch rider report');
    }
  },
};
