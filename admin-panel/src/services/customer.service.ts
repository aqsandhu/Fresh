import { api } from './api';
import type { Customer, Address, ApiResponse } from '@/types';

interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export const customerService = {
  getCustomers: async (filters: CustomerFilters = {}): Promise<{ customers: Customer[]; pagination: any }> => {
    try {
      const response = await api.get<ApiResponse<{ customers: Customer[]; pagination: any }>>('/admin/customers', filters);
      return {
        customers: response.data?.customers || [],
        pagination: response.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
    } catch (error: any) {
      console.error('Error fetching customers:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch customers');
    }
  },

  getCustomerById: async (id: string): Promise<Customer> => {
    try {
      const response = await api.get<ApiResponse<Customer>>(`/admin/customers/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching customer:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch customer');
    }
  },

  getCustomerAddresses: async (customerId: string): Promise<Address[]> => {
    try {
      const response = await api.get<ApiResponse<Address[]>>(`/admin/customers/${customerId}/addresses`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching customer addresses:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch customer addresses');
    }
  },

  getCustomerOrders: async (customerId: string, page: number = 1, limit: number = 10): Promise<{
    orders: any[];
    pagination: any;
  }> => {
    try {
      const response = await api.get<ApiResponse<{
        orders: any[];
        pagination: any;
      }>>(`/admin/customers/${customerId}/orders`, { page, limit });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching customer orders:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch customer orders');
    }
  },

  updateCustomerStatus: async (id: string, status: string): Promise<Customer> => {
    try {
      const response = await api.patch<ApiResponse<Customer>>(`/admin/customers/${id}/status`, {
        status,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error updating customer status:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update customer status');
    }
  },

  getCustomerStats: async (id: string): Promise<{
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
    lastOrderDate: string | null;
  }> => {
    try {
      const response = await api.get<ApiResponse<{
        totalOrders: number;
        totalSpent: number;
        averageOrderValue: number;
        lastOrderDate: string | null;
      }>>(`/admin/customers/${id}/stats`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching customer stats:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch customer stats');
    }
  },

  searchCustomers: async (query: string, limit: number = 10): Promise<Customer[]> => {
    try {
      const response = await api.get<ApiResponse<Customer[]>>('/admin/customers/search', {
        query,
        limit,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error searching customers:', error);
      throw new Error(error?.response?.data?.message || 'Failed to search customers');
    }
  },
};
