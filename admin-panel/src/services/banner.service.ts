import { api } from './api';
import type { ApiResponse } from '@/types';

export interface BannerSettings {
  bannerLeftText: string;
  bannerMiddleText: string;
  bannerRightTextEn: string;
  bannerRightTextUr: string;
}

function mapBanner(raw: Record<string, string>): BannerSettings {
  return {
    bannerLeftText: raw.bannerLeftText || raw.banner_left_text || '',
    bannerMiddleText: raw.bannerMiddleText || raw.banner_middle_text || '',
    bannerRightTextEn: raw.bannerRightTextEn || raw.banner_right_text_en || '',
    bannerRightTextUr: raw.bannerRightTextUr || raw.banner_right_text_ur || '',
  };
}

export const bannerService = {
  getBannerSettings: async (): Promise<BannerSettings> => {
    try {
      const response = await api.get<ApiResponse<Record<string, string>>>('/admin/site-settings/banner');
      return mapBanner(response.data || {});
    } catch (error: any) {
      console.error('Error fetching banner settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch banner settings');
    }
  },

  updateBannerSettings: async (data: BannerSettings): Promise<BannerSettings> => {
    try {
      const response = await api.put<ApiResponse<Record<string, string>>>('/admin/site-settings/banner', data);
      return mapBanner(response.data || {});
    } catch (error: any) {
      console.error('Error updating banner settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update banner settings');
    }
  },
};
