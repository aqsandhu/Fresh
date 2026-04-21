import apiService from './api';
import { Task, ApiResponse, TaskStatus, DailyStats, Earning, RiderStatsData } from '../types';
import { API_BASE_URL } from '../utils/constants';

// Server host derived from the API base URL (handles localhost→LAN IP)
const API_HOST = API_BASE_URL.replace(/\/api\/?$/, '');

const fixImageUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  // Absolute dev/LAN URL → strip origin and re-host under the device-reachable API_HOST.
  const absMatch = url.match(/^https?:\/\/([^/]+)(\/.*)?$/);
  if (absMatch) {
    const host = absMatch[1].split(':')[0];
    const rest = absMatch[2] || '';
    const isLocalOrLan = host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    return isLocalOrLan ? `${API_HOST}${rest}` : url;
  }
  // Relative path from backend → prefix device-reachable API_HOST.
  return url.startsWith('/') ? `${API_HOST}${url}` : `${API_HOST}/${url}`;
};

// Map backend snake_case row to app's camelCase Task interface
const mapTask = (row: any): Task => {
  // delivery_address might be a JSON object (from getTaskDetails) or individual fields (from list endpoints)
  const addrObj = typeof row.delivery_address === 'object' && row.delivery_address ? row.delivery_address : null;

  return {
    id: row.id,
    orderNumber: row.order_number,
    orderId: row.order_id,
    attaRequestId: row.atta_request_id,
    type: row.task_type || row.type,
    status: mapTaskStatus(row.status),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.order_delivery_address || addrObj?.written_address || row.delivery_address || '',
    houseNumber: row.order_house_number || addrObj?.house_number,
    landmark: row.order_landmark || addrObj?.landmark,
    area: row.order_area || addrObj?.area_name,
    city: row.order_city || addrObj?.city,
    latitude: parseCoord(row.address_latitude || row.delivery_latitude || addrObj?.location?.latitude),
    longitude: parseCoord(row.address_longitude || row.delivery_longitude || addrObj?.location?.longitude),
    totalAmount: row.total_amount ? parseFloat(row.total_amount) : undefined,
    deliveryFee: row.delivery_charge ? parseFloat(row.delivery_charge) : undefined,
    notes: row.notes || row.customer_notes,
    specialInstructions: row.customer_notes,
    createdAt: row.assigned_at,
    timeWindow: row.time_slot_name || undefined,
    requestedDeliveryDate: row.requested_delivery_date || undefined,
    gateImage: fixImageUrl(row.door_picture_url),
    has_location: row.has_location,
    location_added_by: row.location_added_by,
    addressId: row.address_id,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    items: row.items
      ? row.items.map((item: any) => ({
          id: item.id,
          name: item.product_name,
          quantity: item.quantity,
          unit: '',
          price: parseFloat(item.unit_price || 0),
        }))
      : undefined,
  };
};

const parseCoord = (v: any): number | undefined => {
  if (v == null) return undefined;
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
};

const mapTaskStatus = (status: string): Task['status'] => {
  const statusMap: Record<string, Task['status']> = {
    assigned: 'assigned',
    in_progress: 'in_transit',
    completed: 'delivered',
    cancelled: 'cancelled',
    pending: 'pending',
  };
  return statusMap[status] || (status as Task['status']);
};

class TaskService {
  async getTasks(status?: TaskStatus): Promise<Task[]> {
    const params = status ? { status } : undefined;
    const response = await apiService.get<ApiResponse<any>>('/rider/tasks', params);
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch tasks');
    }
    const rows = Array.isArray(response.data) ? response.data : response.data?.tasks || [];
    return rows.map(mapTask);
  }

  async getActiveTasks(): Promise<Task[]> {
    const response = await apiService.get<ApiResponse<any[]>>('/rider/tasks/active');
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch active tasks');
    }
    return (response.data || []).map(mapTask);
  }

  async getCompletedTasks(): Promise<Task[]> {
    const response = await apiService.get<ApiResponse<any[]>>('/rider/tasks/completed');
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch completed tasks');
    }
    return (response.data || []).map(mapTask);
  }

  async getTaskById(taskId: string): Promise<Task> {
    const response = await apiService.get<ApiResponse<any>>(`/rider/tasks/${taskId}`);
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch task');
    }
    return mapTask(response.data);
  }

  async acceptTask(taskId: string): Promise<Task> {
    const response = await apiService.post<ApiResponse<any>>(`/rider/tasks/${taskId}/accept`);
    if (!response.success) {
      throw new Error(response.message || 'Failed to accept task');
    }
    // Backend returns raw RETURNING * (incomplete); re-fetch full task details
    return this.getTaskById(taskId);
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, notes?: string): Promise<Task> {
    const response = await apiService.patch<ApiResponse<any>>(`/rider/tasks/${taskId}/status`, {
      status,
      notes,
    });
    if (!response.success) {
      throw new Error(response.message || 'Failed to update task status');
    }
    // Backend may return null for pickup/deliver; re-fetch task details
    if (!response.data) {
      return this.getTaskById(taskId);
    }
    return mapTask(response.data);
  }

  async markPickedUp(taskId: string, notes?: string): Promise<Task> {
    return this.updateTaskStatus(taskId, 'picked_up', notes);
  }

  async markDelivered(
    taskId: string,
    data: {
      signature?: string;
      photoProof?: string;
      notes?: string;
      customerName?: string;
    }
  ): Promise<Task> {
    const response = await apiService.post<ApiResponse<any>>(`/rider/tasks/${taskId}/deliver`, data);
    if (!response.success) {
      throw new Error(response.message || 'Failed to mark delivered');
    }
    // Backend returns null for delivery confirmation; re-fetch task details
    if (!response.data) {
      return this.getTaskById(taskId);
    }
    return mapTask(response.data);
  }

  async cancelTask(taskId: string, reason: string): Promise<Task> {
    const response = await apiService.post<ApiResponse<any>>(`/rider/tasks/${taskId}/cancel`, {
      reason,
    });
    if (!response.success) {
      throw new Error(response.message || 'Failed to cancel task');
    }
    return mapTask(response.data);
  }

  async getTodayStats(): Promise<DailyStats> {
    const response = await apiService.get<ApiResponse<DailyStats>>('/rider/stats/today');
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch today stats');
    }
    return response.data;
  }

  async getMyStats(): Promise<RiderStatsData> {
    const response = await apiService.get<ApiResponse<RiderStatsData>>('/rider/stats');
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch rider stats');
    }
    return response.data;
  }

  async getEarnings(startDate?: string, endDate?: string): Promise<Earning[]> {
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const response = await apiService.get<ApiResponse<any>>('/rider/earnings/today', params);
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch earnings');
    }
    // Backend returns { completed_deliveries, pickups, deliveries, atta_pickups, atta_deliveries }
    // as COUNT strings. Convert to Earning[] format.
    const raw = response.data || {};
    const earnings: Earning[] = [];
    const today = new Date().toISOString().split('T')[0];
    if (parseInt(raw.deliveries || raw.completed_deliveries || '0') > 0) {
      earnings.push({
        id: 'delivery-today',
        date: today,
        amount: 0,
        type: 'delivery',
        description: `${parseInt(raw.deliveries || raw.completed_deliveries || '0')} deliveries completed`,
      });
    }
    if (parseInt(raw.atta_pickups || raw.attaPickups || '0') > 0) {
      earnings.push({
        id: 'atta-today',
        date: today,
        amount: 0,
        type: 'atta',
        description: `${parseInt(raw.atta_pickups || raw.attaPickups || '0')} atta pickups`,
      });
    }
    return earnings;
  }

  async uploadDeliveryProof(taskId: string, imageUri: string): Promise<string> {
    const formData = new FormData();
    formData.append('proof', {
      uri: imageUri,
      type: 'image/jpeg',
      name: `delivery_${taskId}.jpg`,
    } as any);

    const response = await apiService.post<ApiResponse<{ url: string }>>(
      `/rider/tasks/${taskId}/upload-proof`,
      formData
    );
    if (!response.success) {
      throw new Error(response.message || 'Failed to upload proof');
    }
    return response.data.url;
  }

  async reportIssue(
    taskId: string,
    data: { issueType: string; description: string; photo?: string }
  ): Promise<void> {
    const response = await apiService.post<ApiResponse<void>>(`/rider/tasks/${taskId}/report`, data);
    if (!response.success) {
      throw new Error(response.message || 'Failed to report issue');
    }
  }

  async requestCustomerCall(taskId: string): Promise<{ callId: string; expiresAt: string }> {
    const response = await apiService.post<ApiResponse<{ callId: string; expiresAt: string }>>(
      `/rider/call-request`,
      { taskId }
    );
    if (!response.success) {
      throw new Error(response.message || 'Failed to request call');
    }
    return response.data;
  }

  async requestCall(taskId: string): Promise<{ callId: string; expiresAt: string }> {
    return this.requestCustomerCall(taskId);
  }

  async pinLocation(taskId: string, latitude: number, longitude: number): Promise<{ latitude: number; longitude: number }> {
    const response = await apiService.put<ApiResponse<{ latitude: number; longitude: number }>>(
      `/rider/tasks/${taskId}/pin-location`,
      { latitude, longitude }
    );
    if (!response.success) {
      throw new Error(response.message || 'Failed to pin location');
    }
    return response.data;
  }

  async uploadDoorPicture(taskId: string, imageUri: string): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('door_picture', {
      uri: imageUri,
      type: 'image/jpeg',
      name: `door_${taskId}.jpg`,
    } as any);

    const response = await apiService.post<ApiResponse<{ url: string }>>(
      `/rider/tasks/${taskId}/door-picture`,
      formData
    );
    if (!response.success) {
      throw new Error(response.message || 'Failed to upload door picture');
    }
    return response.data;
  }
}

export const taskService = new TaskService();
export default taskService;
