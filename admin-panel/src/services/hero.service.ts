import { api } from './api';
import type { ApiResponse } from '@/types';

export interface HeroImageSettings {
  heroImageUrl: string;
  heroImageStoragePath?: string;
}

function mapHero(raw: Record<string, string>): HeroImageSettings {
  return {
    heroImageUrl: raw.heroImageUrl || raw.hero_image_url || '',
    heroImageStoragePath:
      raw.heroImageStoragePath || raw.hero_image_storage_path || '',
  };
}

/**
 * Per-city homepage hero image. The backend resolves the city from the
 * X-City-Id header (super admin) or the admin's assigned city, so these calls
 * always act on the currently-selected city.
 */
export const heroService = {
  get: async (): Promise<HeroImageSettings> => {
    const response = await api.get<ApiResponse<Record<string, string>>>(
      '/admin/site-settings/hero'
    );
    return mapHero(response.data || {});
  },

  upload: async (file: File): Promise<{ settings: HeroImageSettings; message: string }> => {
    const form = new FormData();
    form.append('hero', file);
    const response = await api.putForm<ApiResponse<Record<string, string>>>(
      '/admin/site-settings/hero',
      form
    );
    return {
      settings: mapHero(response.data || {}),
      message: response.message || 'Hero image updated',
    };
  },

  remove: async (): Promise<{ settings: HeroImageSettings; message: string }> => {
    const response = await api.delete<ApiResponse<Record<string, string>>>(
      '/admin/site-settings/hero'
    );
    return {
      settings: mapHero(response.data || {}),
      message: response.message || 'Hero image removed',
    };
  },
};
