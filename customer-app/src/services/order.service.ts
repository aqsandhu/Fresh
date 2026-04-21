import apiClient, { handleApiError } from './api';
import { API_BASE_URL } from '@utils/constants';
import { ApiResponse, Order, OrderItem, OrderStatus, DeliverySlot, PaginatedResponse, Address, Rider } from '@types';

const BACKEND_URL = API_BASE_URL.replace('/api', '');

export interface CreateOrderRequest {
  addressId: string;
  deliverySlotId?: string;
  requestedDeliveryDate?: string;
  paymentMethod: 'cash_on_delivery' | 'card' | 'easypaisa' | 'jazzcash';
  notes?: string;
}

export interface CreateOrderResponse {
  order: Order;
  paymentUrl?: string;
}

function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${normalizedPath}`;
}

// Map backend order item to customer app OrderItem
function mapOrderItem(raw: any): OrderItem {
  return {
    id: raw.id,
    productId: raw.product_id,
    productName: raw.product_name || '',
    productImage: resolveImageUrl(raw.product_image),
    quantity: parseInt(raw.quantity) || 0,
    price: parseFloat(raw.unit_price) || 0,
    unit: raw.weight_kg ? `${raw.weight_kg}kg` : 'piece',
  };
}

// Map backend order to customer app Order type
function mapBackendOrder(raw: any): Order {
  const addressSnapshot = raw.delivery_address_snapshot
    ? (typeof raw.delivery_address_snapshot === 'string'
      ? JSON.parse(raw.delivery_address_snapshot)
      : raw.delivery_address_snapshot)
    : null;

  const address: Address = {
    id: raw.address_id || '',
    userId: raw.user_id || '',
    label: 'Delivery',
    fullAddress: addressSnapshot
      ? [addressSnapshot.written_address, addressSnapshot.area_name, addressSnapshot.city].filter(Boolean).join(', ')
      : '',
    latitude: addressSnapshot?.location?.latitude || 0,
    longitude: addressSnapshot?.location?.longitude || 0,
    isDefault: false,
    createdAt: '',
  };

  const deliverySlot: DeliverySlot = {
    id: raw.time_slot_id || '',
    date: raw.requested_delivery_date || '',
    startTime: raw.slot_start || '',
    endTime: raw.slot_end || '',
    label: raw.slot_name || '',
    available: true,
  };

  const rider: Rider | undefined = raw.rider_id ? {
    id: raw.rider_id,
    name: raw.rider_name || '',
    phone: raw.rider_phone || '',
    currentLocation: raw.rider_latitude ? {
      latitude: parseFloat(raw.rider_latitude),
      longitude: parseFloat(raw.rider_longitude),
    } : undefined,
  } : undefined;

  // Map payment method back to simple names for display
  const paymentMethodMap: Record<string, string> = {
    cash_on_delivery: 'cash',
    card: 'card',
    easypaisa: 'wallet',
    jazzcash: 'wallet',
  };

  return {
    id: raw.id,
    orderNumber: raw.order_number || '',
    userId: raw.user_id || '',
    items: (raw.items || []).map(mapOrderItem),
    status: raw.status as OrderStatus,
    subtotal: parseFloat(raw.subtotal) || 0,
    deliveryCharge: parseFloat(raw.delivery_charge) || 0,
    discount: parseFloat(raw.discount_amount) || 0,
    total: parseFloat(raw.total_amount) || 0,
    address,
    deliverySlot,
    paymentMethod: (paymentMethodMap[raw.payment_method] || raw.payment_method || 'cash') as any,
    paymentStatus: raw.payment_status || 'pending',
    rider,
    createdAt: raw.placed_at || raw.created_at || '',
    estimatedDelivery: raw.requested_delivery_date || raw.out_for_delivery_at || '',
    deliveredAt: raw.delivered_at || undefined,
  };
}

// Format HH:MM[:SS] time string using device locale (respects 24/12hr preference, no seconds)
function formatSlotTime(time: string): string {
  if (!time) return '';
  const parts = time.split(':');
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1] || '0', 10);
  if (isNaN(hour)) return time;
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Map backend time slot to customer app DeliverySlot type
function mapTimeSlot(raw: any, dateStr: string): DeliverySlot {
  const startFormatted = formatSlotTime(raw.start_time);
  const endFormatted = formatSlotTime(raw.end_time);
  return {
    id: raw.id,
    date: dateStr,
    startTime: raw.start_time || '',
    endTime: raw.end_time || '',
    label: raw.slot_name || `${startFormatted} - ${endFormatted}`,
    available: (parseInt(raw.available_slots) || 0) > 0,
    isFreeDelivery: raw.is_free_delivery_slot === true,
    isExpress: raw.is_express_slot === true,
  };
}

class OrderService {
  async createOrder(data: CreateOrderRequest): Promise<ApiResponse<CreateOrderResponse>> {
    try {
      const body: Record<string, any> = {
        address_id: data.addressId,
        time_slot_id: data.deliverySlotId,
        payment_method: data.paymentMethod,
        customer_notes: data.notes,
      };
      if (data.requestedDeliveryDate) {
        body.requested_delivery_date = data.requestedDeliveryDate;
      }
      const response = await apiClient.post('/orders', body);
      const raw = response.data;
      // Backend returns { data: { order: { id, order_number, ... } } }
      const orderRaw = raw.data?.order || raw.data || {};
      return { success: true, data: { order: mapBackendOrder(orderRaw) } };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getOrders(status?: OrderStatus): Promise<ApiResponse<PaginatedResponse<Order>>> {
    try {
      const params = status ? { status } : {};
      const response = await apiClient.get('/orders', { params });
      const raw = response.data;
      const orders = (raw.data?.orders || raw.data || []).map(mapBackendOrder);
      const pagination = raw.data?.pagination || {};
      return {
        success: true,
        data: {
          data: orders,
          total: pagination.total || orders.length,
          page: pagination.page || 1,
          limit: pagination.limit || 10,
          totalPages: pagination.totalPages || 1,
        },
      };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getOrderById(id: string): Promise<ApiResponse<Order>> {
    try {
      const response = await apiClient.get(`/orders/${id}`);
      const raw = response.data;
      return { success: true, data: mapBackendOrder(raw.data) };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async cancelOrder(id: string, reason?: string): Promise<ApiResponse<Order>> {
    try {
      const response = await apiClient.put(`/orders/${id}/cancel`, { reason });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async trackOrder(id: string): Promise<ApiResponse<any>> {
    try {
      const response = await apiClient.get(`/orders/track/${id}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getDeliverySlots(date?: string): Promise<ApiResponse<DeliverySlot[]>> {
    try {
      const dateStr = date || new Date().toISOString().split('T')[0];
      const response = await apiClient.get('/orders/time-slots', { params: { date: dateStr } });
      const raw = response.data;
      const slots = (raw.data || []).map((s: any) => mapTimeSlot(s, dateStr));
      return { success: true, data: slots };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getDeliverySettings(): Promise<ApiResponse<{ base_charge: number; free_delivery_threshold: number; express_charge: number }>> {
    try {
      const response = await apiClient.get('/site-settings/delivery');
      const raw = response.data;
      return { success: true, data: raw.data };
    } catch (error) {
      // Fallback to defaults if endpoint fails
      return {
        success: true,
        data: { base_charge: 100, free_delivery_threshold: 500, express_charge: 100 },
      };
    }
  }
}

export const orderService = new OrderService();
export default orderService;
