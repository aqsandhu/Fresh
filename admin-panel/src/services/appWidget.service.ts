import { api } from './api';
import type { ApiResponse } from '@/types';

export interface AppWidgetSettings {
  enabled: boolean;
  title: string;
  message: string;
  messageUr: string;
}

function mapWidget(raw: Record<string, unknown>): AppWidgetSettings {
  return {
    enabled: raw.enabled !== false && raw.enabled !== 'false',
    title: String(raw.title || ''),
    message: String(raw.message || ''),
    messageUr: String(raw.messageUr || raw.message_ur || ''),
  };
}

export const appWidgetService = {
  get: async (): Promise<AppWidgetSettings> => {
    try {
      const response = await api.get<ApiResponse<Record<string, unknown>>>(
        '/admin/site-settings/app-widget'
      );
      return mapWidget(response.data || {});
    } catch (error: any) {
      throw new Error(error?.response?.data?.message || 'Failed to fetch app widget settings');
    }
  },

  update: async (data: AppWidgetSettings): Promise<AppWidgetSettings> => {
    try {
      const response = await api.put<ApiResponse<Record<string, unknown>>>(
        '/admin/site-settings/app-widget',
        data
      );
      return mapWidget(response.data || {});
    } catch (error: any) {
      throw new Error(error?.response?.data?.message || 'Failed to update app widget settings');
    }
  },
};
