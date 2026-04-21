// ============================================================================
// Website Types — Re-exports from @freshbazar/shared-types + web-specific
// ============================================================================

// Re-export ALL shared types (single source of truth)
export * from '@freshbazar/shared-types';

// ============================================================================
// Website-specific Types (NOT in shared-types — web only)
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
  items: import('@freshbazar/shared-types').CartItem[];
  addItem: (product: import('@freshbazar/shared-types').Product, quantity?: number) => void;
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
