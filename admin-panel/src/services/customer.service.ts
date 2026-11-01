import { api, apiClient, unwrap } from './api';
import type { Customer, Address, ApiResponse } from '@/types';

interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  segment?: string;
  days?: number;
}

export const customerService = {
  /** Download a customer segment as a CSV blob. */
  exportCustomers: async (filters: { segment?: string; days?: number; search?: string } = {}): Promise<Blob> => {
    const response = await apiClient.get('/admin/customers/export', {
      params: filters,
      responseType: 'blob',
    });
    return response.data as Blob;
  },

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

  getCustomerAddresses: async (customerId: string): Promise<Address[]> => {
    try {
      const response = await api.get<ApiResponse<Address[]>>(`/admin/customers/${customerId}/addresses`);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching customer addresses:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch customer addresses');
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
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching customer stats:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch customer stats');
    }
  },

  deleteCustomer: async (
    id: string,
    options: { deleteOrders?: boolean; deleteAddresses?: boolean } = {}
  ): Promise<{ deletedOrders: number; deletedAddresses: number }> => {
    try {
      const response = await api.delete<
        ApiResponse<{ deletedOrders: number; deletedAddresses: number }>
      >(`/admin/customers/${id}`, {
        deleteOrders: options.deleteOrders ?? false,
        deleteAddresses: options.deleteAddresses ?? false,
      });
      return unwrap(response);
    } catch (error: any) {
      console.error('Error deleting customer:', error);
      throw new Error(error?.response?.data?.message || 'Failed to delete customer');
    }
  },
};
