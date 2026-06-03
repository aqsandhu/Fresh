import { api } from './api';
import type { ApiResponse } from '@/types';

export interface WhatsAppCitySetting {
  cityId: string;
  cityName: string;
  province: string;
  whatsappOrderUrl: string;
}

export interface WhatsAppOrderSettingsAll {
  globalWhatsappOrderUrl: string;
  cities: WhatsAppCitySetting[];
}

function normalizeAll(raw: Record<string, unknown>): WhatsAppOrderSettingsAll {
  const citiesRaw = (raw.cities as unknown[]) || [];
  return {
    globalWhatsappOrderUrl:
      String(raw.globalWhatsappOrderUrl || raw.global_whatsapp_order_url || '').trim(),
    cities: citiesRaw.map((row) => {
      const c = row as Record<string, unknown>;
      return {
        cityId: String(c.cityId || c.city_id || ''),
        cityName: String(c.cityName || c.city_name || ''),
        province: String(c.province || ''),
        whatsappOrderUrl: String(c.whatsappOrderUrl || c.whatsapp_order_url || '').trim(),
      };
    }),
  };
}

export const whatsappOrderService = {
  /** Per-city header scope (legacy single-city). */
  getSettings: async (): Promise<{ whatsappOrderUrl: string }> => {
    try {
      const response = await api.get<ApiResponse<Record<string, string>>>(
        '/admin/site-settings/whatsapp-order'
      );
      const data = response.data?.data || response.data || {};
      return {
        whatsappOrderUrl: String(
          (data as Record<string, string>).whatsappOrderUrl ||
            (data as Record<string, string>).whatsapp_order_url ||
            ''
        ).trim(),
      };
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 502 || status === 503) {
        return { whatsappOrderUrl: '' };
      }
      throw new Error(
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to fetch WhatsApp order settings'
      );
    }
  },

  /** All active cities + global fallback — primary admin UI. */
  getAllSettings: async (): Promise<WhatsAppOrderSettingsAll> => {
    try {
      const response = await api.get<ApiResponse<Record<string, unknown>>>(
        '/admin/site-settings/whatsapp-order/all'
      );
      return normalizeAll((response.data?.data || response.data || {}) as Record<string, unknown>);
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        return { globalWhatsappOrderUrl: '', cities: [] };
      }
      throw new Error(
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to fetch WhatsApp settings for all cities'
      );
    }
  },

  saveAllSettings: async (payload: WhatsAppOrderSettingsAll): Promise<WhatsAppOrderSettingsAll> => {
    try {
      const response = await api.put<ApiResponse<Record<string, unknown>>>(
        '/admin/site-settings/whatsapp-order/bulk',
        {
          global_whatsapp_order_url: payload.globalWhatsappOrderUrl,
          cities: payload.cities.map((c) => ({
            city_id: c.cityId,
            whatsapp_order_url: c.whatsappOrderUrl,
          })),
        }
      );
      return normalizeAll((response.data?.data || response.data || {}) as Record<string, unknown>);
    } catch (error: unknown) {
      throw new Error(
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to save WhatsApp settings'
      );
    }
  },
};
