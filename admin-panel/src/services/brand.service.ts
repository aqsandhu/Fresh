import api from './api';

export interface BrandLogoSettings {
  brand_logo_url: string;
  brand_logo_storage_path?: string;
}

export const brandService = {
  get: async (): Promise<BrandLogoSettings> => {
    const res = await api.get('/admin/site-settings/brand');
    return res.data.data;
  },

  upload: async (file: File): Promise<BrandLogoSettings> => {
    const form = new FormData();
    form.append('logo', file);
    const res = await api.put('/admin/site-settings/brand', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },
};
