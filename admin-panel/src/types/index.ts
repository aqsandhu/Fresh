// ============================================================================
// Admin Panel Types — Self-contained (no monorepo dependencies)
// API responses are converted to camelCase in services/api.ts
// ============================================================================

export type UserRole = 'customer' | 'admin' | 'super_admin' | 'rider' | 'moderator';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'refunded';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'cod' | 'card' | 'easypaisa' | 'jazzcash' | 'online' | 'cash_on_delivery';
export type RiderStatus = 'available' | 'busy' | 'offline' | 'on_leave';
export type UnitType = 'kg' | 'gram' | 'piece' | 'dozen' | 'liter' | 'pack';
export type AttaRequestStatus = 'pending_pickup' | 'picked_up' | 'at_mill' | 'milling' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered' | 'cancelled';

export interface User {
  id: string;
  phone: string;
  fullName: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl?: string;
  createdAt?: string;
  permissions?: string[];
  adminRoleId?: string | null;
  adminRoleName?: string | null;
  adminRoleCity?: string | null;
  adminRoleCityId?: string | null;
}

export interface Product {
  id: string;
  nameEn: string;
  nameUr?: string;
  descriptionEn?: string;
  price: number;
  compareAtPrice?: number;
  /** Optional per-unit overrides; null/undefined => derive from price. */
  halfKgPrice?: number | null;
  quarterKgPrice?: number | null;
  halfDozenPrice?: number | null;
  unitType: UnitType | string;
  unitValue?: number;
  stockQuantity: number;
  primaryImage?: string;
  images?: string[];
  categoryId: string;
  categoryName?: string;
  isFeatured: boolean;
  isActive: boolean;
  isVariableWeight?: boolean;
  variableWeightNote?: string | null;
  allowHalfKg?: boolean;
  allowQuarterKg?: boolean;
  tags?: string[];
  // Quality tiers (A = price + stockQuantity). Consumer B/C price + per-quality
  // shared stock; "also for restaurants" flag + restaurant price per tier. The
  // SAME stock bucket is decremented whether a consumer or a restaurant orders it.
  priceB?: number | null;
  priceC?: number | null;
  stockQuantityB?: number;
  stockQuantityC?: number;
  availableForRestaurants?: boolean;
  restaurantPriceA?: number | null;
  restaurantPriceB?: number | null;
  restaurantPriceC?: number | null;
  // Catalog v2 — per-quality channel enable + explicit B/C & restaurant fractions.
  consumerEnabledA?: boolean;
  consumerEnabledB?: boolean;
  consumerEnabledC?: boolean;
  restaurantEnabledA?: boolean;
  restaurantEnabledB?: boolean;
  restaurantEnabledC?: boolean;
  halfKgPriceB?: number | null;
  quarterKgPriceB?: number | null;
  halfDozenPriceB?: number | null;
  halfKgPriceC?: number | null;
  quarterKgPriceC?: number | null;
  halfDozenPriceC?: number | null;
  restaurantHalfKgPriceA?: number | null;
  restaurantQuarterKgPriceA?: number | null;
  restaurantHalfDozenPriceA?: number | null;
  restaurantHalfKgPriceB?: number | null;
  restaurantQuarterKgPriceB?: number | null;
  restaurantHalfDozenPriceB?: number | null;
  restaurantHalfKgPriceC?: number | null;
  restaurantQuarterKgPriceC?: number | null;
  restaurantHalfDozenPriceC?: number | null;
  /** Reservation (soft holds) per quality — Stock Management view. */
  reservedQuantity?: number;
  reservedQuantityB?: number;
  reservedQuantityC?: number;
  /** Set by GET /admin/products/:id — whether the product's category allows restaurants. */
  categoryAvailableForRestaurants?: boolean;
}

export interface Category {
  id: string;
  nameEn: string;
  nameUr: string;
  slug?: string;
  icon?: string;
  iconUrl?: string;
  imageUrl?: string;
  parentId?: string;
  displayOrder?: number;
  isActive: boolean;
  productCount?: number;
  totalProductCount?: number;
  qualifiesForFreeDelivery?: boolean;
  minimumOrderForFreeDelivery?: number;
  /** "Category also for restaurants" — also shown on the restaurant storefront. */
  availableForRestaurants?: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  isUnread?: boolean;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  deliveryCharge: number;
  discountAmount?: number;
  couponDiscount?: number;
  couponCode?: string | null;
  totalAmount: number;
  paidAmount?: number;
  isUrgentDelivery?: boolean;
  urgentDeliveryEta?: string | null;
  source?: string;
  placedAt: string;
  createdAt?: string;
  confirmedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerNotes?: string;
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  showCustomerPhone?: boolean;
  /** OCP assignment (collection point) + per-order phone reveal to that OCP. */
  ocpId?: string | null;
  ocpName?: string | null;
  phoneVisibleToOcp?: boolean;
  addressId?: string;
  slotName?: string;
  startTime?: string;
  endTime?: string;
  requestedDeliveryDate?: string;
  deliveryAddressSnapshot?: {
    houseNumber?: string;
    writtenAddress?: string;
    areaName?: string;
    city?: string;
    province?: string;
    landmark?: string;
    location?: { latitude?: number; longitude?: number; lat?: number; lng?: number };
  };
  addressLatitude?: number;
  addressLongitude?: number;
  addressDoorPictureUrl?: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit?: string;
  isVariableWeight?: boolean;
  finalWeightKg?: number | null;
  productUnitValue?: number;
}

export interface Rider {
  id: string;
  userId: string;
  fullName?: string;
  phone?: string;
  email?: string;
  cnic?: string;
  vehicleType: 'bike' | 'car' | 'van' | string;
  vehicleNumber?: string;
  drivingLicenseNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bankAccountTitle?: string;
  bankAccountNumber?: string;
  bankName?: string;
  avatarUrl?: string;
  status: RiderStatus;
  verificationStatus?: string;
  rating: number;
  totalDeliveries: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
}

export interface PaginatedResponse<T> {
  data?: T[];
  requests?: T[];
  orders?: T[];
  customers?: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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

export interface Address {
  id: string;
  userId: string;
  label?: string;
  addressType?: string;
  houseNumber?: string;
  writtenAddress?: string;
  streetAddress?: string;
  area?: string;
  areaName?: string;
  city: string;
  province?: string;
  landmark?: string;
  deliveryInstructions?: string;
  isDefault: boolean;
  hasLocation?: boolean;
  locationAddedBy?: string;
  zoneName?: string;
  doorPictureUrl?: string;
  latitude?: number;
  longitude?: number;
  createdAt?: string;
}

export interface Customer {
  id: string;
  phone: string;
  fullName: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  totalOrders?: number;
  totalSpent?: number;
  totalAddresses?: number;
  addresses?: Address[];
}

export interface AttaRequest {
  id: string;
  requestNumber: string;
  userId: string;
  customerName?: string;
  customerPhone?: string;
  wheatQuality: string;
  wheatQuantityKg: number;
  flourType: string;
  status: AttaRequestStatus;
  totalAmount: number;
  createdAt: string;
}

export interface DashboardData {
  totalOrders?: number;
  totalRevenue?: number;
  totalCustomers?: number;
  totalProducts?: number;
  today?: {
    totalSales?: number;
    totalOrders?: number;
    pendingOrders?: number;
    deliveredOrders?: number;
  };
  weekly?: {
    totalSales?: number;
    totalOrders?: number;
  };
  monthly?: {
    totalSales?: number;
    totalOrders?: number;
  };
  riders?: {
    totalRiders?: number;
    availableRiders?: number;
    busyRiders?: number;
  };
  recentOrders: Order[];
  topProducts?: Product[];
  lowStockProducts?: Product[];
}

export interface DeliverySettings {
  baseCharge: number;
  freeDeliveryThreshold: number;
  expressCharge: number;
  /** Urgent (on-demand) delivery — super admin only. */
  urgentCharge?: number;
  urgentEta?: string;
  /** % of a today-slot's window allowed to elapse before it locks (default 60). */
  slotCutoffPercent?: number;
}

export interface TimeSlot {
  id: string;
  slotName?: string;
  startTime: string;
  endTime: string;
  maxOrders: number;
  isActive?: boolean;
  isFreeDeliverySlot?: boolean;
}

export interface BusinessHours {
  day: string;
  open: string;
  close: string;
  isOpen?: boolean;
}

export interface Settings {
  businessName?: string;
  contactPhone?: string;
  delivery?: DeliverySettings;
  deliverySettings?: DeliverySettings;
}

export interface RiderPeriodStats {
  orders: number;
  earnings: number;
}

export interface RiderStats {
  rider?: Rider;
  stats: {
    today: RiderPeriodStats;
    thisWeek: RiderPeriodStats;
    lastWeek: RiderPeriodStats;
    thisMonth: RiderPeriodStats;
    lastMonth: RiderPeriodStats;
  };
  payment: {
    totalCollected: number;
    totalEarned: number;
    codEarned?: number;
    totalSettled?: number;
    cashInHand?: number;
    paymentPending: number;
  };
  deliveryCharges?: Array<{
    id: string;
    chargePerOrder: number;
    slotName?: string;
    startTime?: string;
    endTime?: string;
  }>;
}

export interface CreateProductData {
  nameEn: string;
  nameUr?: string;
  descriptionEn?: string;
  price: number;
  compareAtPrice?: number;
  /** Optional admin-set per-unit overrides; leave blank to derive from `price`. */
  halfKgPrice?: number | null;
  quarterKgPrice?: number | null;
  halfDozenPrice?: number | null;
  stockQuantity: number;
  unitType: string;
  unitValue?: number;
  categoryId: string;
  images?: File[];
  isActive?: boolean;
  isFeatured?: boolean;
  isVariableWeight?: boolean;
  variableWeightNote?: string | null;
  allowHalfKg?: boolean;
  allowQuarterKg?: boolean;
  tags?: string[];
  // Quality tiers (A = price + stockQuantity).
  priceB?: number | null;
  priceC?: number | null;
  stockQuantityB?: number | null;
  stockQuantityC?: number | null;
  availableForRestaurants?: boolean;
  restaurantPriceA?: number | null;
  restaurantPriceB?: number | null;
  restaurantPriceC?: number | null;
  // Catalog v2 — per-quality channel enable + explicit B/C & restaurant fractions.
  consumerEnabledA?: boolean;
  consumerEnabledB?: boolean;
  consumerEnabledC?: boolean;
  restaurantEnabledA?: boolean;
  restaurantEnabledB?: boolean;
  restaurantEnabledC?: boolean;
  halfKgPriceB?: number | null;
  quarterKgPriceB?: number | null;
  halfDozenPriceB?: number | null;
  halfKgPriceC?: number | null;
  quarterKgPriceC?: number | null;
  halfDozenPriceC?: number | null;
  restaurantHalfKgPriceA?: number | null;
  restaurantQuarterKgPriceA?: number | null;
  restaurantHalfDozenPriceA?: number | null;
  restaurantHalfKgPriceB?: number | null;
  restaurantQuarterKgPriceB?: number | null;
  restaurantHalfDozenPriceB?: number | null;
  restaurantHalfKgPriceC?: number | null;
  restaurantQuarterKgPriceC?: number | null;
  restaurantHalfDozenPriceC?: number | null;
}

export interface CreateCategoryData {
  nameEn: string;
  nameUr: string;
  icon?: string;
  image?: File;
  isActive?: boolean;
  displayOrder?: number;
  qualifiesForFreeDelivery?: boolean;
  availableForRestaurants?: boolean;
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
  /** Always required — used to find-or-create the customer account. */
  whatsappNumber: string;
  customerName?: string;
  /** Optional: a looked-up registered customer + one of their saved addresses. */
  userId?: string;
  addressId?: string;
  /** Manual delivery details (used when no saved address is selected). */
  addressText?: string;
  latitude?: string | number;
  longitude?: string | number;
  doorPictureUrl?: string;
  items: {
    productId: string;
    quantity: number;
    unit?: string;
    quality?: 'A' | 'B' | 'C';
    /** Complaint replacement: admin-set price (0 = free, or any partial amount). */
    overridePrice?: number;
  }[];
  urgentDelivery?: boolean;
  timeSlotId?: string;
  requestedDeliveryDate?: string;
  adminNotes?: string;
  /** Complaint replacement links (admin-only). */
  replacementForOrderId?: string;
  complaintId?: string;
}

export interface WhatsappCustomerAddress {
  id: string;
  addressType?: string;
  houseNumber?: string | null;
  writtenAddress?: string;
  landmark?: string | null;
  areaName?: string | null;
  city?: string;
  province?: string;
  isDefault?: boolean;
  doorPictureUrl?: string | null;
  deliveryInstructions?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  hasLocation?: boolean;
}

export interface CustomerLookupResult {
  customer: { id: string; fullName: string; phone: string } | null;
  addresses: WhatsappCustomerAddress[];
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
  restaurant?: boolean;
}
