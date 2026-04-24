// ============================================================================
// Customer App Types — Re-exports from @freshbazar/shared-types + RN-specific
// ============================================================================

// Re-export ALL shared types (single source of truth)
export * from '@freshbazar/shared-types';

// ============================================================================
// React Native-specific Types (NOT in shared-types — mobile only)
// ============================================================================

/** Auth state for React Native Zustand store */
export interface AuthState {
  user: import('@freshbazar/shared-types').User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/** Cart state for React Native Zustand store */
export interface CartState {
  items: import('@freshbazar/shared-types').CartItem[];
  isLoading: boolean;
}

/** Banner shown in the customer home screen */
export interface Banner {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  actionType: 'product' | 'category' | 'url' | 'none';
  actionValue?: string;
  isActive: boolean;
}

/** Delivery slot alias used by the customer app */
export type DeliverySlot = import('@freshbazar/shared-types').TimeSlot;

// ============================================================================
// React Navigation Param Lists (RN-specific)
// ============================================================================

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
