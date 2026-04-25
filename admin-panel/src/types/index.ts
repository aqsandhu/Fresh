// ============================================================================
// Admin Panel Types — Self-contained (no monorepo dependencies)
// ============================================================================

// ---------------------------------------------------------------------------
// Shared domain types (defined locally for Netlify compatibility)
// ---------------------------------------------------------------------------

export type UserRole = 'customer' | 'admin' | 'super_admin' | 'rider' | 'moderator';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'refunded';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'cash_on_delivery' | 'cod' | 'card' | 'easypaisa' | 'jazzcash' | 'online';
export type RiderStatus = 'available' | 'busy' | 'offline' | 'on_leave';
export type UnitType = 'kg' | 'gram' | 'piece' | 'dozen' | 'liter' | 'pack';
export type AttaRequestStatus = 'pending_pickup' | 'picked_up' | 'at_mill' | 'milling' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered' | 'cancelled';

export interface User {
  id: string;
  phone: string;
  full_name: string;
  fullName?: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  avatar_url?: string;
  avatarUrl?: string;
  created_at?: string;
  createdAt?: string;
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
  salePrice?: number;
  unit: UnitType;
  unit_quantity: number;
  unitQuantity?: number;
  stock_quantity: number;
  stockQuantity?: number;
  image_url?: string;
  imageUrl?: string;
  category_id: string;
  categoryId?: string;
  is_featured: boolean;
  isFeatured?: boolean;
  is_active: boolean;
  isActive?: boolean;
  inStock?: boolean;
  rating?: number;
  reviews?: number;
  tags?: string[];
  compareAtPrice?: number;
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

export interface Order {
  id: string;
  order_number: string;
  orderNumber?: string;
  user_id: string;
  userId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  paymentStatus?: PaymentStatus;
  payment_method: PaymentMethod;
  paymentMethod?: PaymentMethod;
  subtotal: number;
  delivery_charge: number;
  deliveryCharge?: number;
  discount_amount?: number;
  discountAmount?: number;
  total_amount: number;
  totalAmount?: number;
  delivery_address_id?: string;
  addressId?: string;
  deliveryAddressSnapshot?: any;
  delivery_address_snapshot?: any;
  rider_id?: string;
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  notes?: string;
  customer_notes?: string;
  customerNotes?: string;
  show_customer_phone?: boolean;
  showCustomerPhone?: boolean;
  scheduled_delivery_at?: string;
  slot_name?: string;
  slotName?: string;
  start_time?: string;
  startTime?: string;
  end_time?: string;
  endTime?: string;
  requested_delivery_date?: string;
  requestedDeliveryDate?: string;
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
  address_latitude?: number;
  addressLatitude?: number;
  address_longitude?: number;
  addressLongitude?: number;
  address_door_picture_url?: string;
  addressDoorPictureUrl?: string;
  created_at: string;
  createdAt?: string;
  paidAmount?: number;
  paid_amount?: number;
  items?: any[];
}

export interface Rider {
  id: string;
  user_id: string;
  userId?: string;
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
  status: RiderStatus;
  rating: number;
  total_deliveries: number;
  totalDeliveries?: number;
  verification_status?: string;
  verificationStatus?: string;
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
  orders?: T[];
  requests?: T[];
  products?: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Auth Types
// ---------------------------------------------------------------------------

export interface LoginCredentials {
  phone: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
}

// ---------------------------------------------------------------------------
// Address Types
// ---------------------------------------------------------------------------

export interface Address {
  id: string;
  user_id: string;
  userId?: string;
  label: string;
  house_number: string;
  houseNumber?: string;
  street_address: string;
  streetAddress?: string;
  area: string;
  areaName?: string;
  city: string;
  is_default: boolean;
  isDefault?: boolean;
  latitude?: number;
  longitude?: number;
  writtenAddress?: string;
  written_address?: string;
  landmark?: string;
  province?: string;
  addressType?: string;
  address_type?: string;
  deliveryInstructions?: string;
  hasLocation?: boolean;
  locationAddedBy?: string;
  zoneName?: string;
  createdAt?: string;
  doorPictureUrl?: string;
  door_picture_url?: string;
}

export interface Customer {
  id: string;
  phone: string;
  full_name: string;
  fullName?: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  createdAt?: string;
  totalOrders?: number;
  totalSpent?: number;
  totalAddresses?: number;
  lastOrderAt?: string;
  addresses?: Address[];
}

// ---------------------------------------------------------------------------
// Atta Types
// ---------------------------------------------------------------------------

export interface AttaRequest {
  id: string;
  request_number: string;
  requestNumber?: string;
  user_id: string;
  userId?: string;
  wheat_quality: string;
  wheatQuality?: string;
  wheat_quantity_kg: number;
  wheatQuantityKg?: number;
  flour_type: string;
  flourType?: string;
  status: AttaRequestStatus;
  total_amount: number;
  totalAmount?: number;
  created_at: string;
  createdAt?: string;
  customerName?: string;
  customerPhone?: string;
}

// ---------------------------------------------------------------------------
// Dashboard Types
// ---------------------------------------------------------------------------

export interface DashboardData {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  today?: { orders: number; revenue: number; totalSales?: number; totalOrders?: number; pendingOrders?: number; deliveredOrders?: number };
  weekly?: { orders: number; revenue: number; totalSales?: number; totalOrders?: number };
  monthly?: { orders: number; revenue: number; totalSales?: number; totalOrders?: number };
  recentOrders: Order[];
  topProducts: Product[];
  lowStockProducts?: Product[];
  riders?: { available: number; busy: number; offline: number; totalRiders?: number; availableRiders?: number; busyRiders?: number };
}

// ---------------------------------------------------------------------------
// Settings Types
// ---------------------------------------------------------------------------

export interface DeliverySettings {
  freeThreshold: number;
  standardCharge: number;
  baseCharge?: number;
  freeDeliveryThreshold?: number;
  expressCharge?: number;
}

export interface TimeSlot {
  id: string;
  date: string;
  start_time: string;
  startTime?: string;
  end_time: string;
  endTime?: string;
  max_orders: number;
  maxOrders?: number;
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
  delivery?: { baseCharge: number; freeDeliveryThreshold: number; expressCharge: number; };
}

// ---------------------------------------------------------------------------
// Rider Stats
// ---------------------------------------------------------------------------

export interface RiderStats {
  totalRiders: number;
  activeRiders: number;
  totalDeliveries: number;
  averageRating: number;
  deliveryCharges?: number;
  stats?: { earnings: number; deliveries: number; rating: number; };
  payment?: { pending: number; paid: number; total: number; };
}

// ---------------------------------------------------------------------------
// Admin-panel-specific Types
// ---------------------------------------------------------------------------

export interface CreateProductData {
  nameEn: string;
  nameUr?: string;
  descriptionEn?: string;
  price: number;
  compareAtPrice?: number;
  stockQuantity: number;
  unitType: string;
  unitValue?: number;
  categoryId: string;
  images?: File[];
  isActive?: boolean;
  isFeatured?: boolean;
}

export interface CreateCategoryData {
  nameEn: string;
  nameUr: string;
  icon?: string;
  image?: File;
  isActive?: boolean;
  displayOrder?: number;
}

export interface CreateRiderData {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  cnic: string;
  vehicleType: 'bike' | 'car' | 'van';
  vehicleNumber: string;
  drivingLicenseNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bankAccountTitle?: string;
  bankAccountNumber?: string;
  bankName?: string;
}

export interface RiderDeliveryCharge {
  timeSlotId: string;
  chargePerOrder: number;
}

export interface WhatsAppOrderData {
  whatsappNumber: string;
  customerName: string;
  items: {
    productId: string;
    quantity: number;
  }[];
  addressText: string;
  latitude?: number;
  longitude?: number;
  deliveryCharge?: number;
  adminNotes?: string;
}

export interface OrderFilters {
  status?: OrderStatus;
  startDate?: string;
  endDate?: string;
  riderId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ProductFilters {
  categoryId?: string;
  search?: string;
  isActive?: boolean;
  lowStock?: boolean;
  page?: number;
  limit?: number;
}
