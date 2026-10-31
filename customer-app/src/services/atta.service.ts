import apiClient, { handleApiError } from './api';
import { ApiResponse, AttaRequest, AttaRequestStatus, DeliverySlot, PaginatedResponse, Address } from '@app-types';

export interface CreateAttaRequest {
  addressId: string;
  wheatQuantityKg: number;
  wheatQuality?: 'desi' | 'imported' | 'mixed';
  wheatDescription?: string;
  flourType?: 'fine' | 'medium' | 'coarse';
  specialInstructions?: string;
}

/** Live admin-configured Atta Chakki charges (public endpoint). */
export interface AttaCharges {
  serviceCharge: number;
  millingChargePerKg: number;
  deliveryCharge: number;
  freeDeliveryThresholdKg: number;
}

/**
 * Same formula the server bills with (atta.controller calculateAttaCharges):
 * service + kg × milling + delivery (free from the threshold kg upwards).
 */
export function estimateAttaTotal(kg: number, c: AttaCharges) {
  const weight = Number.isFinite(kg) && kg > 0 ? kg : 0;
  const milling = weight * c.millingChargePerKg;
  const delivery = c.freeDeliveryThresholdKg > 0 && weight >= c.freeDeliveryThresholdKg ? 0 : c.deliveryCharge;
  return {
    service: c.serviceCharge,
    milling,
    delivery,
    total: weight > 0 ? c.serviceCharge + milling + delivery : 0,
  };
}

// Map backend atta response to customer app AttaRequest type
function mapBackendAttaRequest(raw: any): AttaRequest {
  const pickupAddress: Address = {
    id: '',
    userId: '',
    label: 'Pickup',
    fullAddress: raw.pickup_address || '',
    latitude: parseFloat(raw.latitude) || 0,
    longitude: parseFloat(raw.longitude) || 0,
    isDefault: false,
    createdAt: '',
  };

  const emptySlot: DeliverySlot = {
    id: '',
    date: '',
    startTime: '',
    endTime: '',
    label: '',
    available: false,
  };

  const wheatKg = parseFloat(raw.wheat_quantity_kg) || 0;
  const millingCharge = parseFloat(raw.milling_charge) || 0;

  return {
    id: raw.id,
    userId: raw.user_id || '',
    wheatWeight: wheatKg,
    pickupAddress: pickupAddress,
    preferredSlot: emptySlot,
    status: raw.status as AttaRequestStatus,
    pricePerKg: wheatKg > 0 ? millingCharge / wheatKg : 0,
    totalPrice: parseFloat(raw.total_amount) || 0,
    notes: raw.wheat_description || raw.special_instructions || undefined,
    createdAt: raw.created_at || '',
    estimatedCompletion: raw.delivery_scheduled_at || raw.milling_completed_at || undefined,
    completedAt: raw.delivered_at || undefined,
  };
}

class AttaService {
  async getCharges(): Promise<AttaCharges> {
    try {
      const response = await apiClient.get('/atta-requests/charges');
      const d = response.data?.data || {};
      return {
        serviceCharge: Number(d.service_charge) || 0,
        millingChargePerKg: Number(d.milling_charge_per_kg) || 0,
        deliveryCharge: Number(d.delivery_charge) || 0,
        freeDeliveryThresholdKg: Number(d.free_delivery_threshold_kg) || 0,
      };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async createRequest(data: CreateAttaRequest): Promise<ApiResponse<AttaRequest>> {
    try {
      const body = {
        address_id: data.addressId,
        wheat_quantity_kg: data.wheatQuantityKg,
        wheat_quality: data.wheatQuality || 'desi',
        wheat_description: data.wheatDescription,
        flour_type: data.flourType || 'fine',
        special_instructions: data.specialInstructions,
      };
      const response = await apiClient.post('/atta-requests', body);
      const raw = response.data;
      return { success: true, data: mapBackendAttaRequest(raw.data) };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getRequests(): Promise<ApiResponse<PaginatedResponse<AttaRequest>>> {
    try {
      const response = await apiClient.get('/atta-requests');
      const raw = response.data;
      const requests = (raw.data?.requests || raw.data || []).map(mapBackendAttaRequest);
      const pagination = raw.data?.pagination || {};
      return {
        success: true,
        data: {
          data: requests,
          total: pagination.total || requests.length,
          page: pagination.page || 1,
          limit: pagination.limit || 10,
          totalPages: pagination.totalPages || 1,
        },
      };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getRequestById(id: string): Promise<ApiResponse<AttaRequest>> {
    try {
      const response = await apiClient.get(`/atta-requests/${id}`);
      const raw = response.data;
      return { success: true, data: mapBackendAttaRequest(raw.data) };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async cancelRequest(id: string, reason?: string): Promise<ApiResponse<AttaRequest>> {
    try {
      const response = await apiClient.put(`/atta-requests/${id}/cancel`, { reason });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async trackRequest(id: string): Promise<ApiResponse<any>> {
    try {
      const response = await apiClient.get(`/atta-requests/track/${id}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getPricePerKg(): Promise<ApiResponse<{ price: number }>> {
    // Backend doesn't have a price endpoint — return default milling rate (Rs. 5/kg)
    return { success: true, data: { price: 5 } };
  }
}

export const attaService = new AttaService();
export default attaService;
