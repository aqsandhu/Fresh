// ============================================================================
// Customer App Types — UI-facing shapes (maps from backend in services)
// ============================================================================

import type { NavigatorScreenParams } from '@react-navigation/native';

// Re-export enums / helpers that do not conflict with app UI types
export type {
  UserRole,
  UserStatus,
  NotificationType,
  AttaRequestStatus,
  WheatQuality,
  FlourType,
  SlotStatus,
} from '@freshbazar/shared-types';

export type ProductUnit = 'full' | 'half_kg' | 'quarter_kg' | 'half_dozen';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'out-for-delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus = 'pending' | 'paid' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'card' | 'wallet' | 'cod' | 'easypaisa' | 'jazzcash' | 'online';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface User {
  id: string;
  phone: string;
  fullName?: string;
  full_name?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  avatar?: string;
  role?: string;
  status?: string;
}

export interface Category {
  id: string;
  name: string;
  nameEn?: string;
  nameUr?: string;
  nameUrdu?: string;
  slug?: string;
  image?: string;
  imageUrl?: string;
  icon?: string;
  color?: string;
  productCount?: number;
  isActive?: boolean;
}

export interface Product {
  id: string;
  name: string;
  nameEn?: string;
  nameUr?: string;
  nameUrdu?: string;
  price: number;
  unit: string;
  inStock: boolean;
  images?: string[];
  imageUrl?: string;
  categoryId?: string;
  // Wishlist items may omit categoryId until mapped to StoreProduct
}

export interface StoreProduct {
  id: string;
  name: string;
  nameUrdu?: string;
  description?: string;
  price: number;
  originalPrice?: number;
  unit: string;
  images?: string[];
  categoryId?: string;
  categoryName?: string;
  categorySlug?: string;
  inStock: boolean;
  stock?: number;
  rating?: number;
  reviewCount?: number;
  isFeatured?: boolean;
  tags?: string[];
  imageUrl?: string;
  halfKgPrice?: number | null;
  quarterKgPrice?: number | null;
  halfDozenPrice?: number | null;
  allowHalfKg?: boolean;
  allowQuarterKg?: boolean;
  qualifiesForFreeDelivery?: boolean;
  isFresh?: boolean;
  isVariableWeight?: boolean;
  variableWeightNote?: string | null;
}

export interface StoreCartItem {
  product: StoreProduct;
  quantity: number;
  unit?: ProductUnit;
  unitPrice?: number;
}

export interface Address {
  id: string;
  userId: string;
  label?: string;
  fullAddress?: string;
  writtenAddress?: string;
  houseNumber?: string;
  landmark?: string;
  areaName?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  doorImage?: string;
  doorPictureUrl?: string;
  addressType?: string;
  isDefault: boolean;
  isVerified?: boolean;
  location?: { lat: number; lng: number };
  createdAt: string;
  updatedAt?: string;
}

export interface DeliverySlot {
  id: string;
  date?: string;
  startTime: string;
  endTime: string;
  label?: string;
  available?: boolean;
  slotName?: string;
  maxOrders?: number;
  bookedOrders?: number;
  status?: string;
  isFreeDeliverySlot?: boolean;
  isFreeDelivery?: boolean;
  isExpressSlot?: boolean;
  isExpress?: boolean;
  available_slots?: number;
}

export interface OrderItem {
  id: string;
  productId?: string;
  productName: string;
  productImage?: string;
  quantity: number;
  price: number;
  unitPrice?: number;
  totalPrice?: number;
  unit?: string;
}

export interface Rider {
  id: string;
  name?: string;
  fullName?: string;
  phone?: string;
  currentLocation?: { latitude: number; longitude: number };
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  cityId?: string;
  cityName?: string;
  addressId?: string;
  items?: OrderItem[];
  status: OrderStatus;
  subtotal: number;
  deliveryCharge: number;
  discount?: number;
  couponDiscount?: number;
  couponCode?: string | null;
  total: number;
  totalAmount?: number;
  address?: Address;
  deliverySlot?: DeliverySlot;
  paymentMethod: PaymentMethod | string;
  paymentStatus: PaymentStatus | string;
  rider?: Rider;
  createdAt: string;
  estimatedDelivery?: string;
  deliveredAt?: string;
}

export interface AttaRequest {
  id: string;
  userId: string;
  requestNumber?: string;
  wheatWeight?: number;
  wheatQuantityKg?: number;
  pickupAddress?: Address;
  preferredSlot?: DeliverySlot;
  status: import('@freshbazar/shared-types').AttaRequestStatus | string;
  pricePerKg?: number;
  totalPrice?: number;
  totalAmount?: number;
  notes?: string;
  createdAt: string;
  estimatedCompletion?: string;
  completedAt?: string;
}

export interface Notification {
  id: string;
  userId?: string;
  type: import('@freshbazar/shared-types').NotificationType | string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface Banner {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  actionType: 'product' | 'category' | 'url' | 'none';
  actionValue?: string;
  isActive: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface CartState {
  items: StoreCartItem[];
  isLoading: boolean;
}

// ============================================================================
// React Navigation Param Lists
// ============================================================================

export type RootStackParamList = {
  SelectCity: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  CartFlow: NavigatorScreenParams<CartStackParamList> | undefined;
};

export type AuthStackParamList = {
  Login:
    | {
        redirect?: string;
        phone?: string;
        another?: boolean;
        initialStep?: 'newPin';
        resetCode?: string;
      }
    | undefined;
  OTP: {
    phone: string;
    userExists?: boolean;
    userName?: string | null;
    purpose?: 'login' | 'resetPin';
    redirect?: string;
  };
  Register: {
    phone?: string;
    code?: string;
    autoOtp?: boolean;
    redirect?: string;
  };
  SetPin: { phone?: string; redirect?: string };
};

export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList> | undefined;
  Shop: NavigatorScreenParams<ShopStackParamList> | undefined;
  Cart: NavigatorScreenParams<CartTabStackParamList> | undefined;
  Orders: NavigatorScreenParams<OrdersStackParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
  Search: { query?: string } | undefined;
  ProductDetail: { productId: string };
  CategoryProducts: { categoryId: string; categoryName: string };
};

export type ShopStackParamList = {
  ProductsMain: undefined;
  Search: { query?: string } | undefined;
  ProductDetail: { productId: string };
  CategoryProducts: { categoryId: string; categoryName: string };
  CategoriesList: undefined;
};

/** @deprecated Use ShopStackParamList */
export type CategoryStackParamList = ShopStackParamList;

export type CartTabStackParamList = {
  CartMain: undefined;
};

export type CartStackParamList = {
  Checkout: undefined;
  AddAddress: { addressId?: string; returnTo?: 'checkout' | 'addresses' } | undefined;
  AddressSelection: undefined;
  TimeSlot: undefined;
  Payment: undefined;
  OrderConfirmation: { orderId: string; slotLabel?: string; slotDate?: string };
};

export type AttaStackParamList = {
  AttaChakkiMain: undefined;
  AttaRequest: undefined;
  AttaTracking: { requestId: string };
};

export type OrdersStackParamList = {
  OrdersList: undefined;
  OrderDetail: { orderId: string };
  TrackOrder: { orderId: string };
  NewComplaint: { orderId?: string; orderNumber?: string } | undefined;
  MyComplaints: undefined;
  WriteReview: { orderId: string };
};

// ── Reviews & Complaints (Feature 3) ────────────────────────────────────────

export type ReviewTargetType = 'product' | 'rider' | 'service';

export interface Review {
  id: string;
  targetType: ReviewTargetType;
  productId?: string | null;
  riderId?: string | null;
  orderId?: string | null;
  rating: number;
  comment?: string | null;
  adminReply?: string | null;
  productName?: string | null;
  orderNumber?: string | null;
  riderName?: string | null;
  createdAt?: string;
}

export interface OrderReviewables {
  canReview: boolean;
  delivered: boolean;
  products: { productId: string; productName: string; productImage?: string | null }[];
  rider: { riderId: string; riderName: string } | null;
  reviews: Review[];
}

export type ComplaintCategory =
  | 'delivery'
  | 'product_quality'
  | 'rider_behavior'
  | 'payment'
  | 'app_issue'
  | 'other';

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Complaint {
  id: string;
  ticketNumber: string;
  orderId?: string | null;
  orderNumber?: string | null;
  category: ComplaintCategory;
  subject: string;
  message: string;
  status: ComplaintStatus;
  priority: 'low' | 'normal' | 'high';
  images?: string[];
  adminResponse?: string | null;
  resolvedAt?: string | null;
  createdAt?: string;
}

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  MyAddresses: undefined;
  Settings: undefined;
  Notifications: undefined;
  Wishlist: undefined;
  AttaChakkiMain: undefined;
  AttaRequest: undefined;
  AttaTracking: { requestId: string };
  SelectCity: undefined;
  ChangePin: undefined;
  Help: undefined;
  About: undefined;
  AddAddress: { addressId?: string; returnTo?: 'checkout' | 'addresses' } | undefined;
  StaticPage: { pageId: 'terms' | 'privacy' | 'faq' | 'contact' | 'returns' | 'shipping' };
  Support: undefined;
  MyReviews: undefined;
  MyComplaints: undefined;
  NewComplaint: { orderId?: string; orderNumber?: string } | undefined;
  WorkAsRider: undefined;
  RestaurantLogin: undefined;
  RestaurantRegister: undefined;
  RestaurantShop: undefined;
  RestaurantCart: undefined;
  RestaurantCheckout: undefined;
  RestaurantOrders: undefined;
  RestaurantProfile: undefined;
};
