import api, { ApiResponse } from './api';

export interface WhatsAppOrderSettings {
  whatsappOrderUrl: string;
}

function normalize(raw: Record<string, string>): WhatsAppOrderSettings {
  return {
    whatsappOrderUrl: raw.whatsappOrderUrl || raw.whatsapp_order_url || '',
  };
}

export const whatsappOrderService = {
  getSettings: async (): Promise<WhatsAppOrderSettings> => {
    try {
      const response = await api.get<ApiResponse<Record<string, string>>>(
        '/admin/site-settings/whatsapp-order'
      );
      return normalize(response.data?.data || response.data || {});
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404 || status === 502 || status === 503) {
        return { whatsappOrderUrl: '' };
      }
      console.error('Error fetching WhatsApp order settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch WhatsApp order settings');
    }
  },

  updateSettings: async (whatsappOrderUrl: string): Promise<WhatsAppOrderSettings> => {
    try {
      const response = await api.put<ApiResponse<Record<string, string>>>(
        '/admin/site-settings/whatsapp-order',
        { whatsapp_order_url: whatsappOrderUrl }
      );
      return normalize(response.data?.data || response.data || {});
    } catch (error: any) {
      console.error('Error updating WhatsApp order settings:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update WhatsApp order settings');
    }
  },
};
