// ============================================================================
// Website Types — Self-contained (no monorepo dependencies)
// ============================================================================

// ---------------------------------------------------------------------------
// Core domain types (defined locally for Vercel compatibility)
// ---------------------------------------------------------------------------

export type UserRole = 'customer' | 'admin' | 'super_admin' | 'rider' | 'moderator';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'refunded';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'cod' | 'card' | 'easypaisa' | 'jazzcash' | 'online';
export type UnitType = 'kg' | 'gram' | 'piece' | 'dozen' | 'liter' | 'pack';

export interface User {
  id: string;
  phone: string;
  full_name: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  avatar_url?: string;
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
  user_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  delivery_charge: number;
  total_amount: number;
  created_at: string;
}

// ============================================================================
// Website-specific Types (web only)
// ============================================================================

/** Website-specific product filters */
export interface ProductFilters {
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sortBy?: 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc' | 'popular';
}

/** Website-specific cart state interface (with Zustand actions) */
export interface CartState {
  items: CartItem[];
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
}
