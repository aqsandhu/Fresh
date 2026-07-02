import { api } from './api';
import type { ApiResponse } from '@/types';

export interface BannerSettings {
  bannerLeftText: string;
  bannerMiddleText: string;
  bannerRightTextEn: string;
  bannerRightTextUr: string;
  /** Extra rotating lines for the mobile news-ticker top bar. */
  bannerTickerItems: string[];
}

function parseTickerItems(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      /* ignore malformed value */
    }
  }
  return [];
}

function mapBanner(raw: Record<string, unknown>): BannerSettings {
  return {
    bannerLeftText: String(raw.bannerLeftText || raw.banner_left_text || ''),
    bannerMiddleText: String(raw.bannerMiddleText || raw.banner_middle_text || ''),
    bannerRightTextEn: String(raw.bannerRightTextEn || raw.banner_right_text_en || ''),
    bannerRightTextUr: String(raw.bannerRightTextUr || raw.banner_right_text_ur || ''),
    bannerTickerItems: parseTickerItems(raw.bannerTickerItems ?? raw.banner_ticker_items),
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
