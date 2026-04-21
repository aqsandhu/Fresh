import { api } from './api';
import type { 
  Order, 
  OrderStatus,
  PaginatedResponse, 
  ApiResponse 
} from '@/types';

interface OrderFilters {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  riderId?: string;
}

export const orderService = {
  getOrders: async (filters: OrderFilters = {}): Promise<PaginatedResponse<Order>> => {
    try {
      const response = await api.get<ApiResponse<PaginatedResponse<Order>>>('/admin/orders', filters);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching orders:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch orders');
    }
  },

  getOrderById: async (id: string): Promise<Order> => {
    try {
      const response = await api.get<ApiResponse<Order>>(`/admin/orders/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching order:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch order');
    }
  },

  updateOrderStatus: async (id: string, status: OrderStatus, reason?: string): Promise<Order> => {
    try {
      const response = await api.put<ApiResponse<Order>>(`/admin/orders/${id}/status`, {
        status,
        reason,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error updating order status:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update order status');
    }
  },

  assignRider: async (orderId: string, riderId: string): Promise<Order> => {
    try {
      const response = await api.put<ApiResponse<Order>>(`/admin/orders/${orderId}/assign-rider`, {
        riderId,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error assigning rider:', error);
      throw new Error(error?.response?.data?.message || 'Failed to assign rider');
    }
  },

  cancelOrder: async (id: string, reason: string): Promise<Order> => {
    try {
      const response = await api.put<ApiResponse<Order>>(`/admin/orders/${id}/cancel`, {
        reason,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      throw new Error(error?.response?.data?.message || 'Failed to cancel order');
    }
  },

  getOrderTimeline: async (id: string): Promise<{
    status: OrderStatus;
    timestamp: string;
    note?: string;
  }[]> => {
    try {
      const response = await api.get<ApiResponse<{
        status: OrderStatus;
        timestamp: string;
        note?: string;
      }[]>>(`/admin/orders/${id}/timeline`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching order timeline:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch order timeline');
    }
  },

  getOrderStats: async (period: 'today' | 'week' | 'month' | 'year' = 'today'): Promise<{
    totalOrders: number;
    totalSales: number;
    averageOrderValue: number;
    cancelledOrders: number;
  }> => {
    try {
      const response = await api.get<ApiResponse<{
        totalOrders: number;
        totalSales: number;
        averageOrderValue: number;
        cancelledOrders: number;
      }>>('/admin/orders/stats', { period });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching order stats:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch order stats');
    }
  },

  refundOrder: async (id: string, amount: number, reason: string): Promise<Order> => {
    try {
      const response = await api.post<ApiResponse<Order>>(`/admin/orders/${id}/refund`, {
        amount,
        reason,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error refunding order:', error);
      throw new Error(error?.response?.data?.message || 'Failed to refund order');
    }
  },

  updateOrderNotes: async (id: string, notes: string): Promise<Order> => {
    try {
      const response = await api.put<ApiResponse<Order>>(`/admin/orders/${id}/notes`, {
        notes,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error updating order notes:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update order notes');
    }
  },

  togglePhoneVisibility: async (id: string, show: boolean): Promise<Order> => {
    try {
      const response = await api.put<ApiResponse<Order>>(`/admin/orders/${id}/toggle-phone`, {
        showCustomerPhone: show,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error toggling phone visibility:', error);
      throw new Error(error?.response?.data?.message || 'Failed to toggle phone visibility');
    }
  },

  markPaymentReceived: async (id: string): Promise<Order> => {
    try {
      const response = await api.put<ApiResponse<Order>>(`/admin/orders/${id}/payment-received`);
      return response.data;
    } catch (error: any) {
      console.error('Error marking payment received:', error);
      throw new Error(error?.response?.data?.message || 'Failed to mark payment received');
    }
  },
};
