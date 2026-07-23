// ============================================================================
// BACKEND TYPE DEFINITIONS
// ============================================================================
// All types are defined locally - no external monorepo dependencies.
// This ensures the backend can build independently on any platform.
// ============================================================================

// ---------------------------------------------------------------------------
// User Types
// ---------------------------------------------------------------------------

// Aligned with database/schema.sql: CREATE TYPE user_role AS ENUM
// ('customer', 'rider', 'admin', 'super_admin'). ('moderator' never existed in
// the DB enum and had no runtime consumers.)
export type UserRole = 'customer' | 'admin' | 'super_admin' | 'rider';
// Aligned with user_status AS ENUM ('active', 'inactive', 'suspended',
// 'deleted') — the DB has 'deleted', not 'pending'.
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'deleted';

export interface User {
  id: string;
  phone: string;
  full_name: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// JWT Types
// ---------------------------------------------------------------------------

export interface JwtPayload {
  userId: string;
  phone: string;
  role: UserRole;
  /** 'refresh' on refresh tokens, 'socket' on socket-handshake tokens */
  type?: 'refresh' | 'socket';
}

// ---------------------------------------------------------------------------
// Rider Types
// ---------------------------------------------------------------------------

export type RiderStatus = 'available' | 'busy' | 'offline' | 'on_leave';

export interface Rider {
  id: string;
  user_id: string;
  vehicle_type: string;
  vehicle_number?: string;
  current_latitude?: number;
  current_longitude?: number;
  status: RiderStatus;
  rating: number;
  total_deliveries: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Product Types
// ---------------------------------------------------------------------------

// Aligned with unit_type AS ENUM ('kg', 'gram', 'piece', 'dozen', 'liter',
// 'ml', 'pack').
export type UnitType = 'kg' | 'gram' | 'piece' | 'dozen' | 'liter' | 'ml' | 'pack';

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  sale_price?: number;
  unit: UnitType;
  unit_quantity: number;
  stock_quantity: number;
  image_url?: string;
  category_id: string;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  parent_id?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Order Types
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

// Aligned with payment_status AS ENUM ('pending', 'completed', 'failed',
// 'refunded', 'partially_refunded').
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'partially_refunded';
// Aligned with payment_method AS ENUM ('cash_on_delivery', 'card',
// 'easypaisa', 'jazzcash', 'bank_transfer') — the old 'cod'/'online' literals
// never existed in the DB enum and had no runtime consumers.
export type PaymentMethod = 'cash_on_delivery' | 'card' | 'easypaisa' | 'jazzcash' | 'bank_transfer';
// Aligned with order_source AS ENUM ('app', 'website', 'whatsapp', 'manual',
// 'phone') — the old 'customer_app'/'admin_panel' literals never existed in
// the DB enum and had no runtime consumers.
export type OrderSource = 'app' | 'website' | 'whatsapp' | 'manual' | 'phone';

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  source: OrderSource;
  subtotal: number;
  delivery_charge: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  delivery_address_id: string;
  delivery_address_snapshot: any;
  rider_id?: string;
  notes?: string;
  cancelled_reason?: string;
  scheduled_delivery_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Cart Types
// ---------------------------------------------------------------------------

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string;
  added_at: string;
}

export interface Cart {
  id: string;
  user_id: string;
  items: CartItem[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Address Types
// ---------------------------------------------------------------------------

export interface Address {
  id: string;
  user_id: string;
  label: string;
  house_number: string;
  street_address: string;
  area: string;
  city: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  written_address?: string;
  door_picture_url?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Time Slot Types
// ---------------------------------------------------------------------------

// Aligned with slot_status AS ENUM ('available', 'booked', 'blocked') — the
// old 'unavailable' literal is NOT in the DB enum.
// TODO(backend-core): controllers/admin/settings.controller.ts
// (createTimeSlot/updateTimeSlot) still writes status = 'unavailable' into
// time_slots.status at runtime, which raises 22P02 (invalid enum value).
// It must write 'blocked' instead. Owned by fix/backend-core — not fixed here.
export type SlotStatus = 'available' | 'booked' | 'blocked';

export interface TimeSlot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  max_orders: number;
  booked_orders: number;
  status: SlotStatus;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Atta Request Types
// ---------------------------------------------------------------------------

export type AttaRequestStatus =
  | 'pending_pickup'
  | 'picked_up'
  | 'at_mill'
  | 'milling'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type WheatQuality = 'desi' | 'imported' | 'mixed';
export type FlourType = 'fine' | 'coarse' | 'medium';

export interface AttaRequest {
  id: string;
  request_number: string;
  user_id: string;
  address_id: string;
  wheat_quality: WheatQuality;
  wheat_quantity_kg: number;
  wheat_description?: string;
  flour_type: FlourType;
  flour_quantity_expected_kg: number;
  actual_flour_quantity_kg?: number;
  service_charge: number;
  milling_charge: number;
  delivery_charge: number;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  status: AttaRequestStatus;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Rider Task Types
// ---------------------------------------------------------------------------

export type TaskType = 'delivery' | 'pickup' | 'atta_pickup' | 'atta_delivery';
// Aligned with task_status AS ENUM ('assigned', 'in_progress', 'completed',
// 'cancelled', 'failed').
export type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'failed';

export interface RiderTask {
  id: string;
  rider_id: string;
  type: TaskType;
  order_id?: string;
  atta_request_id?: string;
  status: TaskStatus;
  pickup_address?: string;
  delivery_address?: string;
  completed_at?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Notification Types
// ---------------------------------------------------------------------------

export type NotificationType = 'order' | 'delivery' | 'promotion' | 'system' | 'chat';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: any;
  is_read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Delivery Charge Types
// ---------------------------------------------------------------------------

export interface DeliveryChargeConfig {
  freeThreshold: number;
  standardCharge: number;
  specialCategoryCharge?: number;
}

export interface DeliveryChargeResult {
  /** Delivery charge amount */
  delivery_charge: number;
  /** Which rule was applied */
  rule_applied: string;
  /** Human-readable rule name */
  rule_name: string;
  /** Human-readable explanation */
  explanation: string;
  /** camelCase aliases for convenience */
  deliveryCharge?: number;
  isFreeDelivery?: boolean;
  freeDeliveryThreshold?: number;
  is_free_delivery?: boolean;
  free_delivery_threshold?: number;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
  error?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Express-specific Types
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & {
        id: string;
        full_name?: string;
        status?: string;
      };
      userRecord?: User;
      txClient?: any;
    }
  }
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export type ErrorHandler = (
  err: any,
  req: any,
  res: any,
  next: any
) => void;

export interface AuthenticatedRequest {
  user: JwtPayload;
  body: any;
  params: any;
  query: any;
  file?: UploadedFile;
  files?: UploadedFile[];
}
