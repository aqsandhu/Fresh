import { api } from './api';
import type { 
  AttaRequest, 
  AttaRequestStatus,
  PaginatedResponse, 
  ApiResponse 
} from '@/types';

interface AttaRequestFilters {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export const attaService = {
  getAttaRequests: async (filters: AttaRequestFilters = {}): Promise<PaginatedResponse<AttaRequest>> => {
    try {
      const response = await api.get<ApiResponse<PaginatedResponse<AttaRequest>>>('/admin/atta-requests', filters);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching atta requests:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch atta requests');
    }
  },

  getAttaRequestById: async (id: string): Promise<AttaRequest> => {
    try {
      const response = await api.get<ApiResponse<AttaRequest>>(`/admin/atta-requests/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching atta request:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch atta request');
    }
  },

  updateStatus: async (id: string, status: AttaRequestStatus, notes?: string): Promise<AttaRequest> => {
    try {
      const response = await api.put<ApiResponse<AttaRequest>>(`/admin/atta-requests/${id}/status`, {
        status,
        notes,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error updating atta request status:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update status');
    }
  },

  assignRider: async (id: string, riderId: string): Promise<AttaRequest> => {
    try {
      const response = await api.put<ApiResponse<AttaRequest>>(`/admin/atta-requests/${id}/assign-rider`, {
        riderId,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error assigning rider to atta request:', error);
      throw new Error(error?.response?.data?.message || 'Failed to assign rider');
    }
  },

  updatePricing: async (id: string, millingCharge: number, deliveryCharge: number): Promise<AttaRequest> => {
    try {
      const response = await api.put<ApiResponse<AttaRequest>>(`/admin/atta-requests/${id}/pricing`, {
        millingCharge,
        deliveryCharge,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error updating atta request pricing:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update pricing');
    }
  },

  getAttaStats: async (period: 'today' | 'week' | 'month' | 'year' = 'today'): Promise<{
    totalRequests: number;
    pendingRequests: number;
    inProgressRequests: number;
    completedRequests: number;
    totalRevenue: number;
  }> => {
    try {
      const response = await api.get<ApiResponse<{
        totalRequests: number;
        pendingRequests: number;
        inProgressRequests: number;
        completedRequests: number;
        totalRevenue: number;
      }>>('/admin/atta-requests/stats', { period });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching atta stats:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch atta stats');
    }
  },

  cancelRequest: async (id: string, reason: string): Promise<AttaRequest> => {
    try {
      const response = await api.put<ApiResponse<AttaRequest>>(`/admin/atta-requests/${id}/cancel`, {
        reason,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error cancelling atta request:', error);
      throw new Error(error?.response?.data?.message || 'Failed to cancel request');
    }
  },
};
