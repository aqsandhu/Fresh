import { api, unwrap } from './api';
import type {
  WhatsAppOrderData,
  CustomerLookupResult,
  ApiResponse
} from '@/types';

export const whatsappService = {
  /** Look up an existing customer (+ saved addresses) by phone. */
  lookupCustomer: async (phone: string): Promise<CustomerLookupResult> => {
    const response = await api.get<ApiResponse<CustomerLookupResult>>(
      '/admin/customers/lookup',
      { phone }
    );
    const data = (response.data || {}) as Partial<CustomerLookupResult>;
    return { customer: data.customer ?? null, addresses: data.addresses ?? [] };
  },

  createOrder: async (data: WhatsAppOrderData): Promise<unknown> => {
    try {
      const response = await api.post<ApiResponse<unknown>>('/admin/whatsapp-orders', data);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error creating WhatsApp order:', error);
      throw new Error(error?.response?.data?.message || 'Failed to create WhatsApp order');
    }
  },

};
