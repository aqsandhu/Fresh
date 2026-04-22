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
export type PaymentMethod = 'cod' | 'card' | 'easypaisa' | 'jazzcash' | 'online';
export type RiderStatus = 'available' | 'busy' | 'offline' | 'on_leave';
export type UnitType = 'kg' | 'gram' | 'piece' | 'dozen' | 'liter' | 'pack';

export interface User {
  id: string;
  phone: string;
  full_name: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  avatar_url?: string;
  created_at: string;
}

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
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  is_active: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  delivery_charge: number;
  total_amount: number;
  created_at: string;
}

export interface Rider {
  id: string;
  user_id: string;
  full_name?: string;
  phone?: string;
  vehicle_type: string;
  status: RiderStatus;
  rating: number;
  total_deliveries: number;
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
