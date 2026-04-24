import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { Product, Category, Order, Address, User, AttaChakkiRequest } from '@/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

if (typeof window !== 'undefined' && !process.env.NEXT_PUBLIC_API_URL) {
  console.warn('[Fresh Bazar Website] NEXT_PUBLIC_API_URL is not set. Falling back to localhost:3000. Set this env var in production!')
}

const REQUEST_TIMEOUT = 15000 // 15 seconds
const MAX_RETRIES = 2

// ============================================================================
// API ERROR CLASS
// ============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public data?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function isServerError(error: any): boolean {
  return axios.isAxiosError(error) && (error.response?.status === 500 || error.response?.status === 502 || error.response?.status === 503 || error.response?.status === 504)
}

export function getApiErrorMessage(error: any): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (status === 500 || status === 502 || status === 503 || status === 504) {
      return 'Server temporarily unavailable. Please try again later.'
    }
    if (status === 401) {
      return 'Session expired. Please login again.'
    }
    if (status === 403) {
      return 'You do not have permission to perform this action.'
    }
    if (status === 404) {
      return 'Resource not found.'
    }
    if (status === 422) {
      return error.response?.data?.message || 'Invalid data provided.'
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'Request timed out. Please check your internet connection.'
    }
    if (!error.response) {
      return 'Network error. Please check your internet connection.'
    }
    return error.response?.data?.message || error.message || 'Something went wrong'
  }
  return error?.message || 'Something went wrong'
}

// ============================================================================
// AXIOS INSTANCE
// ============================================================================

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest?._retry) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token')
        const currentPath = window.location.pathname
        window.location.href = currentPath && currentPath !== '/login' ? `/login?redirect=${currentPath}` : '/login'
      }
    }

    return Promise.reject(error)
  }
)

// ============================================================================
// RETRY WRAPPER
// ============================================================================

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (axios.isAxiosError(error) && retries > 0 && (error.response?.status === 500 || error.response?.status === 502 || error.response?.status === 503 || error.code === 'ECONNABORTED')) {
      // Exponential backoff: wait 1s, then 2s
      const delay = (MAX_RETRIES - retries + 1) * 1000
      await new Promise((resolve) => setTimeout(resolve, delay))
      return withRetry(fn, retries - 1)
    }
    throw error
  }
}

// ============================================================================
// DATA MAPPING: Backend snake_case → Website types
// ============================================================================

const PLACEHOLDER_IMAGE = '/placeholder-product.jpg'
const BACKEND_URL = API_BASE_URL.replace('/api', '')

function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return PLACEHOLDER_IMAGE

  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
    if (path.includes('example.com')) return PLACEHOLDER_IMAGE
    return path
  }

  if (path.startsWith('data:')) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${BACKEND_URL}${normalizedPath}`
}

function mapBackendProduct(raw: any): Product {
  const price = parseFloat(raw.price) || 0
  const compareAt = parseFloat(raw.compare_at_price || raw.compareAtPrice) || 0
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
    return withRetry(async () => {
      const response = await api.get('/products', { params })
      const body = response.data
      const products = (body.data || []).map(mapBackendProduct)
      const meta = body.meta || {}
      return { products, meta }
    })
  },

  getById: async (id: string): Promise<Product> => {
    return withRetry(async () => {
      const response = await api.get(`/products/${id}`)
      const raw = response.data.data || response.data
      if (!raw || !raw.id) {
        throw new ApiError('Product not found', 404)
      }
      return mapBackendProduct(raw)
    })
  },

  getBySlug: async (slug: string): Promise<Product> => {
    return withRetry(async () => {
      const response = await api.get(`/products/slug/${slug}`)
      const raw = response.data.data || response.data
      if (!raw || !raw.id) {
        throw new ApiError('Product not found', 404)
      }
      return mapBackendProduct(raw)
    })
  },

  search: async (q: string): Promise<Product[]> => {
    return withRetry(async () => {
      const response = await api.get('/products/search', { params: { q } })
      return (response.data.data || []).map(mapBackendProduct)
    })
  },

  getFeatured: async (limit: number = 10): Promise<Product[]> => {
    return withRetry(async () => {
      const response = await api.get('/products/featured/list', { params: { limit } })
      return (response.data.data || []).map(mapBackendProduct)
    })
  },

  getByCategory: async (categoryId: string, params?: { page?: number; limit?: number; sortBy?: string; sortOrder?: string }): Promise<{ products: Product[]; meta: any }> => {
    return withRetry(async () => {
      const response = await api.get('/products', { params: { category: categoryId, ...params } })
      const body = response.data
      const products = (body.data || []).map(mapBackendProduct)
      const meta = body.meta || {}
      return { products, meta }
    })
  },
}

// Categories API
export const categoriesApi = {
  getAll: async (): Promise<Category[]> => {
    return withRetry(async () => {
      const response = await api.get('/categories')
      return (response.data.data || []).map(mapBackendCategory)
    })
  },

  getBySlug: async (slug: string): Promise<Category & { subcategories?: Category[] }> => {
    return withRetry(async () => {
      const response = await api.get(`/categories/${slug}`)
      const raw = response.data.data || response.data
      const category = mapBackendCategory(raw)
      if (raw.subcategories) {
        ;(category as any).subcategories = raw.subcategories.map(mapBackendCategory)
      }
      return category
    })
  },
}

// Auth API
export const authApi = {
  sendOtp: async (phone: string, channel: 'sms' | 'whatsapp' | 'call' = 'sms') => {
    return withRetry(async () => {
      const response = await api.post('/auth/send-otp', { phone, channel })
      return response.data
    })
  },

  verifyLogin: async (phone: string, code: string) => {
    return withRetry(async () => {
      const response = await api.post('/auth/verify-login', { phone, code })
      return response.data
    })
  },

  verifyRegister: async (data: {
    phone: string
    code: string
    full_name: string
    email?: string
    password: string
  }) => {
    return withRetry(async () => {
      const response = await api.post('/auth/verify-register', data)
      return response.data
    })
  },

  getProfile: async () => {
    return withRetry(async () => {
      const response = await api.get('/auth/me')
      return response.data
    })
  },

  updateProfile: async (data: { full_name?: string; email?: string; preferred_language?: string; notification_enabled?: boolean }) => {
    return withRetry(async () => {
      const response = await api.put('/auth/profile', data)
      return response.data
    })
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    return withRetry(async () => {
      const response = await api.put('/auth/change-password', { currentPassword, newPassword })
      return response.data
    })
  },

  refreshToken: async (refreshToken: string) => {
    return withRetry(async () => {
      const response = await api.post('/auth/refresh', { refreshToken })
      return response.data
    })
  },
}

// Orders API
export const ordersApi = {
  getAll: async (): Promise<Order[]> => {
    return withRetry(async () => {
      const response = await api.get('/orders')
      const body = response.data
      return body.data?.orders || body.data || []
    })
  },

  getById: async (id: string): Promise<Order> => {
    return withRetry(async () => {
      const response = await api.get(`/orders/${id}`)
      const body = response.data
      return body.data || body
    })
  },

  create: async (data: {
    address_id: string
    time_slot_id?: string
    payment_method: string
    customer_notes?: string
    requested_delivery_date?: string
  }) => {
    return withRetry(async () => {
      const response = await api.post('/orders', data)
      return response.data
    })
  },

  track: async (orderId: string) => {
    return withRetry(async () => {
      const response = await api.get(`/orders/track/${orderId}`)
      const body = response.data
      return body.data || body
    })
  },

  reorder: async (orderId: string) => {
    return withRetry(async () => {
      const response = await api.post(`/orders/${orderId}/reorder`)
      return response.data
    })
  },

  cancel: async (orderId: string, reason?: string) => {
    return withRetry(async () => {
      const response = await api.put(`/orders/${orderId}/cancel`, { cancellation_reason: reason || 'Cancelled by customer' })
      return response.data
    })
  },
}

// Chat API
export const chatApi = {
  getMessages: async (orderId: string) => {
    return withRetry(async () => {
      const response = await api.get(`/chat/${orderId}`)
      return response.data
    })
  },
  sendMessage: async (orderId: string, message: string) => {
    return withRetry(async () => {
      const response = await api.post(`/chat/${orderId}`, { message })
      return response.data
    })
  },
}

// Settings API (public endpoints)
export const settingsApi = {
  getDeliverySettings: async (): Promise<{ base_charge: number; free_delivery_threshold: number; express_charge: number }> => {
    return withRetry(async () => {
      const response = await api.get('/site-settings/delivery')
      return response.data?.data || response.data
    })
  },

  getTimeSlots: async (date?: string): Promise<{ id: string; slot_name: string; start_time: string; end_time: string; is_free_delivery_slot: boolean; available_slots: number }[]> => {
    const params = date ? { date } : {}
    return withRetry(async () => {
      const response = await api.get('/orders/time-slots', { params })
      return response.data?.data || response.data || []
    })
  },
}

// Addresses API
export const addressesApi = {
  getAll: async (): Promise<Address[]> => {
    return withRetry(async () => {
      const response = await api.get('/addresses')
      const body = response.data
      return body.data || []
    })
  },

  create: async (data: Record<string, any>): Promise<Address> => {
    return withRetry(async () => {
      const response = await api.post('/addresses', data)
      const body = response.data
      return body.data || body
    })
  },

  update: async (id: string, data: Partial<Address>) => {
    return withRetry(async () => {
      const response = await api.put(`/addresses/${id}`, data)
      const body = response.data
      return body.data || body
    })
  },

  delete: async (id: string) => {
    return withRetry(async () => {
      const response = await api.delete(`/addresses/${id}`)
      return response.data
    })
  },
}

// Atta Chakki API
export const attaChakkiApi = {
  getRequests: async (): Promise<AttaChakkiRequest[]> => {
    return withRetry(async () => {
      const response = await api.get('/atta-requests')
      const body = response.data
      return body.data?.requests || body.data || []
    })
  },

  createRequest: async (data: {
    wheat_quantity_kg: number
    address_id: string
    flour_type?: string
    wheat_quality?: string
    special_instructions?: string
  }) => {
    return withRetry(async () => {
      const response = await api.post('/atta-requests', data)
      return response.data
    })
  },

  getRequestById: async (id: string): Promise<AttaChakkiRequest> => {
    return withRetry(async () => {
      const response = await api.get(`/atta-requests/${id}`)
      const body = response.data
      return body.data || body
    })
  },
}

// Upload API
export const uploadApi = {
  uploadImage: async (file: File): Promise<string> => {
    return withRetry(async () => {
      const formData = new FormData()
      formData.append('image', file)
      const response = await api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data.url
    })
  },
}

// Banner API (public, no auth needed)
export const bannerApi = {
  getSettings: async (): Promise<Record<string, string>> => {
    return withRetry(async () => {
      const response = await api.get('/site-settings/banner')
      return response.data.data
    })
  },
}

// Cart API (backend sync)
export const cartApi = {
  clear: async () => {
    return withRetry(async () => {
      const response = await api.delete('/cart/clear')
      return response.data
    })
  },

  addItem: async (productId: string, quantity: number) => {
    return withRetry(async () => {
      const response = await api.post('/cart/add', { product_id: productId, quantity })
      return response.data
    })
  },

  sync: async (items: { product_id: string; quantity: number }[]) => {
    return withRetry(async () => {
      await api.delete('/cart/clear')
      for (const item of items) {
        await api.post('/cart/add', item)
      }
      return true
    })
  },
}

export default api
