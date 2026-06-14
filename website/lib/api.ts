import axios from 'axios'
import { Product, Category, Order, Address, User, AttaChakkiRequest } from '@/types'
import { getSelectedCityId } from '@/lib/cityStorage'
import { useAuthStore } from '@/store/cartStore'
import { refreshWebsiteAccessToken } from '@/lib/tokenRefresh'
import { usesHttpOnlyCookies } from '@/lib/authConfig'
import { clearTokens, getAccessToken } from '@/lib/secureTokens'
import { ABSOLUTE_API_URL, getApiBaseUrl } from '@/lib/apiBase'

function redirectToLogin() {
  clearTokens()
  useAuthStore.getState().logout()
  if (typeof window === 'undefined') return
  const currentPath = window.location.pathname
  if (currentPath !== '/login' && !currentPath.startsWith('/register')) {
    window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`
  }
}

function withCityParams<T extends Record<string, unknown>>(params?: T): T & { city_id?: string } {
  const cityId = getSelectedCityId()
  if (!cityId) return (params || {}) as T & { city_id?: string }
  return { ...(params || {}), city_id: cityId } as T & { city_id?: string }
}

// Browser → same-origin '/api' (proxied to the backend by the rewrites);
// server → absolute backend URL. See lib/apiBase.ts for why.
const API_BASE_URL = getApiBaseUrl()

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  config.headers = config.headers || {}
  config.headers['X-Client-Platform'] = 'website'

  if (typeof window !== 'undefined' && !usesHttpOnlyCookies()) {
    const token = getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  // Let the browser set multipart boundary — a hard-coded Content-Type breaks
  // multer parsing so door_picture never reaches req.file.
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type']
  }
  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined

    if (error.response?.status === 401 && original && !original._retried) {
      const isRefreshCall = original.url?.includes('/auth/refresh')
      if (isRefreshCall) {
        if (typeof window !== 'undefined') {
          redirectToLogin()
        }
        return Promise.reject(error)
      }

      original._retried = true
      const refreshed = await refreshWebsiteAccessToken()
      if (refreshed) {
        if (!usesHttpOnlyCookies()) {
          const newToken = getAccessToken()
          if (newToken) {
            original.headers = original.headers || {}
            original.headers.Authorization = `Bearer ${newToken}`
          }
        }
        return api.request(original)
      }

      if (typeof window !== 'undefined') {
        redirectToLogin()
      }
    }

    return Promise.reject(error)
  }
)

// ============================================================================
// DATA MAPPING: Backend snake_case → Website types
// ============================================================================

// Image URLs need the real backend host — the '/api' rewrite doesn't cover
// /uploads, so a relative base would 404 on Vercel.
const BACKEND_URL = ABSOLUTE_API_URL.replace('/api', '')

// Resolve a stored image reference to a full URL the browser can load. Returns
// `undefined` (NOT a fake placeholder path) when there is no image, so cards
// can render their own visual fallback consistently. Previously this returned
// a non-existent /placeholder-product.jpg which made some surfaces show a
// broken-image icon and others show their fallback — confusing UX.
function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined

  // Already absolute (http(s) or protocol-relative).
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
    if (path.includes('example.com')) return undefined
    return path
  }

  // Data URL — browsers can load these directly.
  if (path.startsWith('data:')) {
    return path
  }

  // Relative path on the backend (e.g. /uploads/abc.jpg). Prefix with the
  // backend host so it works from any origin (Vercel, mobile, localhost dev).
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${BACKEND_URL}${normalizedPath}`
}

function mapBackendProduct(raw: any): Product {
  const price = parseFloat(raw.price) || 0
  const compareAt = parseFloat(raw.compare_at_price || raw.compareAtPrice) || 0
  const toOptionalPrice = (v: unknown): number | null | undefined => {
    if (v === null || v === undefined || v === '') return null
    const n = parseFloat(String(v))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return {
    id: raw.id,
    name: raw.name_en || raw.nameEn || '',
    nameUrdu: raw.name_ur || raw.nameUr || '',
    description: raw.description_en || raw.descriptionEn || raw.short_description || '',
    price,
    compareAtPrice: compareAt > price ? compareAt : undefined,
    unit: raw.unit_type || raw.unitType || 'kg',
    category: raw.category_slug || raw.categorySlug || raw.category_id || raw.categoryId || '',
    image: resolveImageUrl(raw.primary_image || raw.primaryImage || raw.image_url || raw.imageUrl),
    stock: parseInt(raw.stock_quantity || raw.stockQuantity) || 0,
    isFresh: (raw.stock_quantity > 0 || raw.stockQuantity > 0) && (raw.is_active !== false),
    rating: parseFloat(raw.rating_average || raw.ratingAverage) || undefined,
    reviews: parseInt(raw.review_count || raw.reviewCount || raw.order_count || raw.orderCount) || undefined,
    tags: raw.tags || [],
    categoryId: raw.category_id || raw.categoryId || '',
    halfKgPrice: toOptionalPrice(raw.half_kg_price ?? raw.halfKgPrice),
    quarterKgPrice: toOptionalPrice(raw.quarter_kg_price ?? raw.quarterKgPrice),
    halfDozenPrice: toOptionalPrice(raw.half_dozen_price ?? raw.halfDozenPrice),
    // Default true when the field is absent (pre-migration / older payloads).
    allowHalfKg: (raw.allow_half_kg ?? raw.allowHalfKg) !== false,
    allowQuarterKg: (raw.allow_quarter_kg ?? raw.allowQuarterKg) !== false,
    isVariableWeight:
      raw.is_variable_weight === true || raw.isVariableWeight === true,
    variableWeightNote: raw.variable_weight_note ?? raw.variableWeightNote ?? null,
  }
}

function mapBackendCategory(raw: any): Category {
  return {
    id: raw.id,
    name: raw.name_en || raw.nameEn || '',
    nameUrdu: raw.name_ur || raw.nameUr || '',
    slug: raw.slug || '',
    image: resolveImageUrl(raw.image_url || raw.imageUrl || raw.icon_url || raw.iconUrl),
    description: raw.meta_description || raw.description || '',
    productCount: parseInt(raw.product_count || raw.productCount) || 0,
  }
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

// Products API
export const productsApi = {
  getAll: async (params?: { category?: string; page?: number; limit?: number; search?: string; featured?: string; sortBy?: string; sortOrder?: string; minPrice?: number; maxPrice?: number; inStock?: string }) => {
    const response = await api.get('/products', { params: withCityParams(params) })
    const body = response.data
    const products = (body.data || []).map(mapBackendProduct)
    const meta = body.meta || {}
    return { products, meta }
  },

  getById: async (id: string): Promise<Product> => {
    const response = await api.get(`/products/${id}`, { params: withCityParams() })
    return mapBackendProduct(response.data.data || response.data)
  },

  getBySlug: async (slug: string): Promise<Product> => {
    const response = await api.get(`/products/slug/${slug}`, { params: withCityParams() })
    return mapBackendProduct(response.data.data || response.data)
  },

  search: async (q: string): Promise<Product[]> => {
    const response = await api.get('/products/search', { params: withCityParams({ q }) })
    return (response.data.data || []).map(mapBackendProduct)
  },

  getFeatured: async (limit: number = 10): Promise<Product[]> => {
    const response = await api.get('/products/featured/list', { params: withCityParams({ limit }) })
    return (response.data.data || []).map(mapBackendProduct)
  },

  getByCategory: async (categoryId: string, params?: { page?: number; limit?: number; sortBy?: string; sortOrder?: string }): Promise<{ products: Product[]; meta: any }> => {
    const response = await api.get('/products', { params: { category: categoryId, ...params } })
    const body = response.data
    const products = (body.data || []).map(mapBackendProduct)
    const meta = body.meta || {}
    return { products, meta }
  },
}

// Categories API
export const categoriesApi = {
  getAll: async (): Promise<Category[]> => {
    const response = await api.get('/categories', { params: withCityParams() })
    return (response.data.data || []).map(mapBackendCategory)
  },

  getBySlug: async (slug: string): Promise<Category & { subcategories?: Category[] }> => {
    const response = await api.get(`/categories/${slug}`, { params: withCityParams() })
    const raw = response.data.data || response.data
    const category = mapBackendCategory(raw)
    if (raw.subcategories) {
      ;(category as any).subcategories = raw.subcategories.map(mapBackendCategory)
    }
    return category
  },
}

// Auth API
export const authApi = {
  // Step 1: Check if phone is registered (Firebase sends OTP client-side)
  sendOtp: async (phone: string) => {
    const response = await api.post('/auth/send-otp', { phone })
    return response.data // { success, data: { phone, userExists, userName }, message }
  },

  // Step 2a: Verify Firebase ID token and login (existing user)
  verifyLogin: async (idToken: string) => {
    const response = await api.post('/auth/verify-login', { idToken })
    return response.data // { success, data: { user, tokens }, message }
  },

  // Temporary bypass — phone + fixed OTP code (when NEXT_PUBLIC_OTP_BYPASS=true)
  verifyLoginWithCode: async (phone: string, code: string) => {
    const response = await api.post('/auth/verify-login', { phone, code })
    return response.data
  },

  // Step 2b: Verify Firebase ID token and register (new user)
  verifyRegister: async (data: {
    idToken: string
    full_name: string
    email?: string
  }) => {
    const response = await api.post('/auth/verify-register', data)
    return response.data // { success, data: { user, tokens }, message }
  },

  verifyRegisterWithCode: async (data: {
    phone: string
    code: string
    full_name: string
    email?: string
  }) => {
    const response = await api.post('/auth/verify-register', data)
    return response.data
  },

  // ─── 4-digit PIN flow ──────────────────────────────────────────────────
  // After the one-time OTP at registration, every subsequent login uses a
  // 4-digit PIN. Forgot PIN → reuses send-otp + reset-pin.

  pinStatus: async (phone: string): Promise<{ exists: boolean; hasPin: boolean; fullName?: string }> => {
    const response = await api.get('/auth/pin-status', { params: { phone } })
    return response.data?.data || { exists: false, hasPin: false }
  },

  setPin: async (pin: string) => {
    const response = await api.post('/auth/set-pin', { pin })
    return response.data
  },

  verifyPin: async (phone: string, pin: string) => {
    const response = await api.post('/auth/verify-pin', { phone, pin })
    return response.data // { success, data: { user, tokens }, message }
  },

  // After a Firebase OTP that the user requested via the "forgot PIN" flow.
  resetPin: async (idToken: string, newPin: string) => {
    const response = await api.post('/auth/reset-pin', { idToken, newPin })
    return response.data
  },

  resetPinWithCode: async (phone: string, code: string, newPin: string) => {
    const response = await api.post('/auth/reset-pin', { phone, code, newPin })
    return response.data
  },

  // Get current user profile
  getProfile: async () => {
    const response = await api.get('/auth/me')
    return response.data
  },

  // Short-lived token for the Socket.IO handshake. In cookie mode the websocket
  // connects cross-site to the backend host where the HttpOnly cookie can't be
  // sent, so we mint a handshake token over this same-origin (cookie-authed)
  // call instead. Returns null if the session isn't valid.
  getSocketToken: async (): Promise<string | null> => {
    try {
      const response = await api.get('/auth/socket-token')
      return response.data?.data?.token ?? null
    } catch {
      return null
    }
  },

  // Update user profile
  updateProfile: async (data: { full_name?: string; email?: string; preferred_language?: string; notification_enabled?: boolean }) => {
    const response = await api.put('/auth/profile', data)
    return response.data
  },

  // Change password
  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await api.put('/auth/change-password', { currentPassword, newPassword })
    return response.data
  },

  // Refresh token
  refreshToken: async (refreshToken: string) => {
    const response = await api.post('/auth/refresh', { refreshToken })
    return response.data
  },
}

// Notifications API
export const notificationsApi = {
  getAll: async (): Promise<{ notifications: Array<{
    id: string
    type: string
    title: string
    message: string
    orderId?: string
    isRead: boolean
    createdAt: string
    actionUrl?: string
  }>; unreadCount: number }> => {
    const response = await api.get('/notifications')
    const data = response.data?.data || response.data
    return {
      notifications: data?.notifications || [],
      unreadCount: data?.unreadCount ?? 0,
    }
  },

  markAsRead: async (id: string) => {
    const response = await api.patch(`/notifications/${id}/read`)
    return response.data
  },

  markAllAsRead: async () => {
    const response = await api.patch('/notifications/read-all')
    return response.data
  },
}

// Orders API
export const ordersApi = {
  getAll: async (): Promise<Order[]> => {
    const response = await api.get('/orders')
    const body = response.data
    return body.data?.orders || body.data || []
  },

  getById: async (id: string): Promise<Order> => {
    const response = await api.get(`/orders/${id}`)
    const body = response.data
    return body.data || body
  },

  create: async (data: {
    address_id: string
    time_slot_id?: string
    payment_method: string
    customer_notes?: string
    requested_delivery_date?: string
    city_id?: string
  }) => {
    const response = await api.post('/orders', data)
    return response.data
  },

  track: async (orderId: string) => {
    const response = await api.get(`/orders/track/${orderId}`)
    const body = response.data
    return body.data || body
  },

  cancel: async (orderId: string, reason?: string) => {
    const response = await api.put(`/orders/${orderId}/cancel`, { reason: reason || 'Cancelled by customer' })
    return response.data
  },
}

// Cart API
export const cartApi = {
  /**
   * Atomically replace the server cart with the local cart in ONE request.
   * Returns the server cart snapshot (server-priced).
   */
  sync: async (items: Array<{ product_id: string; quantity: number; unit?: string }>) => {
    const response = await api.post('/cart/sync', { items })
    return response.data?.data || response.data
  },

  /** Apply a coupon to the server cart. Returns the validated preview. */
  applyCoupon: async (
    code: string
  ): Promise<{
    code: string
    description?: string | null
    discount_type: 'percentage' | 'fixed' | 'free_delivery'
    discount_amount: number
    free_delivery: boolean
    summary: string
  }> => {
    const response = await api.post('/cart/apply-coupon', { code })
    return response.data?.data || response.data
  },

  removeCoupon: async () => {
    const response = await api.delete('/cart/remove-coupon')
    return response.data
  },
}

export interface MyCoupon {
  code: string
  description?: string | null
  discount_type: 'percentage' | 'fixed' | 'free_delivery'
  min_order_amount: number
  trigger_type?: 'manual' | 'welcome_back' | 'order_milestone'
  source?: string
  seen: boolean
  summary: string
}

// Customer's auto-granted coupons (welcome-back / milestone). Fetching also
// triggers server-side eligibility evaluation (so new ones get granted).
export const myCouponsApi = {
  list: async (): Promise<{ coupons: MyCoupon[]; unseen: MyCoupon[] }> => {
    const response = await api.get('/coupons/mine', { params: withCityParams() })
    const data = response.data?.data || response.data || {}
    return { coupons: data.coupons || [], unseen: data.unseen || [] }
  },
  markSeen: async () => {
    const response = await api.patch('/coupons/mine/seen')
    return response.data
  },
}

// Chat API
export const chatApi = {
  getMessages: async (orderId: string) => {
    const response = await api.get(`/chat/${orderId}`)
    return response.data
  },
  sendMessage: async (orderId: string, message: string) => {
    const response = await api.post(`/chat/${orderId}`, { message })
    return response.data
  },
}

// ── Reviews & Complaints (Feature 3) ────────────────────────────────────────

export type ReviewTargetType = 'product' | 'rider' | 'service'

export interface Review {
  id: string
  targetType: ReviewTargetType
  productId?: string | null
  riderId?: string | null
  orderId?: string | null
  rating: number
  comment?: string | null
  adminReply?: string | null
  productName?: string | null
  orderNumber?: string | null
  riderName?: string | null
  createdAt?: string
}

export interface OrderReviewables {
  canReview: boolean
  delivered: boolean
  products: { productId: string; productName: string; productImage?: string | null }[]
  rider: { riderId: string; riderName: string } | null
  reviews: Review[]
}

export type ComplaintCategory =
  | 'delivery'
  | 'product_quality'
  | 'rider_behavior'
  | 'payment'
  | 'app_issue'
  | 'other'

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface Complaint {
  id: string
  ticketNumber: string
  orderId?: string | null
  orderNumber?: string | null
  category: ComplaintCategory
  subject: string
  message: string
  status: ComplaintStatus
  priority: 'low' | 'normal' | 'high'
  adminResponse?: string | null
  resolvedAt?: string | null
  createdAt?: string
}

export const reviewsApi = {
  submit: async (input: {
    targetType: ReviewTargetType
    orderId: string
    productId?: string
    rating: number
    comment?: string
  }): Promise<Review> => {
    const response = await api.post('/reviews', input)
    return response.data?.data || response.data
  },
  forOrder: async (orderId: string): Promise<OrderReviewables> => {
    const response = await api.get(`/reviews/order/${orderId}`)
    return response.data?.data || response.data
  },
  mine: async (): Promise<Review[]> => {
    const response = await api.get('/reviews/mine')
    return response.data?.data || []
  },
  forProduct: async (
    productId: string
  ): Promise<{ summary: { average: number; count: number }; reviews: Review[] }> => {
    const response = await api.get(`/reviews/product/${productId}`)
    return response.data?.data || { summary: { average: 0, count: 0 }, reviews: [] }
  },
}

export const complaintsApi = {
  file: async (input: {
    subject: string
    message: string
    category?: ComplaintCategory
    orderId?: string
  }): Promise<Complaint> => {
    const response = await api.post('/complaints', input, { params: withCityParams() })
    return response.data?.data || response.data
  },
  mine: async (): Promise<Complaint[]> => {
    const response = await api.get('/complaints/mine')
    return response.data?.data || []
  },
}

// User guidance tips (admin-managed, per page + city)
export const tipsApi = {
  forPage: async (page: string): Promise<{ id: string; text: string }[]> => {
    const response = await api.get('/tips', { params: withCityParams({ page }) })
    return response.data?.data || []
  },
}

// Settings API (public endpoints)
export const settingsApi = {
  getDeliverySettings: async (): Promise<{ base_charge: number; free_delivery_threshold: number; express_charge: number }> => {
    const response = await api.get('/site-settings/delivery')
    return response.data?.data || response.data
  },

  getTimeSlots: async (date?: string): Promise<{ id: string; slot_name: string; start_time: string; end_time: string; is_free_delivery_slot: boolean; available_slots: number }[]> => {
    const params = date ? { date } : {}
    const response = await api.get('/orders/time-slots', { params })
    return response.data?.data || response.data || []
  },
}

// Addresses API
export const addressesApi = {
  getAll: async (): Promise<Address[]> => {
    const response = await api.get('/addresses')
    const body = response.data
    return body.data || []
  },

  create: async (data: Record<string, any>): Promise<Address> => {
    const response = await api.post('/addresses', data)
    const body = response.data
    return body.data || body
  },

  /** Create address with optional door picture (multipart). */
  createWithDoorPicture: async (
    fields: Record<string, string | number | boolean>,
    doorPicture: File
  ): Promise<Address> => {
    const formData = new FormData()
    Object.entries(fields).forEach(([k, v]) => formData.append(k, String(v)))
    formData.append('door_picture', doorPicture, doorPicture.name || 'door.jpg')
    const response = await api.post('/addresses', formData)
    const body = response.data
    return body.data || body
  },

  /** Update address with optional door picture (multipart). */
  updateWithDoorPicture: async (
    id: string,
    fields: Record<string, string | number | boolean>,
    doorPicture: File
  ): Promise<Address> => {
    const formData = new FormData()
    Object.entries(fields).forEach(([k, v]) => formData.append(k, String(v)))
    formData.append('door_picture', doorPicture, doorPicture.name || 'door.jpg')
    const response = await api.put(`/addresses/${id}`, formData)
    const body = response.data
    return body.data || body
  },

  update: async (id: string, data: Partial<Address>) => {
    const response = await api.put(`/addresses/${id}`, data)
    const body = response.data
    return body.data || body
  },

  delete: async (id: string) => {
    const response = await api.delete(`/addresses/${id}`)
    return response.data
  },
}

// Atta Chakki API
export const attaChakkiApi = {
  getRequests: async (): Promise<AttaChakkiRequest[]> => {
    const response = await api.get('/atta-requests')
    const body = response.data
    return body.data?.requests || body.data || []
  },

  createRequest: async (data: {
    wheat_quantity_kg: number
    address_id: string
    flour_type?: string
    wheat_quality?: string
    special_instructions?: string
  }) => {
    const response = await api.post('/atta-requests', data)
    return response.data
  },

  getRequestById: async (id: string): Promise<AttaChakkiRequest> => {
    const response = await api.get(`/atta-requests/${id}`)
    const body = response.data
    return body.data || body
  },
}

// Banner API (public, no auth needed)
export const bannerApi = {
  getSettings: async (): Promise<Record<string, string>> => {
    const response = await api.get('/site-settings/banner', { params: withCityParams() })
    return response.data.data
  },
}

export default api
