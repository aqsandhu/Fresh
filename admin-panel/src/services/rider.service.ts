import { api } from './api';
import type { 
  Rider, 
  ApiResponse,
  RiderStats,
  RiderDeliveryCharge,
} from '@/types';

export const riderService = {
  getRiders: async (status?: string): Promise<Rider[]> => {
    try {
      const params = status ? { status } : undefined;
      const response = await api.get<ApiResponse<{ riders: Rider[]; pagination: any }>>(
        '/admin/riders',
        params
      );
      return response.data?.riders || [];
    } catch (error: any) {
      console.error('Error fetching riders:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch riders');
    }
  },

  getRiderById: async (id: string): Promise<Rider> => {
    try {
      const response = await api.get<ApiResponse<Rider>>(`/admin/riders/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching rider:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch rider');
    }
  },

  createRider: async (formData: FormData): Promise<Rider> => {
    try {
      const response = await api.postForm<ApiResponse<Rider>>('/admin/riders', formData);
      return response.data;
    } catch (error: any) {
      console.error('Error creating rider:', error);
      throw new Error(error?.response?.data?.message || 'Failed to create rider');
    }
  },

  updateRider: async (id: string, formData: FormData): Promise<Rider> => {
    try {
      const response = await api.putForm<ApiResponse<Rider>>(`/admin/riders/${id}`, formData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating rider:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update rider');
    }
  },

  deleteRider: async (id: string): Promise<void> => {
    try {
      await api.delete<ApiResponse<void>>(`/admin/riders/${id}`);
    } catch (error: any) {
      console.error('Error deleting rider:', error);
      throw new Error(error?.response?.data?.message || 'Failed to delete rider');
    }
  },

  updateRiderStatus: async (id: string, status: string): Promise<Rider> => {
    try {
      const response = await api.patch<ApiResponse<Rider>>(`/admin/riders/${id}/status`, {
        status,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error updating rider status:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update rider status');
    }
  },

  verifyRider: async (id: string, verificationStatus: string): Promise<Rider> => {
    try {
      const response = await api.patch<ApiResponse<Rider>>(`/admin/riders/${id}/verify`, {
        verificationStatus,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error verifying rider:', error);
      throw new Error(error?.response?.data?.message || 'Failed to verify rider');
    }
  },

  uploadRiderAvatar: async (id: string, avatar: File): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append('avatar', avatar);
      const response = await api.postForm<ApiResponse<{ avatarUrl: string }>>(
        `/admin/riders/${id}/avatar`,
        formData
      );
      return response.data.avatarUrl;
    } catch (error: any) {
      console.error('Error uploading rider avatar:', error);
      throw new Error(error?.response?.data?.message || 'Failed to upload avatar');
    }
  },

  getRiderStats: async (id: string): Promise<RiderStats> => {
    try {
      const response = await api.get<ApiResponse<RiderStats>>(`/admin/riders/${id}/stats`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching rider stats:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch rider stats');
    }
  },

  setDeliveryCharges: async (id: string, charges: RiderDeliveryCharge[]): Promise<any> => {
    try {
      const response = await api.put<ApiResponse<any>>(`/admin/riders/${id}/delivery-charges`, { charges });
      return response.data;
    } catch (error: any) {
      console.error('Error setting delivery charges:', error);
      throw new Error(error?.response?.data?.message || 'Failed to set delivery charges');
    }
  },

  assignOrderToRider: async (orderId: string, riderId: string): Promise<void> => {
    try {
      await api.put<ApiResponse<void>>(`/admin/orders/${orderId}/assign-rider`, {
        riderId,
      });
    } catch (error: any) {
      console.error('Error assigning order to rider:', error);
      throw new Error(error?.response?.data?.message || 'Failed to assign order');
    }
  },

  getRiderLocation: async (id: string): Promise<{ id: string; fullName: string; phone: string; status: string; latitude: number | null; longitude: number | null; accuracy: number | null; locationUpdatedAt: string | null }> => {
    try {
      const response = await api.get<ApiResponse<any>>(`/admin/riders/${id}/location`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching rider location:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch rider location');
    }
  },
};
