import { api, unwrap } from './api';
import type {
  Rider,
  ApiResponse,
  RiderStats,
  RiderDeliveryCharge,
  RiderTaskRow,
  RiderCashSettlement,
  RiderFeedback,
} from '@/types';

export interface RiderListFilters {
  status?: string;
  verificationStatus?: string;
  search?: string;
  online?: boolean;
  /** Backend default 200, max 500 — dispatch needs every rider. */
  limit?: number;
}

const failure = (error: any, fallback: string) =>
  new Error(error?.response?.data?.message || error?.message || fallback);

export const riderService = {
  /**
   * Riders in the admin's city. Accepts a bare status string (legacy callers)
   * or a filter object.
   */
  getRiders: async (filters?: string | RiderListFilters): Promise<Rider[]> => {
    try {
      const f: RiderListFilters = typeof filters === 'string' ? { status: filters } : filters || {};
      const params: Record<string, unknown> = {};
      if (f.status) params.status = f.status;
      if (f.verificationStatus) params.verificationStatus = f.verificationStatus;
      if (f.search?.trim()) params.search = f.search.trim();
      if (f.online) params.online = 'true';
      if (f.limit) params.limit = f.limit;
      const response = await api.get<ApiResponse<{ riders: Rider[]; pagination: any }>>(
        '/admin/riders',
        Object.keys(params).length ? params : undefined
      );
      return response.data?.riders || [];
    } catch (error: any) {
      console.error('Error fetching riders:', error);
      throw failure(error, 'Failed to fetch riders');
    }
  },

  /** Full record — license, emergency contact and bank details for the edit form. */
  getRiderById: async (id: string): Promise<Rider> => {
    try {
      const response = await api.get<ApiResponse<Rider>>(`/admin/riders/${id}`);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching rider:', error);
      throw failure(error, 'Failed to fetch rider');
    }
  },

  createRider: async (formData: FormData): Promise<Rider> => {
    try {
      const response = await api.postForm<ApiResponse<Rider>>('/admin/riders', formData);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error creating rider:', error);
      throw failure(error, 'Failed to create rider');
    }
  },

  updateRider: async (id: string, formData: FormData): Promise<Rider> => {
    try {
      const response = await api.putForm<ApiResponse<Rider>>(`/admin/riders/${id}`, formData);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error updating rider:', error);
      throw failure(error, 'Failed to update rider');
    }
  },

  deleteRider: async (id: string): Promise<void> => {
    try {
      await api.delete<ApiResponse<void>>(`/admin/riders/${id}`);
    } catch (error: any) {
      console.error('Error deleting rider:', error);
      throw failure(error, 'Failed to delete rider');
    }
  },

  updateRiderStatus: async (id: string, status: string): Promise<Rider> => {
    try {
      const response = await api.patch<ApiResponse<Rider>>(`/admin/riders/${id}/status`, {
        status,
      });
      return unwrap(response);
    } catch (error: any) {
      console.error('Error updating rider status:', error);
      throw failure(error, 'Failed to update rider status');
    }
  },

  /** verified = allowed to work · rejected = blocked (signed out everywhere) · pending. */
  verifyRider: async (id: string, verificationStatus: string): Promise<Rider> => {
    try {
      const response = await api.patch<ApiResponse<Rider>>(`/admin/riders/${id}/verify`, {
        verificationStatus,
      });
      return unwrap(response);
    } catch (error: any) {
      console.error('Error verifying rider:', error);
      throw failure(error, 'Failed to update rider verification');
    }
  },

  getRiderStats: async (id: string): Promise<RiderStats> => {
    try {
      const response = await api.get<ApiResponse<RiderStats>>(`/admin/riders/${id}/stats`);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching rider stats:', error);
      throw failure(error, 'Failed to fetch rider stats');
    }
  },

  getRiderTasks: async (
    id: string,
    scope: 'active' | 'history',
    page = 1
  ): Promise<{ tasks: RiderTaskRow[]; pagination: { page: number; total: number; totalPages: number } }> => {
    try {
      const response = await api.get<ApiResponse<{ tasks: RiderTaskRow[]; pagination: any }>>(
        `/admin/riders/${id}/tasks`,
        { scope, page, limit: 30 }
      );
      const data = unwrap(response);
      return { tasks: data.tasks || [], pagination: data.pagination || { page, total: 0, totalPages: 0 } };
    } catch (error: any) {
      throw failure(error, 'Failed to load rider tasks');
    }
  },

  getRiderFeedback: async (id: string): Promise<RiderFeedback> => {
    try {
      const response = await api.get<ApiResponse<RiderFeedback>>(`/admin/riders/${id}/feedback`);
      const data = unwrap(response);
      return { reviews: data.reviews || [], complaints: data.complaints || [] };
    } catch (error: any) {
      throw failure(error, 'Failed to load rider feedback');
    }
  },

  getCashSettlements: async (id: string): Promise<RiderCashSettlement[]> => {
    try {
      const response = await api.get<ApiResponse<RiderCashSettlement[]>>(`/admin/riders/${id}/cash-settlements`);
      return response.data || [];
    } catch (error: any) {
      throw failure(error, 'Failed to load cash hand-overs');
    }
  },

  receiveCashSettlement: async (
    id: string,
    data: { password: string; note?: string }
  ): Promise<{ id: string; amount: number; orders: number; atta?: number; receivedAt: string }> => {
    try {
      const response = await api.post<ApiResponse<{ id: string; amount: number; orders: number; atta?: number; receivedAt: string }>>(
        `/admin/riders/${id}/cash-settlements/receive`,
        data
      );
      return unwrap(response);
    } catch (error: any) {
      console.error('Error receiving rider cash:', error);
      throw failure(error, 'Failed to receive rider cash');
    }
  },

  /**
   * Per-slot pay + (optionally) the dedicated urgent-order pay.
   * urgentCharge: number = set, null = clear, undefined = leave unchanged.
   */
  setDeliveryCharges: async (id: string, charges: RiderDeliveryCharge[], urgentCharge?: number | null): Promise<any> => {
    try {
      const body: Record<string, unknown> = { charges };
      if (urgentCharge !== undefined) body.urgentCharge = urgentCharge;
      const response = await api.put<ApiResponse<any>>(`/admin/riders/${id}/delivery-charges`, body);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error setting delivery charges:', error);
      throw failure(error, 'Failed to set delivery charges');
    }
  },

  assignOrderToRider: async (orderId: string, riderId: string): Promise<void> => {
    try {
      await api.put<ApiResponse<void>>(`/admin/orders/${orderId}/assign-rider`, {
        riderId,
      });
    } catch (error: any) {
      console.error('Error assigning order to rider:', error);
      throw failure(error, 'Failed to assign order');
    }
  },

  getRiderLocation: async (id: string): Promise<{ id: string; fullName: string; phone: string; status: string; latitude: number | null; longitude: number | null; accuracy: number | null; locationUpdatedAt: string | null }> => {
    try {
      const response = await api.get<ApiResponse<any>>(`/admin/riders/${id}/location`);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching rider location:', error);
      throw failure(error, 'Failed to fetch rider location');
    }
  },
};
