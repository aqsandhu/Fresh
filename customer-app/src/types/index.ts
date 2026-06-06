// ============================================================================
// Customer App Types — Re-exports from @freshbazar/shared-types + RN-specific
// ============================================================================

// Re-export ALL shared types (single source of truth)
export * from '@freshbazar/shared-types';

// ============================================================================
// Website-synced client types (storefront / cart — mirrors website/types)
// ============================================================================

export type ProductUnit = 'full' | 'half_kg' | 'quarter_kg' | 'half_dozen';

/** Product shape used across customer app UI (maps from backend like website). */
export interface StoreProduct {
  id: string;
  name: string;
  nameUrdu?: string;
  description?: string;
  price: number;
  originalPrice?: number;
  unit: string;
  images: string[];
  categoryId: string;
  categoryName?: string;
  categorySlug?: string;
  inStock: boolean;
  stock?: number;
  rating?: number;
  reviewCount?: number;
  isFeatured?: boolean;
  tags?: string[];
  /** Legacy single-image field from some API responses */
  imageUrl?: string;
  halfKgPrice?: number | null;
  quarterKgPrice?: number | null;
  halfDozenPrice?: number | null;
  isFresh?: boolean;
}

export interface StoreCartItem {
  product: StoreProduct;
  quantity: number;
  unit?: ProductUnit;
  unitPrice?: number;
}

// ============================================================================
// React Native-specific Types (NOT in shared-types — mobile only)
// ============================================================================

/** Auth state for React Native Zustand store */
export interface AuthState {
  user: import('@freshbazar/shared-types').User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/** Cart state for React Native Zustand store */
export interface CartState {
  items: StoreCartItem[];
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
  SelectCity: undefined;
  Main: undefined;
  Auth: undefined;
  CartFlow: undefined;
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
  Home: undefined;
  Shop: undefined;
  Cart: undefined;
  Orders: undefined;
  Profile: undefined;
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
  AttaChakkiMain: undefined;
  AttaRequest: undefined;
  AttaTracking: { requestId: string };
  SelectCity: undefined;
  ChangePin: undefined;
  Help: undefined;
  About: undefined;
  AddAddress: { addressId?: string; returnTo?: 'checkout' | 'addresses' } | undefined;
  StaticPage: { pageId: 'terms' | 'privacy' | 'faq' | 'contact' | 'returns' | 'shipping' };
};
