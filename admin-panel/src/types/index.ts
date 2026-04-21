// User & Auth Types
export interface User {
  id: string;
  phone: string;
  fullName: string;
  email: string | null;
  role: 'admin' | 'super_admin';
}

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

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productImage?: string;
  productSku?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weightKg?: number;
  status?: string;
}

export interface DeliveryAddressSnapshot {
  writtenAddress?: string;
  landmark?: string;
  houseNumber?: string;
  areaName?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
}

export interface Order {
  id: string;
  orderNumber: string;
  // Backend returns flat fields from JOIN
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  userId: string;
  addressId?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryCharge: number;
  discountAmount: number;
  taxAmount?: number;
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  paidAmount?: number;
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  customerNotes?: string;
  adminNotes?: string;
  cancellationReason?: string;
  deliveryAddressSnapshot?: DeliveryAddressSnapshot;
  addressLatitude?: number;
  addressLongitude?: number;
  addressDoorPictureUrl?: string;
  slotName?: string;
  startTime?: string;
  endTime?: string;
  requestedDeliveryDate?: string;
  placedAt: string;
  confirmedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  updatedAt: string;
  showCustomerPhone?: boolean;
}

export interface OrderTimelineEvent {
  status: OrderStatus;
  timestamp: string;
  note?: string;
}

// Product Types
export interface Product {
  id: string;
  nameEn: string;
  nameUr?: string;
  descriptionEn?: string;
  descriptionUr?: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  stockQuantity: number;
  unitType: string;
  unitValue: number;
  categoryId: string;
  categoryName?: string;
  primaryImage?: string;
  images?: string[];
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

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

// Category Types
export interface Category {
  id: string;
  nameEn: string;
  nameUr: string;
  slug: string;
  imageUrl?: string;
  icon?: string;
  productCount?: number;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryData {
  nameEn: string;
  nameUr: string;
  icon?: string;
  image?: File;
  isActive?: boolean;
  displayOrder?: number;
}

// Rider Types
export type RiderStatus = 'available' | 'busy' | 'offline' | 'on_leave';

export interface Rider {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  cnic?: string;
  vehicleType: 'bike' | 'car' | 'van';
  vehicleNumber: string;
  status: RiderStatus;
  verificationStatus: string;
  latitude?: number;
  longitude?: number;
  avatarUrl?: string;
  rating: number;
  totalDeliveries: number;
  totalEarnings: number;
  drivingLicenseNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bankAccountTitle?: string;
  bankAccountNumber?: string;
  bankName?: string;
  createdAt: string;
  updatedAt: string;
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

export interface RiderStats {
  rider: { id: string; fullName: string; totalDeliveries: number; totalEarnings: number };
  stats: {
    today: { orders: number; earnings: number };
    thisWeek: { orders: number; earnings: number };
    lastWeek: { orders: number; earnings: number };
    thisMonth: { orders: number; earnings: number };
    lastMonth: { orders: number; earnings: number };
  };
  payment: {
    totalCollected: number;
    totalEarned: number;
    paymentPending: number;
  };
  deliveryCharges: Array<{
    id: string;
    chargePerOrder: number;
    slotName: string;
    startTime: string;
    endTime: string;
    timeSlotId: string;
  }>;
}

export interface RiderDeliveryCharge {
  timeSlotId: string;
  chargePerOrder: number;
}

// Atta Chakki Types
export type AttaRequestStatus = 
  | 'pending_pickup' 
  | 'picked_up' 
  | 'at_mill' 
  | 'milling'
  | 'ready_for_delivery' 
  | 'out_for_delivery' 
  | 'delivered';

export interface AttaRequest {
  id: string;
  requestNumber: string;
  customerName: string;
  customerPhone: string;
  wheatQuality: string;
  wheatQuantityKg: number;
  flourType: string;
  specialInstructions?: string;
  status: AttaRequestStatus;
  totalAmount?: number;
  pickupAddress?: string;
  createdAt: string;
  updatedAt: string;
}

// Address Types
export interface Address {
  id: string;
  userId?: string;
  writtenAddress: string;
  areaName: string;
  city: string;
  province?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  houseNumber?: string;
  landmark?: string;
  doorPicture?: string;
  doorPictureUrl?: string;
  addressType?: string;
  isDefault: boolean;
  hasLocation?: boolean;
  locationAddedBy?: string;
  deliveryInstructions?: string;
  zoneName?: string;
  createdAt: string;
  updatedAt: string;
}

// WhatsApp Order Types
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

// Customer Types
export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: string;
  preferredLanguage: string;
  notificationEnabled: boolean;
  status: string;
  isPhoneVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  totalOrders: number;
  totalSpent: number;
  totalAddresses: number;
}

// Dashboard Types — matches backend getDashboardStats response (after camelCase conversion)
export interface DashboardData {
  today: {
    totalOrders: number;
    totalSales: number;
    pendingOrders: number;
    confirmedOrders: number;
    preparingOrders: number;
    outForDeliveryOrders: number;
    deliveredOrders: number;
  };
  weekly: {
    totalOrders: number;
    totalSales: number;
  };
  monthly: {
    totalOrders: number;
    totalSales: number;
  };
  lowStockProducts: {
    id: string;
    nameEn: string;
    nameUr: string;
    stockQuantity: number;
    lowStockThreshold: number;
  }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    totalAmount: number;
    status: string;
    customerName: string;
    placedAt: string;
  }[];
  riders: {
    totalRiders: number;
    availableRiders: number;
    busyRiders: number;
    pendingVerification: number;
  };
  attaRequests: {
    totalRequests: number;
    pendingPickup: number;
    atMill: number;
  };
}

// Settings Types
export interface DeliverySettings {
  baseCharge: number;
  freeDeliveryThreshold: number;
  expressCharge: number;
}

export interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  maxOrders: number;
  isActive: boolean;
  isFreeDeliverySlot?: boolean;
}

export interface BusinessHours {
  day: string;
  open: string;
  close: string;
  isOpen: boolean;
}

export interface Settings {
  delivery: DeliverySettings;
  timeSlots: TimeSlot[];
  businessHours: BusinessHours[];
}

// Pagination Types
export interface PaginatedResponse<T> {
  orders?: T[];
  requests?: T[];
  riders?: T[];
  products?: T[];
  data?: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}



// Filter Types
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
