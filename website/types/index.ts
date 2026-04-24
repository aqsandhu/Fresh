// ============================================================================
// Website Types — Backward-compatible layer over @freshbazar/shared-types
// ============================================================================

// Re-export shared types for cross-package consistency
export {
  UserRole,
  UserStatus,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  UnitType,
  ProductStatus,
  DeliveryType,
  DeliveryChargeType,
  AttaRequestStatus,
  WheatQuality,
  FlourType,
  TaskType,
  TaskStatus,
  NotificationType,
  SlotStatus,
  type User,
  type Category as SharedCategory,
  type Product as SharedProduct,
  type Address as SharedAddress,
  type Order as SharedOrder,
  type Cart,
  type CartItem,
  type OrderItem,
  type TimeSlot,
  type DeliverySettings,
  type DeliveryChargeConfig,
  type DeliveryChargeResult,
  type AttaRequest,
  type Notification,
  type Banner,
  type BusinessHours,
  type Settings,
  type DashboardData,
  type RiderStats,
  type ApiResponse,
  type PaginatedResponse,
  type JwtPayload,
  type OrderFilters,
  type ProductFilters as SharedProductFilters,
  type LoginCredentials,
  type AuthResponse,
  type OtpVerification,
  type RegisterData,
  type Customer,
  type GeoLocation,
  type QueuedAction,
} from '@freshbazar/shared-types';

// ---------------------------------------------------------------------------
// Core domain types (website-specific mappings for backward compatibility)
// ---------------------------------------------------------------------------

export type UserRole = 'customer' | 'admin' | 'super_admin' | 'rider' | 'moderator';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'refunded';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'cash_on_delivery' | 'card' | 'easypaisa' | 'jazzcash' | 'online';
export type UnitType = 'kg' | 'gram' | 'piece' | 'dozen' | 'liter' | 'pack';

export interface User {
  id: string;
  phone: string;
  full_name: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  avatar_url?: string;
  avatarUrl?: string;
  name?: string;
  last_login_at?: string;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  nameEn?: string;
  nameUr?: string;
  nameUrdu?: string;
  description?: string;
  descriptionEn?: string;
  price: number;
  sale_price?: number;
  unit: UnitType;
  unit_quantity: number;
  unitType?: string;
  stock_quantity: number;
  stockQuantity?: number;
  image_url?: string;
  image?: string;
  primaryImage?: string;
  images?: string[];
  category_id: string;
  categoryId?: string;
  is_featured: boolean;
  isFeatured?: boolean;
  is_active: boolean;
  isActive?: boolean;
  compareAtPrice?: number;
  inStock?: boolean;
  chickenOnly?: boolean;
  isChickenOnly?: boolean;
}

export interface Category {
  id: string;
  name: string;
  nameEn?: string;
  nameUr?: string;
  nameUrdu?: string;
  description?: string;
  image_url?: string;
  imageUrl?: string;
  is_active: boolean;
  isActive?: boolean;
  icon?: string;
  displayOrder?: number;
  productCount?: number;
  subcategories?: Category[];
}

// Cart item used by the store (has full Product object)
export interface CartStoreItem {
  product: Product;
  quantity: number;
}

// API-level cart item (flat structure with IDs)
export interface CartItem {
  id: string;
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
  orderNumber?: string;
  user_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  paymentStatus?: string;
  payment_method: PaymentMethod;
  paymentMethod?: string;
  subtotal: number;
  delivery_charge: number;
  deliveryCharge?: number;
  discount_amount?: number;
  discountAmount?: number;
  total_amount: number;
  totalAmount?: number;
  paid_amount?: number;
  paidAmount?: number;
  delivery_address_id?: string;
  addressId?: string;
  delivery_address_snapshot?: any;
  deliveryAddressSnapshot?: any;
  rider_id?: string;
  riderId?: string;
  rider_name?: string;
  riderName?: string;
  rider_phone?: string;
  riderPhone?: string;
  notes?: string;
  customer_notes?: string;
  customerNotes?: string;
  cancelled_reason?: string;
  scheduled_delivery_at?: string;
  slot_name?: string;
  slotName?: string;
  start_time?: string;
  startTime?: string;
  end_time?: string;
  endTime?: string;
  requested_delivery_date?: string;
  requestedDeliveryDate?: string;
  show_customer_phone?: boolean;
  showCustomerPhone?: boolean;
  customer_name?: string;
  customerName?: string;
  customer_phone?: string;
  customerPhone?: string;
  customer_email?: string;
  customerEmail?: string;
  address_latitude?: number;
  addressLatitude?: number;
  address_longitude?: number;
  addressLongitude?: number;
  address_door_picture_url?: string;
  addressDoorPictureUrl?: string;
  placed_at?: string;
  placedAt?: string;
  confirmed_at?: string;
  confirmedAt?: string;
  preparing_at?: string;
  preparingAt?: string;
  ready_at?: string;
  readyAt?: string;
  out_for_delivery_at?: string;
  outForDeliveryAt?: string;
  delivered_at?: string;
  deliveredAt?: string;
  cancelled_at?: string;
  cancelledAt?: string;
  created_at: string;
  items?: CartItem[] | any[];
}

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
  writtenAddress?: string;
  address_type?: string;
  addressType?: string;
  is_default: boolean;
}

export interface AttaChakkiRequest {
  id: string;
  user_id: string;
  status: string;
  wheat_quantity_kg: number;
  flour_type: string;
  total_amount: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  order_id: string;
  sender_type: string;
  sender_id: string;
  message: string;
  created_at: string;
}

export interface Banner {
  id: string;
  title: string;
  image_url: string;
  link?: string;
  is_active: boolean;
  sort_order: number;
}

export interface Rider {
  id: string;
  user_id: string;
  full_name?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  cnic?: string;
  vehicle_type: string;
  vehicleType?: string;
  vehicle_number?: string;
  vehicleNumber?: string;
  driving_license_number?: string;
  drivingLicenseNumber?: string;
  emergency_contact_name?: string;
  emergencyContactName?: string;
  emergency_contact_phone?: string;
  emergencyContactPhone?: string;
  bank_account_title?: string;
  bankAccountTitle?: string;
  bank_account_number?: string;
  bankAccountNumber?: string;
  bank_name?: string;
  bankName?: string;
  avatar_url?: string;
  avatarUrl?: string;
  status: string;
  rating: number;
  total_deliveries: number;
  totalDeliveries?: number;
  verification_status?: string;
  verificationStatus?: string;
}

// ---------------------------------------------------------------------------
// Auth Types
// ---------------------------------------------------------------------------

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  products?: T[];
}

// ---------------------------------------------------------------------------
// Website-specific Types
// ---------------------------------------------------------------------------

export interface ProductFilters {
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sortBy?: 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc' | 'popular';
}

export interface CartState {
  items: CartStoreItem[];
  isLoading?: boolean;
  syncError?: string | null;
  lastSyncedAt?: number | null;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
  getSubtotal: () => number;
  getDeliveryCharge: () => number;
  getFinalTotal: () => number;
  hasOnlyChicken: () => boolean;
  syncWithBackend?: () => Promise<boolean>;
}

export interface DashboardData {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  recentOrders: Order[];
  topProducts: Product[];
}

export interface DeliverySettings {
  freeThreshold: number;
  standardCharge: number;
}

export interface TimeSlot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  max_orders: number;
  is_free_delivery_slot?: boolean;
}

export interface BusinessHours {
  day: string;
  open: string;
  close: string;
}

export interface Settings {
  business_name: string;
  contact_phone: string;
  delivery_settings: DeliverySettings;
}

export interface RiderStats {
  totalRiders: number;
  activeRiders: number;
  totalDeliveries: number;
  averageRating: number;
}
