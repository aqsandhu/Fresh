import { asCaughtError } from '@/lib/caughtError';
import { api, unwrap } from './api';
import type { 
  Address,
  ApiResponse, Pagination } from '@/types';

interface AddressFilters {
  page?: number;
  limit?: number;
  search?: string;
  city?: string;
  area?: string;
}

export const addressService = {
  getAddresses: async (filters: AddressFilters = {}): Promise<{ addresses: Address[]; pagination: Pagination }> => {
    try {
      const response = await api.get<ApiResponse<{ addresses: Address[]; pagination: Pagination }>>('/admin/addresses', filters);
      return {
        addresses: response.data?.addresses || [],
        pagination: response.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
    } catch (errorCaught: unknown) {
      const error = asCaughtError(errorCaught);
      console.error('Error fetching addresses:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch addresses');
    }
  },

  assignHouseNumber: async (id: string, houseNumber: string): Promise<Address> => {
    try {
      const response = await api.put<ApiResponse<Address>>(`/admin/addresses/${id}/house-number`, {
        houseNumber,
      });
      return unwrap(response);
    } catch (errorCaught: unknown) {
      const error = asCaughtError(errorCaught);
      console.error('Error assigning house number:', error);
      throw new Error(error?.response?.data?.message || 'Failed to assign house number');
    }
  },

  deleteAddress: async (id: string): Promise<void> => {
    try {
      await api.delete<ApiResponse<void>>(`/admin/addresses/${id}`);
    } catch (errorCaught: unknown) {
      const error = asCaughtError(errorCaught);
      console.error('Error deleting address:', error);
      throw new Error(error?.response?.data?.message || 'Failed to delete address');
    }
  },

  clearDoorPicture: async (id: string): Promise<Address> => {
    try {
      const response = await api.delete<ApiResponse<Address>>(`/admin/addresses/${id}/door-picture`);
      return unwrap(response);
    } catch (errorCaught: unknown) {
      const error = asCaughtError(errorCaught);
      console.error('Error removing door picture:', error);
      throw new Error(error?.response?.data?.message || 'Failed to remove door picture');
    }
  },

  clearLocation: async (id: string): Promise<Address> => {
    try {
      const response = await api.delete<ApiResponse<Address>>(`/admin/addresses/${id}/location`);
      return unwrap(response);
    } catch (errorCaught: unknown) {
      const error = asCaughtError(errorCaught);
      console.error('Error removing location:', error);
      throw new Error(error?.response?.data?.message || 'Failed to remove location');
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
    } catch (errorCaught: unknown) {
      const error = asCaughtError(errorCaught);
      console.error('Error validating address:', error);
      throw new Error(error?.response?.data?.message || 'Failed to validate address');
    }
  },
};
