import { api } from './api';
import type { 
  WhatsAppOrderData,
  ApiResponse 
} from '@/types';

export const whatsappService = {
  createOrder: async (data: WhatsAppOrderData): Promise<unknown> => {
    try {
      const response = await api.post<ApiResponse<unknown>>('/admin/whatsapp-orders', data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating WhatsApp order:', error);
      throw new Error(error?.response?.data?.message || 'Failed to create WhatsApp order');
    }
  },

  getWhatsAppOrders: async (filters: { page?: number; limit?: number; status?: string } = {}): Promise<{
    orders: any[];
    pagination: any;
  }> => {
    try {
      const response = await api.get<ApiResponse<{
        orders: any[];
        pagination: any;
      }>>('/admin/whatsapp-orders', filters);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching WhatsApp orders:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch WhatsApp orders');
    }
  },

  getWhatsAppOrderById: async (id: string): Promise<any> => {
    try {
      const response = await api.get<ApiResponse<any>>(`/admin/whatsapp-orders/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching WhatsApp order:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch WhatsApp order');
    }
  },

  updateWhatsAppOrderStatus: async (id: string, status: string, notes?: string): Promise<any> => {
    try {
      const response = await api.put<ApiResponse<any>>(`/admin/whatsapp-orders/${id}/status`, {
        status,
        notes,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error updating WhatsApp order status:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update status');
    }
  },

  convertToOrder: async (id: string): Promise<any> => {
    try {
      const response = await api.post<ApiResponse<any>>(`/admin/whatsapp-orders/${id}/convert`);
      return response.data;
    } catch (error: any) {
      console.error('Error converting WhatsApp order:', error);
      throw new Error(error?.response?.data?.message || 'Failed to convert order');
    }
  },

  sendWhatsAppMessage: async (phone: string, message: string): Promise<void> => {
    try {
      await api.post<ApiResponse<void>>('/admin/whatsapp/send-message', {
        phone,
        message,
      });
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error);
      throw new Error(error?.response?.data?.message || 'Failed to send message');
    }
  },
};
