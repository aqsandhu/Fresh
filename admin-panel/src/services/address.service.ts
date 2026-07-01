import { api, unwrap } from './api';
import type { 
  Address,
  ApiResponse 
} from '@/types';

interface AddressFilters {
  page?: number;
  limit?: number;
  search?: string;
  city?: string;
  area?: string;
}

export const addressService = {
  getAddresses: async (filters: AddressFilters = {}): Promise<{ addresses: Address[]; pagination: any }> => {
    try {
      const response = await api.get<ApiResponse<{ addresses: Address[]; pagination: any }>>('/admin/addresses', filters);
      return {
        addresses: response.data?.addresses || [],
        pagination: response.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
    } catch (error: any) {
      console.error('Error fetching addresses:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch addresses');
    }
  },

  getAddressById: async (id: string): Promise<Address> => {
    try {
      const response = await api.get<ApiResponse<Address>>(`/admin/addresses/${id}`);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching address:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch address');
    }
  },

  assignHouseNumber: async (id: string, houseNumber: string): Promise<Address> => {
    try {
      const response = await api.put<ApiResponse<Address>>(`/admin/addresses/${id}/house-number`, {
        houseNumber,
      });
      return unwrap(response);
    } catch (error: any) {
      console.error('Error assigning house number:', error);
      throw new Error(error?.response?.data?.message || 'Failed to assign house number');
    }
  },

  updateAddress: async (id: string, data: Partial<Address>): Promise<Address> => {
    try {
      const response = await api.put<ApiResponse<Address>>(`/admin/addresses/${id}`, data);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error updating address:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update address');
    }
  },

  deleteAddress: async (id: string): Promise<void> => {
    try {
      await api.delete<ApiResponse<void>>(`/admin/addresses/${id}`);
    } catch (error: any) {
      console.error('Error deleting address:', error);
      throw new Error(error?.response?.data?.message || 'Failed to delete address');
    }
  },

  clearDoorPicture: async (id: string): Promise<Address> => {
    try {
      const response = await api.delete<ApiResponse<Address>>(`/admin/addresses/${id}/door-picture`);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error removing door picture:', error);
      throw new Error(error?.response?.data?.message || 'Failed to remove door picture');
    }
  },

  clearLocation: async (id: string): Promise<Address> => {
    try {
      const response = await api.delete<ApiResponse<Address>>(`/admin/addresses/${id}/location`);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error removing location:', error);
      throw new Error(error?.response?.data?.message || 'Failed to remove location');
    }
  },

  searchAddresses: async (query: string, limit: number = 10): Promise<Address[]> => {
    try {
      const response = await api.get<ApiResponse<Address[]>>('/admin/addresses/search', {
        query,
        limit,
      });
      return unwrap(response);
    } catch (error: any) {
      console.error('Error searching addresses:', error);
      throw new Error(error?.response?.data?.message || 'Failed to search addresses');
    }
  },

  getAddressesByArea: async (area: string): Promise<Address[]> => {
    try {
      const response = await api.get<ApiResponse<Address[]>>(`/admin/addresses/area/${area}`);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching addresses by area:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch addresses by area');
    }
  },

  getAreas: async (): Promise<string[]> => {
    try {
      const response = await api.get<ApiResponse<string[]>>('/admin/addresses/areas');
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching areas:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch areas');
    }
  },

  getCities: async (): Promise<string[]> => {
    try {
      const response = await api.get<ApiResponse<string[]>>('/admin/addresses/cities');
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching cities:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch cities');
    }
  },

  validateAddress: async (addressData: {
    writtenAddress: string;
    areaName: string;
    city: string;
  }): Promise<{
    isValid: boolean;
    suggestions?: string[];
    coordinates?: { lat: number; lng: number };
  }> => {
    try {
      const response = await api.post<ApiResponse<{
        isValid: boolean;
        suggestions?: string[];
        coordinates?: { lat: number; lng: number };
      }>>('/admin/addresses/validate', addressData);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error validating address:', error);
      throw new Error(error?.response?.data?.message || 'Failed to validate address');
    }
  },
};
