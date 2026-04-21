// ============================================================================
// TYPE DEFINITIONS - Pakistani Grocery Delivery Platform
// ============================================================================

// User Types
export type UserRole = 'customer' | 'rider' | 'admin' | 'super_admin';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'deleted';

// Rider Types
export type RiderStatus = 'available' | 'busy' | 'offline' | 'on_leave';
export type RiderVerificationStatus = 'pending' | 'verified' | 'rejected';

// Product Types
export type ProductStatus = 'active' | 'inactive' | 'out_of_stock' | 'discontinued';
export type UnitType = 'kg' | 'gram' | 'piece' | 'dozen' | 'liter' | 'ml' | 'pack';

// Order Types
export type OrderStatus = 
  | 'pending' 
  | 'confirmed' 
  | 'preparing' 
  | 'ready_for_pickup' 
  | 'out_for_delivery' 
  | 'delivered' 
  | 'cancelled' 
  | 'refunded';

export type OrderSource = 'app' | 'website' | 'whatsapp' | 'manual' | 'phone';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'partially_refunded';
export type PaymentMethod = 'cash_on_delivery' | 'card' | 'easypaisa' | 'jazzcash' | 'bank_transfer';

// Delivery Types
export type DeliveryType = 'standard' | 'express' | 'scheduled';
export type DeliveryChargeType = 'free' | 'flat' | 'distance_based' | 'weight_based';

// Atta Chakki Types
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
export type FlourType = 'fine' | 'medium' | 'coarse';

// Task Types
export type TaskType = 'pickup' | 'delivery' | 'atta_pickup' | 'atta_delivery';
export type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'failed';

// Notification Types
export type NotificationType = 
  | 'order_placed' 
  | 'order_confirmed' 
  | 'order_ready' 
  | 'out_for_delivery' 
  | 'delivered' 
  | 'cancelled' 
  | 'payment_received' 
  | 'rider_assigned'
  | 'call_request' 
  | 'promotion' 
  | 'system';

// Slot Status
export type SlotStatus = 'available' | 'booked' | 'blocked';

// ============================================================================
// INTERFACES
// ============================================================================

export interface User {
  id: string;
  phone: string;
  email?: string;
  full_name: string;
  password_hash?: string;
  role: UserRole;
  status: UserStatus;
  avatar_url?: string;
  is_phone_verified: boolean;
  is_email_verified: boolean;
  preferred_language: string;
  notification_enabled: boolean;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Rider {
  id: string;
  user_id: string;
  cnic: string;
  cnic_front_image: string;
  cnic_back_image: string;
  driving_license_number?: string;
  license_image?: string;
  vehicle_type: string;
  vehicle_number: string;
  vehicle_image?: string;
  status: RiderStatus;
  verification_status: RiderVerificationStatus;
  current_location?: {
    lat: number;
    lng: number;
  };
  location_updated_at?: Date;
  assigned_zone_id?: string;
  rating: number;
  total_deliveries: number;
  total_earnings: number;
  created_at: Date;
  updated_at: Date;
}

export interface Admin {
  id: string;
  user_id: string;
  admin_level: number;
  department?: string;
  employee_id?: string;
  permissions: Record<string, boolean>;
  is_active: boolean;
  last_active_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Category {
  id: string;
  name_ur: string;
  name_en: string;
  slug: string;
  icon_url?: string;
  image_url?: string;
  parent_id?: string;
  level: number;
  display_order: number;
  is_active: boolean;
  is_featured: boolean;
  qualifies_for_free_delivery: boolean;
  minimum_order_for_free_delivery?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Product {
  id: string;
  name_ur: string;
  name_en: string;
  slug: string;
  sku?: string;
  barcode?: string;
  category_id: string;
  subcategory_id?: string;
  price: number;
  compare_at_price?: number;
  cost_price?: number;
  unit_type: UnitType;
  unit_value: number;
  stock_quantity: number;
  low_stock_threshold: number;
  stock_status: ProductStatus;
  track_inventory: boolean;
  primary_image?: string;
  images?: string[];
  description_ur?: string;
  description_en?: string;
  short_description?: string;
  attributes: Record<string, any>;
  is_active: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  view_count: number;
  order_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface Address {
  id: string;
  user_id: string;
  address_type: string;
  house_number?: string;
  written_address: string;
  landmark?: string;
  location: {
    lat: number;
    lng: number;
  };
  location_accuracy?: number;
  google_place_id?: string;
  door_picture_url: string;
  area_name?: string;
  city: string;
  province: string;
  postal_code?: string;
  zone_id?: string;
  is_default: boolean;
  is_verified: boolean;
  delivery_instructions?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Cart {
  id: string;
  user_id: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  delivery_charge: number;
  total_amount: number;
  coupon_code?: string;
  coupon_discount: number;
  item_count: number;
  total_weight_kg: number;
  expires_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  weight_kg?: number;
  special_instructions?: string;
  product?: Product;
  created_at: Date;
  updated_at: Date;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  source: OrderSource;
  address_id: string;
  delivery_address_snapshot: any;
  time_slot_id?: string;
  requested_delivery_date?: Date;
  subtotal: number;
  discount_amount: number;
  delivery_charge: number;
  tax_amount: number;
  total_amount: number;
  delivery_charge_rule_id?: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  paid_amount: number;
  status: OrderStatus;
  rider_id?: string;
  assigned_at?: Date;
  placed_at: Date;
  confirmed_at?: Date;
  preparing_at?: Date;
  ready_at?: Date;
  out_for_delivery_at?: Date;
  delivered_at?: Date;
  cancelled_at?: Date;
  cancellation_reason?: string;
  customer_notes?: string;
  admin_notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_image?: string;
  product_sku?: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  weight_kg?: number;
  status: string;
  special_instructions?: string;
  created_at: Date;
  updated_at: Date;
}

export interface TimeSlot {
  id: string;
  slot_name: string;
  start_time: string;
  end_time: string;
  max_orders: number;
  booked_orders: number;
  status: SlotStatus;
  is_free_delivery_slot: boolean;
  is_express_slot: boolean;
  applicable_days?: number[];
  zone_ids?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface DeliveryChargeConfig {
  id: string;
  rule_name: string;
  rule_code: string;
  description?: string;
  condition_type: string;
  applicable_categories?: string[];
  excluded_categories?: string[];
  start_time?: string;
  end_time?: string;
  applicable_days?: number[];
  minimum_order_value?: number;
  maximum_order_value?: number;
  charge_type: DeliveryChargeType;
  charge_amount: number;
  is_free_delivery_slot: boolean;
  order_before_time?: string;
  delivery_slot_id?: string;
  priority: number;
  is_active: boolean;
  valid_from?: Date;
  valid_until?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AttaRequest {
  id: string;
  request_number: string;
  user_id: string;
  address_id: string;
  wheat_quality: WheatQuality;
  wheat_quantity_kg: number;
  wheat_description?: string;
  flour_type: FlourType;
  flour_quantity_expected_kg?: number;
  special_instructions?: string;
  mill_id?: string;
  mill_name?: string;
  status: AttaRequestStatus;
  pickup_scheduled_at?: Date;
  picked_up_at?: Date;
  pickup_proof_image?: string;
  milling_started_at?: Date;
  milling_completed_at?: Date;
  actual_flour_quantity_kg?: number;
  delivery_scheduled_at?: Date;
  delivered_at?: Date;
  delivery_proof_image?: string;
  pickup_rider_id?: string;
  delivery_rider_id?: string;
  service_charge: number;
  milling_charge: number;
  delivery_charge: number;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  created_at: Date;
  updated_at: Date;
}

export interface RiderTask {
  id: string;
  rider_id: string;
  task_type: TaskType;
  status: TaskStatus;
  order_id?: string;
  atta_request_id?: string;
  pickup_location?: {
    lat: number;
    lng: number;
  };
  delivery_location?: {
    lat: number;
    lng: number;
  };
  pickup_address?: string;
  delivery_address?: string;
  assigned_at: Date;
  accepted_at?: Date;
  started_at?: Date;
  completed_at?: Date;
  estimated_duration?: number;
  sequence_number: number;
  batch_id?: string;
  pickup_proof_image?: string;
  delivery_proof_image?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface WhatsappOrder {
  id: string;
  whatsapp_number: string;
  customer_name?: string;
  items: any[];
  subtotal: number;
  delivery_charge: number;
  total_amount: number;
  address_text?: string;
  location?: {
    lat: number;
    lng: number;
  };
  status: string;
  converted_to_order_id?: string;
  converted_by?: string;
  converted_at?: Date;
  entered_by: string;
  admin_notes?: string;
  customer_notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Notification {
  id: string;
  user_id?: string;
  rider_id?: string;
  type: NotificationType;
  title: string;
  message: string;
  order_id?: string;
  atta_request_id?: string;
  action_url?: string;
  action_type?: string;
  is_read: boolean;
  read_at?: Date;
  sent_via?: string[];
  delivered_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CallRequest {
  id: string;
  rider_id: string;
  order_id: string;
  virtual_number?: string;
  status: string;
  requested_at: Date;
  connected_at?: Date;
  ended_at?: Date;
  duration_seconds?: number;
  created_at: Date;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface JwtPayload {
  userId: string;
  phone: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface DeliveryChargeResult {
  delivery_charge: number;
  rule_applied: string;
  rule_name: string;
  explanation: string;
}
