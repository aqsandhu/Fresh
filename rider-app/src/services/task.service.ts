import apiService, { ApiError } from './api';
import {
  Task,
  TaskItem,
  TaskStatus,
  TaskType,
  ApiResponse,
  DailyStats,
  RiderStatsData,
  GeoPoint,
  RiderReviews,
  CashSettlement,
} from '../types';
import { API_BASE_URL } from '../utils/constants';
import { toNumber, toNumberOrNull } from '../utils/helpers';

// Server host derived from the API base URL (handles localhost→LAN IP).
const API_HOST = API_BASE_URL.replace(/\/api\/?$/, '');

/** Re-host dev/LAN image URLs so the device can actually load them. */
export const fixImageUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  const absMatch = url.match(/^https?:\/\/([^/]+)(\/.*)?$/);
  if (absMatch) {
    const host = absMatch[1].split(':')[0];
    const rest = absMatch[2] || '';
    const isLocalOrLan = host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    return isLocalOrLan ? `${API_HOST}${rest}` : url;
  }
  return url.startsWith('/') ? `${API_HOST}${url}` : `${API_HOST}/${url}`;
};

const KNOWN_STATUSES: readonly TaskStatus[] = ['assigned', 'in_progress', 'completed', 'cancelled', 'failed'];
const KNOWN_TYPES: readonly TaskType[] = ['delivery', 'pickup', 'atta_pickup', 'atta_delivery'];

const normalizeStatus = (raw: unknown): TaskStatus => {
  const s = String(raw || '').toLowerCase();
  return (KNOWN_STATUSES as readonly string[]).includes(s) ? (s as TaskStatus) : 'assigned';
};

const normalizeType = (raw: unknown): TaskType => {
  const s = String(raw || '').toLowerCase();
  return (KNOWN_TYPES as readonly string[]).includes(s) ? (s as TaskType) : 'delivery';
};

const point = (lat: unknown, lng: unknown): GeoPoint | null => {
  const latitude = toNumberOrNull(lat);
  const longitude = toNumberOrNull(lng);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
};

const mapItem = (row: any): TaskItem => ({
  id: String(row.id),
  name: row.product_name || row.name || '',
  image: fixImageUrl(row.product_image),
  quantity: toNumber(row.quantity, 1),
  unit: row.unit || 'full',
  quality: row.quality ?? null,
  weightKg: toNumberOrNull(row.weight_kg),
  finalWeightKg: toNumberOrNull(row.final_weight_kg),
  unitPrice: toNumber(row.unit_price),
  totalPrice: toNumber(row.total_price, toNumber(row.unit_price) * toNumber(row.quantity, 1)),
  instructions: row.special_instructions ?? null,
});

/**
 * Map a backend rider_tasks row (list or detail shape) to the UI Task.
 * Exported for tests.
 */
export const mapTask = (row: any): Task => {
  // delivery_address_snapshot may arrive flattened (order_*) or as JSON.
  const snapshot =
    typeof row.delivery_address === 'object' && row.delivery_address ? row.delivery_address : null;

  const paymentMethod: string | undefined = row.payment_method ?? undefined;
  const paymentStatus: string | undefined = row.payment_status ?? undefined;
  const totalAmount = toNumberOrNull(row.total_amount);
  const paidAmount = toNumberOrNull(row.paid_amount);
  const status = normalizeStatus(row.status);

  const type = normalizeType(row.task_type ?? row.type);
  const ocpName: string | null = row.ocp_name || null;

  // Cash the rider collects at the door. Once the task is completed the
  // backend has already flipped payment_status to completed — show what was
  // collected (paid_amount) rather than "nothing to collect".
  let codAmount: number | null = null;
  if (paymentMethod === 'cash_on_delivery' && totalAmount !== null) {
    if (status === 'completed') codAmount = paidAmount ?? totalAmount;
    else if (paymentStatus !== 'completed') codAmount = totalAmount;
  }
  // Atta Chakki: the flour-delivery rider collects the atta charges.
  if (type === 'atta_delivery' && row.atta_payment_method !== 'card') {
    const attaTotal = toNumberOrNull(row.atta_total_amount);
    const attaPaid = toNumberOrNull(row.atta_paid_amount);
    if (attaTotal !== null && attaTotal > 0) {
      if (status === 'completed') codAmount = attaPaid && attaPaid > 0 ? attaPaid : attaTotal;
      else if (row.atta_payment_status !== 'completed') codAmount = attaTotal;
    }
  }
  const cashTo: Task['cashTo'] = codAmount && codAmount > 0 ? (row.ocp_id ? 'ocp' : 'office') : null;
  // Orders only: a non-COD order counts as paid ONLY when payment_status says so.
  const paymentUnconfirmed =
    Boolean(row.order_id) &&
    !!paymentMethod &&
    paymentMethod !== 'cash_on_delivery' &&
    paymentStatus !== 'completed' &&
    status !== 'completed';

  const location =
    point(row.address_latitude, row.address_longitude) ||
    point(row.delivery_latitude, row.delivery_longitude) ||
    point(snapshot?.location?.latitude, snapshot?.location?.longitude);

  const customerPhone: string | null = row.customer_phone || null;

  return {
    id: String(row.id),
    type,
    status,
    sequence: toNumberOrNull(row.sequence_number) ?? undefined,
    notes: row.notes ?? null,

    assignedAt: row.assigned_at ?? undefined,
    acceptedAt: row.accepted_at ?? null,
    startedAt: row.started_at ?? null,
    arrivedAt: row.arrived_at ?? null,
    completedAt: row.completed_at ?? null,
    deliveryProofImage: fixImageUrl(row.delivery_proof_image) ?? null,
    pickupProofImage: fixImageUrl(row.pickup_proof_image) ?? null,

    orderId: row.order_id ?? undefined,
    orderNumber: row.order_number ?? undefined,
    orderStatus: row.order_status ?? undefined,
    subtotal: toNumberOrNull(row.subtotal) ?? undefined,
    discount:
      toNumberOrNull(row.discount_amount) !== null || toNumberOrNull(row.coupon_discount) !== null
        ? toNumber(row.discount_amount) + toNumber(row.coupon_discount)
        : undefined,
    deliveryFee: toNumberOrNull(row.delivery_charge) ?? undefined,
    totalAmount: totalAmount ?? undefined,
    paidAmount: paidAmount ?? undefined,
    paymentMethod,
    paymentStatus,
    codAmount,
    cashTo,
    paymentUnconfirmed,
    ocpName,
    ocpAddress: row.ocp_address || null,
    isUrgent: row.is_urgent_delivery === true,
    urgentEta: row.urgent_delivery_eta ?? null,
    customerNotes: row.customer_notes ?? null,

    address:
      row.order_delivery_address ||
      snapshot?.written_address ||
      (typeof row.delivery_address === 'string' ? row.delivery_address : '') ||
      '',
    houseNumber: row.order_house_number ?? snapshot?.house_number ?? null,
    landmark: row.order_landmark ?? snapshot?.landmark ?? null,
    area: row.order_area ?? snapshot?.area_name ?? null,
    city: row.order_city ?? snapshot?.city ?? null,
    location,
    hasPin: row.has_location === true || (row.has_location === undefined && location !== null),
    pinnedBy: row.location_added_by ?? null,
    doorPictureUrl: fixImageUrl(row.door_picture_url) ?? null,
    addressId: row.address_id ?? null,

    pickupAddress: row.pickup_address ?? null,
    pickupLocation: point(row.pickup_latitude, row.pickup_longitude),

    isRestaurant: row.is_restaurant === true,
    restaurantName: row.restaurant_name || null,

    customerName: row.customer_name || null,
    customerPhone,
    phoneVisible: Boolean(customerPhone),

    timeSlotName: row.time_slot_name ?? null,
    slotStart: row.start_time ?? null,
    slotEnd: row.end_time ?? null,
    requestedDate: row.requested_delivery_date ?? null,

    riderCharge: toNumberOrNull(row.rider_delivery_charge),

    attaRequestId: row.atta_request_id ?? null,
    attaRequestNumber: row.atta_request_number ?? null,
    attaStatus: row.atta_status ?? null,
    wheatKg: toNumberOrNull(row.wheat_quantity_kg),
    wheatQuality: row.wheat_quality ?? null,
    flourType: row.flour_type ?? null,
    flourExpectedKg: toNumberOrNull(row.flour_quantity_expected_kg),
    flourActualKg: toNumberOrNull(row.actual_flour_quantity_kg),
    attaInstructions: row.atta_instructions ?? null,

    items: Array.isArray(row.items) ? row.items.map(mapItem) : undefined,
  };
};

const unwrap = <T>(response: ApiResponse<T>, fallbackMessage: string): T => {
  if (!response || response.success === false) {
    throw new ApiError(response?.message || fallbackMessage, null);
  }
  return response.data as T;
};

class TaskService {
  async getActiveTasks(): Promise<Task[]> {
    const response = await apiService.get<ApiResponse<any[]>>('/rider/tasks/active');
    const rows = unwrap(response, 'Failed to fetch active tasks') || [];
    return rows.map(mapTask);
  }

  async getCompletedTasks(): Promise<Task[]> {
    const response = await apiService.get<ApiResponse<any[]>>('/rider/tasks/completed');
    const rows = unwrap(response, 'Failed to fetch completed tasks') || [];
    return rows.map(mapTask);
  }

  async getTaskById(taskId: string): Promise<Task> {
    const response = await apiService.get<ApiResponse<any>>(`/rider/tasks/${taskId}`);
    return mapTask(unwrap(response, 'Failed to fetch task'));
  }

  /** assigned → in_progress (also flips the order to out_for_delivery if needed). */
  async markPickedUp(taskId: string, notes?: string): Promise<Task> {
    const response = await apiService.put<ApiResponse<null>>(`/rider/tasks/${taskId}/pickup`, {
      notes: notes || undefined,
    });
    unwrap(response, 'Failed to confirm pickup');
    return this.getTaskById(taskId);
  }

  /** in_progress → completed (order → delivered; COD → paid). */
  async markDelivered(taskId: string, notes?: string): Promise<Task> {
    const response = await apiService.put<ApiResponse<null>>(`/rider/tasks/${taskId}/deliver`, {
      notes: notes || undefined,
    });
    unwrap(response, 'Failed to confirm delivery');
    return this.getTaskById(taskId);
  }

  /** Mark the task failed with a reason — the order itself is untouched. */
  async failTask(taskId: string, reason: string): Promise<Task> {
    const response = await apiService.post<ApiResponse<any>>(`/rider/tasks/${taskId}/cancel`, {
      reason: reason.slice(0, 500),
    });
    unwrap(response, 'Failed to report the problem');
    return this.getTaskById(taskId);
  }

  async getTodayStats(): Promise<DailyStats> {
    const response = await apiService.get<ApiResponse<any>>('/rider/stats/today');
    const raw = unwrap(response, 'Failed to fetch today stats') || {};
    return {
      date: raw.date || new Date().toISOString().slice(0, 10),
      totalDeliveries: toNumber(raw.totalDeliveries),
      totalEarnings: toNumber(raw.totalEarnings),
    };
  }

  async getMyStats(): Promise<RiderStatsData> {
    const response = await apiService.get<ApiResponse<any>>('/rider/stats');
    const raw = unwrap(response, 'Failed to fetch rider stats') || {};
    const period = (p: any) => ({ orders: toNumber(p?.orders), earnings: toNumber(p?.earnings), attaTasks: toNumber(p?.attaTasks) });
    const pay = raw.payment || {};
    const cashInHand = toNumber(pay.cashInHand);
    const unsettledEarned = toNumber(pay.unsettledEarned);
    return {
      stats: {
        today: period(raw.stats?.today),
        thisWeek: period(raw.stats?.thisWeek),
        lastWeek: period(raw.stats?.lastWeek),
        thisMonth: period(raw.stats?.thisMonth),
        lastMonth: period(raw.stats?.lastMonth),
      },
      payment: {
        totalCollected: toNumber(pay.totalCollected),
        totalEarned: toNumber(pay.totalEarned),
        codEarned: toNumber(pay.codEarned),
        nonCashEarned: toNumber(pay.nonCashEarned),
        totalSettled: toNumber(pay.totalSettled),
        cashInHand,
        unsettledEarned,
        paymentPending: toNumberOrNull(pay.paymentPending) ?? Math.max(cashInHand - unsettledEarned, 0),
        pendingLines: toNumber(pay.pendingOrders) + toNumber(pay.pendingAtta),
      },
    };
  }

  async getCashSettlements(): Promise<CashSettlement[]> {
    const response = await apiService.get<ApiResponse<any[]>>('/rider/cash-settlements');
    const rows = unwrap(response, 'Failed to load cash hand-overs') || [];
    return rows.map((r: any) => ({
      id: String(r.id),
      amount: toNumber(r.amount),
      status: r.status || 'received',
      note: r.note ?? null,
      receivedAt: r.received_at,
      receivedByName: r.received_by_name ?? null,
      orderCount: toNumber(r.order_count),
      attaCount: toNumber(r.atta_count),
    }));
  }

  async getReviews(): Promise<RiderReviews> {
    const response = await apiService.get<ApiResponse<any>>('/rider/reviews');
    const raw = unwrap(response, 'Failed to load reviews') || {};
    return {
      rating: toNumberOrNull(raw.rating),
      ratingCount: toNumber(raw.ratingCount),
      reviews: (raw.reviews || []).map((r: any) => ({
        id: String(r.id),
        rating: toNumber(r.rating),
        comment: r.comment ?? null,
        adminReply: r.admin_reply ?? null,
        createdAt: r.created_at,
        orderNumber: r.order_number ?? null,
        customerFirstName: r.customer_first_name || null,
      })),
    };
  }

  /**
   * "I've arrived" — the customer gets "Aapka order aapke darwaze par hai"
   * (push + live alert + inbox). `notified` is false for restaurant orders,
   * where the office is told instead.
   */
  async markArrived(taskId: string): Promise<{ notified: boolean; arrivedAt: string | null }> {
    const response = await apiService.post<ApiResponse<{ notified: boolean; arrived_at: string | null }>>(
      `/rider/tasks/${taskId}/arrived`
    );
    const data = unwrap(response, 'Failed to notify the customer');
    return { notified: data?.notified === true, arrivedAt: data?.arrived_at ?? null };
  }

  /** Proof-of-delivery photo (stage 'pickup' is the atta wheat hand-over). */
  async uploadProof(taskId: string, imageUri: string, stage: 'pickup' | 'delivery' = 'delivery'): Promise<string> {
    const formData = new FormData();
    formData.append('delivery_proof', {
      uri: imageUri,
      type: 'image/jpeg',
      name: `proof_${taskId}_${stage}.jpg`,
    } as any);
    formData.append('stage', stage);
    const response = await apiService.post<ApiResponse<{ url: string }>>(`/rider/tasks/${taskId}/proof`, formData);
    const data = unwrap(response, 'Failed to upload the proof photo');
    return fixImageUrl(data.url) || data.url;
  }

  /**
   * Privacy-protected call. Returns the number to dial when the admin allowed
   * phone visibility; throws an ApiError carrying the backend's explanation
   * (403) otherwise.
   */
  async requestCustomerCall(orderId: string): Promise<{ callRequestId: string | null; number: string | null; notified: boolean }> {
    const response = await apiService.post<
      ApiResponse<{ call_request_id: string | null; virtual_number: string | null; notified?: boolean }>
    >('/rider/call-request', { order_id: orderId });
    const data = unwrap(response, 'Failed to request call');
    return { callRequestId: data.call_request_id ?? null, number: data.virtual_number ?? null, notified: data.notified === true };
  }

  async pinLocation(taskId: string, latitude: number, longitude: number): Promise<GeoPoint> {
    const response = await apiService.put<ApiResponse<GeoPoint>>(`/rider/tasks/${taskId}/pin-location`, {
      latitude,
      longitude,
    });
    return unwrap(response, 'Failed to pin location');
  }

  async uploadDoorPicture(taskId: string, imageUri: string): Promise<string> {
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
    const data = unwrap(response, 'Failed to upload door picture');
    return fixImageUrl(data.url) || data.url;
  }
}

export const taskService = new TaskService();
export default taskService;
