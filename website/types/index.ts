// Product Types
export interface Product {
  id: string
  name: string
  nameUrdu?: string
  description: string
  price: number
  compareAtPrice?: number
  unit: string
  category: string
  image: string
  stock: number
  isFresh: boolean
  rating?: number
  reviews?: number
  tags?: string[]
  categoryId?: string
}

export interface Category {
  id: string
  name: string
  nameUrdu: string
  slug: string
  image: string
  description: string
  productCount: number
}

// Cart Types
export interface CartItem {
  product: Product
  quantity: number
}

export interface CartState {
  items: CartItem[]
  addItem: (product: Product, quantity?: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  getTotalItems: () => number
  getTotalPrice: () => number
  getSubtotal: () => number
  getDeliveryCharge: () => number
  getFinalTotal: () => number
  hasOnlyChicken: () => boolean
}

// User Types
export interface User {
  id: string
  name: string
  phone: string
  email?: string
  avatar?: string
}

export interface Address {
  id: string
  address_type?: string
  label?: string
  house_number?: string
  written_address?: string
  fullAddress?: string
  landmark?: string
  latitude?: number
  longitude?: number
  area_name?: string
  city?: string
  door_picture_url?: string
  doorImage?: string
  is_default?: boolean
  isDefault?: boolean
}

// Order Types — these are website UI values (mapStatus collapses backend statuses into these)
export type OrderStatus = 'received' | 'preparing' | 'out-for-delivery' | 'delivered' | 'cancelled' | 'refunded'

export interface OrderItem {
  product: Product
  quantity: number
  price: number
}

export interface Order {
  id: string
  userId: string
  items: OrderItem[]
  status: OrderStatus
  subtotal: number
  deliveryCharge: number
  total: number
  address: Address
  timeSlot: string
  paymentMethod: 'cod'
  createdAt: string
  estimatedDelivery?: string
  rider?: {
    name: string
    phone: string
    latitude?: number
    longitude?: number
  }
}

// Atta Chakki Types
export interface AttaChakkiRequest {
  id: string
  request_number?: string
  user_id?: string
  wheat_quantity_kg?: number
  wheat_quality?: string
  flour_type?: string
  status: 'pending_pickup' | 'picked_up' | 'at_mill' | 'milling' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered'
  service_charge?: number
  milling_charge?: number
  delivery_charge?: number
  total_amount?: number
  created_at?: string
}

// Auth Types
export interface LoginCredentials {
  phone: string
}

export interface OTPVerification {
  phone: string
  otp: string
}

export interface RegisterData {
  name: string
  phone: string
  email?: string
}

// Filter Types
export interface ProductFilters {
  minPrice?: number
  maxPrice?: number
  inStockOnly?: boolean
  sortBy?: 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc' | 'popular'
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
