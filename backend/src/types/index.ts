// ============================================================================
// BACKEND TYPE DEFINITIONS
// ============================================================================
// All types are defined locally - no external monorepo dependencies.
// This ensures the backend can build independently on any platform.
// ============================================================================

// ---------------------------------------------------------------------------
// User Types
// ---------------------------------------------------------------------------

export type UserRole = 'customer' | 'admin' | 'super_admin' | 'rider' | 'moderator';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';

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

export type UnitType = 'kg' | 'gram' | 'piece' | 'dozen' | 'liter' | 'pack';

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

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'cod' | 'card' | 'easypaisa' | 'jazzcash' | 'online';
export type OrderSource = 'website' | 'customer_app' | 'admin_panel' | 'phone';

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

export type SlotStatus = 'available' | 'booked' | 'unavailable';

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
export type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled';

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
  deliveryCharge: number;
  isFreeDelivery: boolean;
  freeDeliveryThreshold: number;
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
