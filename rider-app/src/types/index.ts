// ============================================================================
// Rider App Types — UI-facing shapes. Enum values mirror the backend exactly
// (database/schema.sql + @freshbazar/shared-types); the mapping from API rows
// lives in services/task.service.ts.
// ============================================================================

export type {
  ApiResponse,
  PaginatedResponse,
  LoginCredentials,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  AttaRequestStatus,
  RiderStatus,
} from '@freshbazar/shared-types';

import type { OrderStatus, PaymentMethod, PaymentStatus, AttaRequestStatus, RiderStatus } from '@freshbazar/shared-types';

/** rider_tasks.task_type */
export type TaskType = 'delivery' | 'pickup' | 'atta_pickup' | 'atta_delivery';

/** rider_tasks.status — the ONLY task states the app knows. */
export type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'failed';

export const ACTIVE_TASK_STATUSES: readonly TaskStatus[] = ['assigned', 'in_progress'];
export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'cancelled', 'failed'];

export const isActiveTaskStatus = (s: TaskStatus): boolean => ACTIVE_TASK_STATUSES.includes(s);
export const isTerminalTaskStatus = (s: TaskStatus): boolean => TERMINAL_TASK_STATUSES.includes(s);

/** order_items.unit fraction */
export type UnitFraction = 'full' | 'half_kg' | 'quarter_kg' | 'half_dozen' | string;

export interface TaskItem {
  id: string;
  name: string;
  image?: string;
  quantity: number;
  unit: UnitFraction;
  quality?: string | null;
  weightKg?: number | null;
  unitPrice: number;
  totalPrice: number;
  instructions?: string | null;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  sequence?: number;
  notes?: string | null;

  assignedAt?: string;
  acceptedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;

  // ── Order ──────────────────────────────────────────────────────────────
  orderId?: string;
  orderNumber?: string;
  orderStatus?: OrderStatus;
  subtotal?: number;
  discount?: number;
  deliveryFee?: number;
  totalAmount?: number;
  paidAmount?: number;
  paymentMethod?: PaymentMethod | string;
  paymentStatus?: PaymentStatus | string;
  /** Cash the rider must collect at the door (null when nothing to collect). */
  codAmount: number | null;
  isUrgent: boolean;
  urgentEta?: string | null;
  customerNotes?: string | null;

  // ── Delivery address ───────────────────────────────────────────────────
  address: string;
  houseNumber?: string | null;
  landmark?: string | null;
  area?: string | null;
  city?: string | null;
  location: GeoPoint | null;
  /** True when the live address row has a GPS pin (detail only; lists infer from `location`). */
  hasPin: boolean;
  pinnedBy?: string | null;
  doorPictureUrl?: string | null;
  addressId?: string | null;

  // ── Pickup (atta / pickup tasks) ───────────────────────────────────────
  pickupAddress?: string | null;
  pickupLocation?: GeoPoint | null;

  // ── Customer (privacy-gated) ───────────────────────────────────────────
  customerName?: string | null;
  customerPhone?: string | null;
  /** False when the admin kept the phone hidden → calls go via the proxy. */
  phoneVisible: boolean;

  // ── Schedule ───────────────────────────────────────────────────────────
  timeSlotName?: string | null;
  slotStart?: string | null;
  slotEnd?: string | null;
  requestedDate?: string | null;

  // ── Rider earnings ─────────────────────────────────────────────────────
  riderCharge?: number | null;

  // ── Atta Chakki ────────────────────────────────────────────────────────
  attaRequestId?: string | null;
  attaRequestNumber?: string | null;
  attaStatus?: AttaRequestStatus | string | null;
  wheatKg?: number | null;

  items?: TaskItem[];
}

/** Human reference shown on cards: order number, else atta request number. */
export const taskReference = (task: Pick<Task, 'orderNumber' | 'attaRequestNumber' | 'orderId' | 'attaRequestId' | 'id'>): string =>
  task.orderNumber || task.attaRequestNumber || (task.orderId || task.attaRequestId || task.id).slice(0, 8).toUpperCase();

export interface Rider {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  cnic?: string;
  status: RiderStatus;
  verificationStatus?: string;
  rating?: number;
  ratingCount?: number;
  totalDeliveries: number;
  totalEarnings: number;
}

export interface AppSettings {
  language: 'en' | 'ur';
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export interface LocationFix extends GeoPoint {
  accuracy?: number;
  timestamp?: number;
}

export interface DailyStats {
  date: string;
  totalDeliveries: number;
  totalEarnings: number;
}

export interface PeriodStats {
  orders: number;
  earnings: number;
}

export interface RiderStatsData {
  stats: {
    today: PeriodStats;
    thisWeek: PeriodStats;
    lastWeek: PeriodStats;
    thisMonth: PeriodStats;
    lastMonth: PeriodStats;
  };
  payment: {
    /** COD cash collected by this rider (all time, direct orders only). */
    totalCollected: number;
    /** Sum of rider_delivery_charge over delivered orders. */
    totalEarned: number;
    /** Earnings on COD orders (deducted from cash due). */
    codEarned: number;
    /** Cash already handed to the company (rider_cash_settlements). */
    totalSettled: number;
    /** collected − settled */
    cashInHand: number;
    /** collected − settled − codEarned → what the rider must hand over. */
    paymentPending: number;
  };
}

export type QueuedActionType = 'task_action' | 'update_status';

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

export interface LoginResponse {
  rider: Rider;
  token: string;
  refreshToken?: string | null;
}

export type ProblemReason =
  | 'customer_unreachable'
  | 'wrong_address'
  | 'customer_refused'
  | 'damaged_items'
  | 'vehicle_issue'
  | 'other';

export const PROBLEM_REASONS: readonly ProblemReason[] = [
  'customer_unreachable',
  'wrong_address',
  'customer_refused',
  'damaged_items',
  'vehicle_issue',
  'other',
];

// ── Navigation param lists ───────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Tasks: { tab?: 'active' | 'completed' } | undefined;
  Earnings: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: { screen?: keyof MainTabParamList; params?: MainTabParamList[keyof MainTabParamList] } | undefined;
  TaskDetail: { taskId: string };
  Chat: { orderId: string; orderNumber?: string; orderStatus?: string };
  Settings: undefined;
  Help: undefined;
};
