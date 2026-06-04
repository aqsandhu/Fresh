import { api } from './api';
import type { ApiResponse } from '@/types';

export interface BrandLogoSettings {
  brandLogoUrl: string;
  brandLogoStoragePath?: string;
}

function mapBrand(raw: Record<string, string>): BrandLogoSettings {
  return {
    brandLogoUrl: raw.brandLogoUrl || raw.brand_logo_url || '',
    brandLogoStoragePath:
      raw.brandLogoStoragePath || raw.brand_logo_storage_path || '',
  };
}

export const brandService = {
  get: async (): Promise<BrandLogoSettings> => {
    const response = await api.get<ApiResponse<Record<string, string>>>(
      '/admin/site-settings/brand'
    );
    return mapBrand(response.data || {});
  },

  upload: async (file: File): Promise<BrandLogoSettings> => {
    const form = new FormData();
    form.append('logo', file);
    const response = await api.putForm<ApiResponse<Record<string, string>>>(
      '/admin/site-settings/brand',
      form
    );
    return mapBrand(response.data || {});
  },
};
