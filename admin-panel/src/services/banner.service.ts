import { api } from './api';
import type { ApiResponse } from '@/types';

interface BannerSettings {
  bannerLeftText: string;
  bannerMiddleText: string;
  bannerRightTextEn: string;
  bannerRightTextUr: string;
}

export const bannerService = {
  getBannerSettings: async (): Promise<BannerSettings> => {
    try {
      const response = await api.get<ApiResponse<Record<string, string>>>('/admin/site-settings/banner');
      return response.data as unknown as BannerSettings;
    } catch (error: any) {
      console.error('Error fetching banner settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch banner settings');
    }
  },

  updateBannerSettings: async (data: BannerSettings): Promise<BannerSettings> => {
    try {
      const response = await api.put<ApiResponse<Record<string, string>>>('/admin/site-settings/banner', data);
      return response.data as unknown as BannerSettings;
    } catch (error: any) {
      console.error('Error updating banner settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update banner settings');
    }
  },
};
