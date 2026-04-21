// ============================================================================
// @freshbazar/shared-types — Single source of truth for all FreshBazar types
// ============================================================================

// ---------------------------------------------------------------------------
// ENUMERATION TYPES
// ---------------------------------------------------------------------------

/** User roles across the platform */
export type UserRole = 'customer' | 'rider' | 'admin' | 'super_admin';

/** Account lifecycle states */
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'deleted';

/** Rider availability states */
export type RiderStatus = 'available' | 'busy' | 'offline' | 'on_leave';

/** Rider document verification states */
export type RiderVerificationStatus = 'pending' | 'verified' | 'rejected';

/** Product / inventory status */
export type ProductStatus = 'active' | 'inactive' | 'out_of_stock' | 'discontinued';

/** Supported unit types for products */
export type UnitType = 'kg' | 'gram' | 'piece' | 'dozen' | 'liter' | 'ml' | 'pack';

/** Order lifecycle states */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

/** Channel through which an order was placed */
export type OrderSource = 'app' | 'website' | 'whatsapp' | 'manual' | 'phone';

/** Payment lifecycle states */
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'partially_refunded';

/** Supported payment methods */
export type PaymentMethod = 'cash_on_delivery' | 'card' | 'easypaisa' | 'jazzcash' | 'bank_transfer';

/** Delivery speed options */
export type DeliveryType = 'standard' | 'express' | 'scheduled';

/** Delivery charge calculation strategy */
export type DeliveryChargeType = 'free' | 'flat' | 'distance_based' | 'weight_based';

/** Atta Chakki request lifecycle states */
export type AttaRequestStatus =
  | 'pending_pickup'
  | 'picked_up'
  | 'at_mill'
  | 'milling'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

/** Wheat quality grades */
export type WheatQuality = 'desi' | 'imported' | 'mixed';

/** Flour grind coarseness */
export type FlourType = 'fine' | 'medium' | 'coarse';

/** Rider task categories */
export type TaskType = 'pickup' | 'delivery' | 'atta_pickup' | 'atta_delivery';

/** Individual task states */
export type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'failed';

/** Notification event categories */
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
  | 'system'
  | 'order_update'
  | 'rider_arrived'
  | 'atta_update'
  | 'general';

/** Time slot availability states */
export type SlotStatus = 'available' | 'booked' | 'blocked';

// ---------------------------------------------------------------------------
// CORE INTERFACES — USERS
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  phone: string;
  email?: string;
  fullName: string;
  passwordHash?: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl?: string;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  preferredLanguage: string;
  notificationEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Admin {
  id: string;
  userId: string;
  adminLevel: number;
  department?: string;
  employeeId?: string;
  permissions: Record<string, boolean>;
  isActive: boolean;
  lastActiveAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// CORE INTERFACES — RIDERS
// ---------------------------------------------------------------------------

export interface Rider {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  cnic: string;
  cnicFrontImage: string;
  cnicBackImage: string;
  drivingLicenseNumber?: string;
  licenseImage?: string;
  vehicleType: string;
  vehicleNumber: string;
  vehicleImage?: string;
  status: RiderStatus;
  verificationStatus: RiderVerificationStatus;
  currentLocation?: {
    lat: number;
    lng: number;
  };
  locationUpdatedAt?: string;
  assignedZoneId?: string;
  rating: number;
  totalDeliveries: number;
  totalEarnings: number;
  avatarUrl?: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RiderTask {
  id: string;
  riderId: string;
  taskType: TaskType;
  status: TaskStatus;
  orderId?: string;
  attaRequestId?: string;
  pickupLocation?: {
    lat: number;
    lng: number;
  };
  deliveryLocation?: {
    lat: number;
    lng: number;
  };
  pickupAddress?: string;
  deliveryAddress?: string;
  assignedAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  estimatedDuration?: number;
  sequenceNumber: number;
  batchId?: string;
  pickupProofImage?: string;
  deliveryProofImage?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// CORE INTERFACES — PRODUCTS & CATEGORIES
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  nameUr: string;
  nameEn: string;
  slug: string;
  iconUrl?: string;
  imageUrl?: string;
  parentId?: string;
  level: number;
  displayOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  qualifiesForFreeDelivery: boolean;
  minimumOrderForFreeDelivery?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  nameUr: string;
  nameEn: string;
  slug: string;
  sku?: string;
  barcode?: string;
  categoryId: string;
  subcategoryId?: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  unitType: UnitType;
  unitValue: number;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: ProductStatus;
  trackInventory: boolean;
  primaryImage?: string;
  images?: string[];
  descriptionUr?: string;
  descriptionEn?: string;
  shortDescription?: string;
  attributes: Record<string, any>;
  isActive: boolean;
  isFeatured: boolean;
  isNewArrival: boolean;
  viewCount: number;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Nutritional information for product detail views */
export interface NutritionalInfo {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}

// ---------------------------------------------------------------------------
// CORE INTERFACES — ADDRESSES
// ---------------------------------------------------------------------------

export interface Address {
  id: string;
  userId: string;
  addressType: string;
  houseNumber?: string;
  writtenAddress: string;
  landmark?: string;
  location: {
    lat: number;
    lng: number;
  };
  locationAccuracy?: number;
  googlePlaceId?: string;
  doorPictureUrl?: string;
  areaName?: string;
  city: string;
  province?: string;
  postalCode?: string;
  zoneId?: string;
  isDefault: boolean;
  isVerified: boolean;
  deliveryInstructions?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// CORE INTERFACES — CART
// ---------------------------------------------------------------------------

export interface Cart {
  id: string;
  userId: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  deliveryCharge: number;
  totalAmount: number;
  couponCode?: string;
  couponDiscount: number;
  itemCount: number;
  totalWeightKg: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weightKg?: number;
  specialInstructions?: string;
  product?: Product;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// CORE INTERFACES — ORDERS
// ---------------------------------------------------------------------------

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  source: OrderSource;
  addressId: string;
  deliveryAddressSnapshot?: any;
  timeSlotId?: string;
  requestedDeliveryDate?: string;
  subtotal: number;
  discountAmount: number;
  deliveryCharge: number;
  taxAmount: number;
  totalAmount: number;
  deliveryChargeRuleId?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  status: OrderStatus;
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  assignedAt?: string;
  placedAt: string;
  confirmedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  customerNotes?: string;
  adminNotes?: string;
  items?: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productImage?: string;
  productSku?: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  weightKg?: number;
  status?: string;
  specialInstructions?: string;
  unit?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderTimelineEvent {
  status: OrderStatus;
  timestamp: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// CORE INTERFACES — DELIVERY & TIME SLOTS
// ---------------------------------------------------------------------------

export interface TimeSlot {
  id: string;
  slotName: string;
  startTime: string;
  endTime: string;
  maxOrders: number;
  bookedOrders: number;
  status: SlotStatus;
  isFreeDeliverySlot: boolean;
  isExpressSlot: boolean;
  applicableDays?: number[];
  zoneIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryChargeConfig {
  id: string;
  ruleName: string;
  ruleCode: string;
  description?: string;
  conditionType: string;
  applicableCategories?: string[];
  excludedCategories?: string[];
  startTime?: string;
  endTime?: string;
  applicableDays?: number[];
  minimumOrderValue?: number;
  maximumOrderValue?: number;
  chargeType: DeliveryChargeType;
  chargeAmount: number;
  isFreeDeliverySlot: boolean;
  orderBeforeTime?: string;
  deliverySlotId?: string;
  priority: number;
  isActive: boolean;
  validFrom?: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryChargeResult {
  deliveryCharge: number;
  ruleApplied: string;
  ruleName: string;
  explanation: string;
}

export interface DeliverySettings {
  baseCharge: number;
  freeDeliveryThreshold: number;
  expressCharge: number;
}

// ---------------------------------------------------------------------------
// CORE INTERFACES — ATTA CHAKKI
// ---------------------------------------------------------------------------

export interface AttaRequest {
  id: string;
  requestNumber: string;
  userId: string;
  addressId: string;
  wheatQuality: WheatQuality;
  wheatQuantityKg: number;
  wheatDescription?: string;
  flourType: FlourType;
  flourQuantityExpectedKg?: number;
  specialInstructions?: string;
  millId?: string;
  millName?: string;
  status: AttaRequestStatus;
  pickupScheduledAt?: string;
  pickedUpAt?: string;
  pickupProofImage?: string;
  millingStartedAt?: string;
  millingCompletedAt?: string;
  actualFlourQuantityKg?: number;
  deliveryScheduledAt?: string;
  deliveredAt?: string;
  deliveryProofImage?: string;
  pickupRiderId?: string;
  deliveryRiderId?: string;
  serviceCharge: number;
  millingCharge: number;
  deliveryCharge: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// CORE INTERFACES — NOTIFICATIONS
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  userId?: string;
  riderId?: string;
  type: NotificationType;
  title: string;
  message: string;
  orderId?: string;
  attaRequestId?: string;
  actionUrl?: string;
  actionType?: string;
  isRead: boolean;
  readAt?: string;
  sentVia?: string[];
  deliveredAt?: string;
  data?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// CORE INTERFACES — WHATSAPP ORDERS
// ---------------------------------------------------------------------------

export interface WhatsappOrder {
  id: string;
  whatsappNumber: string;
  customerName?: string;
  items: any[];
  subtotal: number;
  deliveryCharge: number;
  totalAmount: number;
  addressText?: string;
  location?: {
    lat: number;
    lng: number;
  };
  status: string;
  convertedToOrderId?: string;
  convertedBy?: string;
  convertedAt?: string;
  enteredBy: string;
  adminNotes?: string;
  customerNotes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// CORE INTERFACES — CALL REQUESTS
// ---------------------------------------------------------------------------

export interface CallRequest {
  id: string;
  riderId: string;
  orderId: string;
  virtualNumber?: string;
  status: string;
  requestedAt: string;
  connectedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// REQUEST / RESPONSE / UTILITY TYPES
// ---------------------------------------------------------------------------

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

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JwtPayload {
  userId: string;
  phone: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// ---------------------------------------------------------------------------
// FILTER / QUERY TYPES
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// DASHBOARD / ANALYTICS TYPES
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SETTINGS TYPES
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// BANNER / MARKETING TYPES
// ---------------------------------------------------------------------------

export interface Banner {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  actionType: 'product' | 'category' | 'url' | 'none';
  actionValue?: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// CUSTOMER TYPES
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AUTH TYPES
// ---------------------------------------------------------------------------

export interface LoginCredentials {
  phone: string;
  password?: string;
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

export interface OtpVerification {
  phone: string;
  otp: string;
}

export interface RegisterData {
  name: string;
  phone: string;
  email?: string;
}

// ---------------------------------------------------------------------------
// UTILITY / HELPER TYPES
// ---------------------------------------------------------------------------

/** Location coordinates */
export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  timestamp?: number;
}

/** Generic sync queue entry for offline-first apps */
export interface QueuedAction {
  id: string;
  type: 'task_action' | 'location_update' | 'status_update' | 'call_request';
  payload: any;
  timestamp: number;
  retryCount: number;
}
