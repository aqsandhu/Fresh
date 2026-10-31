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
  /** Actual packed weight after the admin re-weighed (variable-weight items). */
  finalWeightKg?: number | null;
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
  /** When the rider tapped "I've arrived" (customer notified). */
  arrivedAt?: string | null;
  completedAt?: string | null;
  deliveryProofImage?: string | null;
  pickupProofImage?: string | null;

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
  /** Who receives that cash: the office, or an Order Collection Point. */
  cashTo: 'office' | 'ocp' | null;
  ocpName?: string | null;
  ocpAddress?: string | null;
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

  // ── Restaurant (B2B) orders ────────────────────────────────────────────
  isRestaurant: boolean;
  restaurantName?: string | null;

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
  wheatQuality?: string | null;
  flourType?: string | null;
  flourExpectedKg?: number | null;
  flourActualKg?: number | null;
  /** Customer's note for the atta request (often a contact number). */
  attaInstructions?: string | null;

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
  cityName?: string | null;
  activeTasks?: number;
}

export interface RiderReview {
  id: string;
  rating: number;
  comment?: string | null;
  adminReply?: string | null;
  createdAt: string;
  orderNumber?: string | null;
  customerFirstName?: string | null;
}

export interface RiderReviews {
  rating: number | null;
  ratingCount: number;
  reviews: RiderReview[];
}

export interface CashSettlement {
  id: string;
  amount: number;
  status: string;
  note?: string | null;
  receivedAt: string;
  receivedByName?: string | null;
  orderCount: number;
  attaCount: number;
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
  /** Atta Chakki pickups + deliveries in the period. */
  attaTasks: number;
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
    /** Pay on orders where no cash passed through the rider — the office owes it. */
    nonCashEarned: number;
    /** Cash already handed to the company (rider_cash_settlements). */
    totalSettled: number;
    /** Customer cash still with the rider (not yet handed over). */
    cashInHand: number;
    /** The rider's own pay inside cashInHand (he keeps it). */
    unsettledEarned: number;
    /** cashInHand − unsettledEarned → what the rider must hand over. */
    paymentPending: number;
    /** Deliveries whose cash is not handed over yet. */
    pendingLines: number;
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
  Reviews: undefined;
};
