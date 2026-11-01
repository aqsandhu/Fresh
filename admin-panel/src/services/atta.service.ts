import { api, unwrap } from './api';
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
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching atta requests:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch atta requests');
    }
  },

  updateStatus: async (id: string, status: AttaRequestStatus, notes?: string): Promise<AttaRequest> => {
    try {
      const response = await api.put<ApiResponse<AttaRequest>>(`/admin/atta-requests/${id}/status`, {
        status,
        notes,
      });
      return unwrap(response);
    } catch (error: any) {
      console.error('Error updating atta request status:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update status');
    }
  },

  /**
   * Assign the rider who collects the wheat (atta_pickup) or brings the flour
   * back (atta_delivery). The status is NOT moved — the rider's own taps do that.
   */
  assignRider: async (
    id: string,
    riderId: string,
    taskType: 'atta_pickup' | 'atta_delivery'
  ): Promise<{ taskId: string; requestId: string; taskType: string }> => {
    try {
      const response = await api.put<ApiResponse<{ taskId: string; requestId: string; taskType: string }>>(
        `/admin/atta-requests/${id}/assign-rider`,
        { riderId, taskType }
      );
      return unwrap(response);
    } catch (error: any) {
      console.error('Error assigning rider to atta request:', error);
      throw new Error(error?.response?.data?.message || 'Failed to assign rider');
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
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching atta stats:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch atta stats');
    }
  },

};
