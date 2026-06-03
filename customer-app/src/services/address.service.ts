import apiClient, { handleApiError } from './api';
import { ApiResponse, Address } from '@types';
import { API_BASE_URL } from '@utils/constants';

const BACKEND_URL = API_BASE_URL.replace('/api', '');

function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('data:')) return path;
  const absMatch = path.match(/^https?:\/\/([^/]+)(\/.*)?$/);
  if (absMatch) {
    const host = absMatch[1].split(':')[0];
    const rest = absMatch[2] || '';
    const isLocalOrLan = host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    return isLocalOrLan ? `${BACKEND_URL}${rest}` : path;
  }
  return path.startsWith('/') ? `${BACKEND_URL}${path}` : `${BACKEND_URL}/${path}`;
}

export interface CreateAddressRequest {
  label: string;
  fullAddress: string;
  areaName?: string;
  city?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  doorImage?: string;
  isDefault?: boolean;
}

function mapBackendAddress(raw: any): Address {
  const parts = [raw.written_address, raw.area_name, raw.city].filter(Boolean);
  const doorUrl = raw.door_picture_url ? resolveImageUrl(raw.door_picture_url) : undefined;

  return {
    id: raw.id,
    userId: raw.user_id || '',
    label: raw.address_type || 'home',
    fullAddress: parts.join(', ') || raw.written_address || '',
    writtenAddress: raw.written_address || '',
    areaName: raw.area_name || '',
    landmark: raw.landmark || '',
    city: raw.city || '',
    latitude: parseFloat(raw.latitude) || 0,
    longitude: parseFloat(raw.longitude) || 0,
    doorImage: doorUrl,
    isDefault: raw.is_default || false,
    createdAt: raw.created_at || '',
  } as Address;
}

const VALID_ADDRESS_TYPES = ['home', 'work', 'office', 'other'] as const;

function normalizeAddressType(label?: string): string {
  if (!label) return 'home';
  const normalized = String(label).toLowerCase().trim();
  return (VALID_ADDRESS_TYPES as readonly string[]).includes(normalized) ? normalized : 'other';
}

function toBackendAddress(data: Partial<CreateAddressRequest>): Record<string, string | number | boolean> {
  const body: Record<string, string | number | boolean> = {};
  if (data.label !== undefined) body.address_type = normalizeAddressType(data.label);
  if (data.fullAddress !== undefined) body.written_address = data.fullAddress;
  if (data.areaName !== undefined) body.area_name = data.areaName;
  if (data.city !== undefined) body.city = data.city;
  if (data.landmark !== undefined) body.landmark = data.landmark;
  if (data.latitude !== undefined) body.latitude = data.latitude;
  if (data.longitude !== undefined) body.longitude = data.longitude;
  if (data.locationAccuracy !== undefined) body.location_accuracy = data.locationAccuracy;
  if (data.isDefault !== undefined) body.is_default = data.isDefault;
  return body;
}

function isLocalDoorImageUri(uri: string): boolean {
  return /^(file|content|ph):\/\//i.test(uri);
}

function buildDoorFormData(data: Partial<CreateAddressRequest>, doorUri: string): FormData {
  const formData = new FormData();
  const fields = toBackendAddress(data);
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, String(value));
  });
  formData.append('door_picture', {
    uri: doorUri,
    type: 'image/jpeg',
    name: `door-${Date.now()}.jpg`,
  } as unknown as Blob);
  return formData;
}

class AddressService {
  async getAddresses(): Promise<ApiResponse<Address[]>> {
    try {
      const response = await apiClient.get('/addresses');
      const raw = response.data;
      const addresses = (raw.data || []).map(mapBackendAddress);
      return { success: true, data: addresses };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getAddressById(id: string): Promise<ApiResponse<Address>> {
    try {
      const response = await apiClient.get(`/addresses/${id}`);
      const raw = response.data;
      return { success: true, data: mapBackendAddress(raw.data) };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async createAddress(data: CreateAddressRequest): Promise<ApiResponse<Address>> {
    try {
      const doorUri = data.doorImage?.trim();
      if (doorUri && isLocalDoorImageUri(doorUri)) {
        const formData = buildDoorFormData(data, doorUri);
        const response = await apiClient.post('/addresses', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const raw = response.data;
        return { success: true, data: mapBackendAddress(raw.data) };
      }

      const body = toBackendAddress(data);
      const response = await apiClient.post('/addresses', body);
      const raw = response.data;
      return { success: true, data: mapBackendAddress(raw.data) };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async updateAddress(id: string, data: Partial<CreateAddressRequest>): Promise<ApiResponse<Address>> {
    try {
      const doorUri = data.doorImage?.trim();
      if (doorUri && isLocalDoorImageUri(doorUri)) {
        const formData = buildDoorFormData(data, doorUri);
        const response = await apiClient.put(`/addresses/${id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const raw = response.data;
        return { success: true, data: mapBackendAddress(raw.data) };
      }

      const body = toBackendAddress(data);
      const response = await apiClient.put(`/addresses/${id}`, body);
      const raw = response.data;
      return { success: true, data: mapBackendAddress(raw.data) };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async deleteAddress(id: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.delete(`/addresses/${id}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async setDefaultAddress(id: string): Promise<ApiResponse<Address>> {
    try {
      const response = await apiClient.put(`/addresses/${id}/set-default`);
      const raw = response.data;
      return { success: true, data: mapBackendAddress(raw.data) };
    } catch (error) {
      throw handleApiError(error);
    }
  }
}

export const addressService = new AddressService();
export default addressService;
