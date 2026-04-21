import { api } from './api';
import type { 
  Settings,
  DeliverySettings,
  TimeSlot,
  BusinessHours,
  ApiResponse 
} from '@/types';

export const settingsService = {
  getSettings: async (): Promise<Settings> => {
    try {
      const response = await api.get<ApiResponse<Settings>>('/admin/settings');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch settings');
    }
  },

  updateDeliverySettings: async (settings: DeliverySettings): Promise<DeliverySettings> => {
    try {
      const response = await api.put<ApiResponse<DeliverySettings>>('/admin/settings/delivery', settings);
      return response.data;
    } catch (error: any) {
      console.error('Error updating delivery settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update delivery settings');
    }
  },

  getTimeSlots: async (): Promise<TimeSlot[]> => {
    try {
      const response = await api.get<ApiResponse<TimeSlot[]>>('/admin/settings/time-slots');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching time slots:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch time slots');
    }
  },

  createTimeSlot: async (timeSlot: Omit<TimeSlot, 'id'>): Promise<TimeSlot> => {
    try {
      const response = await api.post<ApiResponse<TimeSlot>>('/admin/settings/time-slots', timeSlot);
      return response.data;
    } catch (error: any) {
      console.error('Error creating time slot:', error);
      throw new Error(error?.response?.data?.message || 'Failed to create time slot');
    }
  },

  updateTimeSlot: async (id: string, timeSlot: Partial<TimeSlot>): Promise<TimeSlot> => {
    try {
      const response = await api.put<ApiResponse<TimeSlot>>(`/admin/settings/time-slots/${id}`, timeSlot);
      return response.data;
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
      return response.data;
    } catch (error: any) {
      console.error('Error fetching business hours:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch business hours');
    }
  },

  updateBusinessHours: async (hours: BusinessHours[]): Promise<BusinessHours[]> => {
    try {
      const response = await api.put<ApiResponse<BusinessHours[]>>('/admin/settings/business-hours', { hours });
      return response.data;
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
      return response.data;
    } catch (error: any) {
      console.error('Error fetching app settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch app settings');
    }
  },

  updateAppSettings: async (settings: {
    appName?: string;
    maintenanceMode?: boolean;
    minAppVersion?: string;
  }): Promise<void> => {
    try {
      await api.put<ApiResponse<void>>('/admin/settings/app', settings);
    } catch (error: any) {
      console.error('Error updating app settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update app settings');
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
      return response.data;
    } catch (error: any) {
      console.error('Error fetching notification settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch notification settings');
    }
  },

  updateNotificationSettings: async (settings: {
    emailNotifications?: boolean;
    smsNotifications?: boolean;
    pushNotifications?: boolean;
    orderConfirmationTemplate?: string;
    orderDeliveryTemplate?: string;
  }): Promise<void> => {
    try {
      await api.put<ApiResponse<void>>('/admin/settings/notifications', settings);
    } catch (error: any) {
      console.error('Error updating notification settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update notification settings');
    }
  },
};
