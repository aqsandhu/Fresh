import { api } from './api';
import type { ApiResponse } from '@/types';

export interface BrandFaviconSettings {
  brandFaviconUrl: string;
  brandFaviconStoragePath?: string;
}

function mapFavicon(raw: Record<string, string>): BrandFaviconSettings {
  return {
    brandFaviconUrl: raw.brandFaviconUrl || raw.brand_favicon_url || '',
    brandFaviconStoragePath:
      raw.brandFaviconStoragePath || raw.brand_favicon_storage_path || '',
  };
}

export const faviconService = {
  get: async (): Promise<BrandFaviconSettings> => {
    const response = await api.get<ApiResponse<Record<string, string>>>(
      '/admin/site-settings/favicon'
    );
    return mapFavicon(response.data || {});
  },

  upload: async (file: File): Promise<{ settings: BrandFaviconSettings; message: string }> => {
    const form = new FormData();
    form.append('favicon', file);
    const response = await api.putForm<ApiResponse<Record<string, string>>>(
      '/admin/site-settings/favicon',
      form
    );
    return {
      settings: mapFavicon(response.data || {}),
      message: response.message || 'Brand favicon updated',
    };
  },

  remove: async (): Promise<{ settings: BrandFaviconSettings; message: string }> => {
    const response = await api.delete<ApiResponse<Record<string, string>>>(
      '/admin/site-settings/favicon'
    );
    return {
      settings: mapFavicon(response.data || {}),
      message: response.message || 'Brand favicon removed',
    };
  },
};
