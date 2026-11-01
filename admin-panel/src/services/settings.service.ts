import { api, unwrap } from './api';
import type { 
  Settings,
  DeliverySettings,
  TimeSlot,
  BusinessHours,
  ApiResponse 
} from '@/types';

/** Atta Chakki charges (global). camelCase — the api layer converts. */
export interface AttaChargeSettings {
  serviceCharge: number;
  millingChargePerKg: number;
  deliveryCharge: number;
  freeDeliveryThresholdKg: number;
  canEdit?: boolean;
}

export const settingsService = {
  getAttaCharges: async (): Promise<AttaChargeSettings> => {
    try {
      const response = await api.get<ApiResponse<AttaChargeSettings>>('/admin/settings/atta-charges');
      return unwrap(response);
    } catch (error: any) {
      throw new Error(error?.response?.data?.message || 'Failed to load Atta Chakki charges');
    }
  },

  updateAttaCharges: async (data: Omit<AttaChargeSettings, 'canEdit'>): Promise<AttaChargeSettings> => {
    try {
      const response = await api.put<ApiResponse<AttaChargeSettings>>('/admin/settings/atta-charges', data);
      return unwrap(response);
    } catch (error: any) {
      throw new Error(error?.response?.data?.message || 'Failed to update Atta Chakki charges');
    }
  },

  getSettings: async (): Promise<Settings> => {
    try {
      const response = await api.get<ApiResponse<Settings>>('/admin/settings');
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch settings');
    }
  },

  /** Drop the selected city's own delivery values so it uses the default again. */
  resetDeliveryToGlobal: async (): Promise<void> => {
    try {
      await api.put('/admin/settings/delivery', { resetToGlobal: true });
    } catch (error: any) {
      throw new Error(error?.response?.data?.message || 'Failed to reset delivery settings');
    }
  },

  updateDeliverySettings: async (settings: DeliverySettings): Promise<DeliverySettings> => {
    try {
      const response = await api.put<ApiResponse<DeliverySettings>>('/admin/settings/delivery', settings);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error updating delivery settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update delivery settings');
    }
  },

  getTimeSlots: async (): Promise<TimeSlot[]> => {
    try {
      const response = await api.get<ApiResponse<TimeSlot[]>>('/admin/settings/time-slots');
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching time slots:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch time slots');
    }
  },

  createTimeSlot: async (timeSlot: Omit<TimeSlot, 'id'>): Promise<TimeSlot> => {
    try {
      const response = await api.post<ApiResponse<TimeSlot>>('/admin/settings/time-slots', timeSlot);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error creating time slot:', error);
      throw new Error(error?.response?.data?.message || 'Failed to create time slot');
    }
  },

  updateTimeSlot: async (id: string, timeSlot: Partial<TimeSlot>): Promise<TimeSlot> => {
    try {
      const response = await api.put<ApiResponse<TimeSlot>>(`/admin/settings/time-slots/${id}`, timeSlot);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error updating time slot:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update time slot');
    }
  },

  deleteTimeSlot: async (id: string): Promise<void> => {
    try {
      await api.delete<ApiResponse<void>>(`/admin/settings/time-slots/${id}`);
    } catch (error: any) {
      console.error('Error deleting time slot:', error);
      throw new Error(error?.response?.data?.message || 'Failed to delete time slot');
    }
  },

  getBusinessHours: async (): Promise<BusinessHours[]> => {
    try {
      const response = await api.get<ApiResponse<BusinessHours[]>>('/admin/settings/business-hours');
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching business hours:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch business hours');
    }
  },

  updateBusinessHours: async (hours: BusinessHours[]): Promise<BusinessHours[]> => {
    try {
      const response = await api.put<ApiResponse<BusinessHours[]>>('/admin/settings/business-hours', { hours });
      return unwrap(response);
    } catch (error: any) {
      console.error('Error updating business hours:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update business hours');
    }
  },

  // Additional settings endpoints
  getAppSettings: async (): Promise<{
    appName: string;
    appVersion: string;
    maintenanceMode: boolean;
    minAppVersion: string;
  }> => {
    try {
      const response = await api.get<ApiResponse<{
        appName: string;
        appVersion: string;
        maintenanceMode: boolean;
        minAppVersion: string;
      }>>('/admin/settings/app');
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching app settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch app settings');
    }
  },

  getNotificationSettings: async (): Promise<{
    emailNotifications: boolean;
    smsNotifications: boolean;
    pushNotifications: boolean;
    orderConfirmationTemplate: string;
    orderDeliveryTemplate: string;
  }> => {
    try {
      const response = await api.get<ApiResponse<{
        emailNotifications: boolean;
        smsNotifications: boolean;
        pushNotifications: boolean;
        orderConfirmationTemplate: string;
        orderDeliveryTemplate: string;
      }>>('/admin/settings/notifications');
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching notification settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch notification settings');
    }
  },

  // Global platform feature flags (super-admin only on the backend).
  getPlatformSettings: async (): Promise<{ attaChakkiEnabled: boolean }> => {
    const response = await api.get<ApiResponse<{ attaChakkiEnabled: boolean }>>(
      '/admin/settings/platform'
    );
    return unwrap(response);
  },

  updatePlatformSettings: async (settings: {
    attaChakkiEnabled?: boolean;
  }): Promise<{ attaChakkiEnabled: boolean }> => {
    const response = await api.put<ApiResponse<{ attaChakkiEnabled: boolean }>>(
      '/admin/settings/platform',
      settings
    );
    return unwrap(response);
  },

  // AI chatbot config (super-admin only). API key is write-only (never returned).
  getAiSettings: async (): Promise<{
    provider: string;
    model: string;
    baseUrl: string;
    disabled: boolean;
    hasKey: boolean;
    enabled: boolean;
  }> => {
    const response = await api.get<ApiResponse<any>>('/admin/settings/ai-chat');
    return unwrap(response);
  },

  updateAiSettings: async (settings: {
    provider?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    disabled?: boolean;
    clearKey?: boolean;
  }): Promise<{
    provider: string;
    model: string;
    baseUrl: string;
    disabled: boolean;
    hasKey: boolean;
    enabled: boolean;
  }> => {
    const response = await api.put<ApiResponse<any>>('/admin/settings/ai-chat', settings);
    return unwrap(response);
  },
};
