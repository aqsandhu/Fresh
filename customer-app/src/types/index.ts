// User Types
export interface User {
  id: string;
  name?: string;
  full_name?: string;
  phone: string;
  email?: string;
  avatar?: string;
  role?: string;
  is_phone_verified?: boolean;
  createdAt?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Category Types
export interface Category {
  id: string;
  name: string;
  nameUrdu: string;
  icon: string;
  image: string;
  color: string;
  productCount: number;
}

// Product Types
export interface Product {
  id: string;
  name: string;
  nameUrdu: string;
  description: string;
  price: number;
  originalPrice?: number;
  unit: string;
  images: string[];
  categoryId: string;
  categoryName: string;
  inStock: boolean;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  tags: string[];
  nutritionalInfo?: NutritionalInfo;
}

export interface NutritionalInfo {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}

// Cart Types
export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CartState {
  items: CartItem[];
  isLoading: boolean;
}

// Address Types
export interface Address {
  id: string;
  userId: string;
  label: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  doorImage?: string;
  isDefault: boolean;
  createdAt: string;
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
  productImage: string;
  quantity: number;
  price: number;
  unit: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  total: number;
  address: Address;
  deliverySlot: DeliverySlot;
  paymentMethod: 'cash' | 'card' | 'wallet';
  paymentStatus: 'pending' | 'paid' | 'failed';
  rider?: Rider;
  createdAt: string;
  estimatedDelivery: string;
  deliveredAt?: string;
}

export interface Rider {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  vehicleNumber?: string;
  currentLocation?: {
    latitude: number;
    longitude: number;
  };
}

// Delivery Slot Types
export interface DeliverySlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  label: string;
  available: boolean;
  isFreeDelivery?: boolean;
  isExpress?: boolean;
}

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

export interface AttaRequest {
  id: string;
  userId: string;
  wheatWeight: number;
  pickupAddress: Address;
  preferredSlot: DeliverySlot;
  status: AttaRequestStatus;
  pricePerKg: number;
  totalPrice: number;
  notes?: string;
  createdAt: string;
  estimatedCompletion?: string;
  completedAt?: string;
}

// Notification Types
export type NotificationType = 
  | 'order_update' 
  | 'rider_arrived' 
  | 'promotion' 
  | 'atta_update'
  | 'general';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  data?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

// Banner Types
export interface Banner {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  actionType: 'product' | 'category' | 'url' | 'none';
  actionValue?: string;
  isActive: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Navigation Types
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  CartFlow: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  OTP: { phone: string; userExists?: boolean; userName?: string | null };
  Register: { phone: string; code?: string };
};

export type MainTabParamList = {
  Home: undefined;
  Categories: undefined;
  AttaChakki: undefined;
  Orders: undefined;
  Profile: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
  Search: undefined;
  ProductDetail: { productId: string };
  CategoryProducts: { categoryId: string; categoryName: string };
};

export type CategoryStackParamList = {
  CategoriesList: undefined;
  CategoryProducts: { categoryId: string; categoryName: string };
  ProductDetail: { productId: string };
};

export type CartStackParamList = {
  Cart: undefined;
  AddressSelection: undefined;
  AddAddress: undefined;
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
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  MyAddresses: undefined;
  Settings: undefined;
  Notifications: undefined;
  Wishlist: undefined;
};
