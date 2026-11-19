// Products, categories, site settings, banners, basket, service area — moved from api.ts (W21: only the place changed, not the behaviour).

import { Product, Category } from '@/types'
import { withCityParams, api, mapBackendProduct, mapBackendCategory, nextProductPage } from './shared'

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

  /**
   * One batch of featured products (home "View More Products"). `meta` carries
   * page / totalPages / total; use nextProductPage(meta) for the next batch.
   */
  getFeaturedPage: async (page: number, limit: number): Promise<{ products: Product[]; meta: Parameters<typeof nextProductPage>[0] }> => {
    const response = await api.get('/products/featured/list', { params: withCityParams({ page, limit }) })
    const body = response.data
    return { products: (body.data || []).map(mapBackendProduct), meta: body.meta }
  },

  /**
   * Products by id as sold in one city right now (restoring a saved cart).
   * One that is no longer sold there is simply not in the answer.
   */
  getByIds: async (ids: string[], cityId: string): Promise<Product[]> => {
    const unique = Array.from(new Set(ids)).slice(0, 100)
    if (unique.length === 0) return []
    const response = await api.get('/products', { params: { ids: unique.join(','), city_id: cityId, limit: 100 } })
    return (response.data?.data || []).map(mapBackendProduct)
  },

  getByCategory: async (categoryId: string, params?: { page?: number; limit?: number; sortBy?: string; sortOrder?: string }): Promise<{ products: Product[]; meta: any }> => {
    const response = await api.get('/products', { params: withCityParams({ category: categoryId, ...params }) })
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
      category.subcategories = raw.subcategories.map(mapBackendCategory)
    }
    return category
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
  // Delivery prices are per city (global default when the city has none).
  getDeliverySettings: async (): Promise<{ base_charge: number; free_delivery_threshold: number; express_charge: number }> => {
    const response = await api.get('/site-settings/delivery', { params: withCityParams() })
    return response.data?.data || response.data
  },

  getTimeSlots: async (date?: string): Promise<{ id: string; slot_name: string; start_time: string; end_time: string; is_free_delivery_slot: boolean; available_slots: number; is_unlimited?: boolean }[]> => {
    const params = withCityParams(date ? { date } : {})
    const response = await api.get('/orders/time-slots', { params })
    return response.data?.data || response.data || []
  },

  // Global feature flags / config (public). Defaults to "off" when never set.
  getPublicConfig: async (): Promise<{
    atta_chakki_enabled: boolean
    fb_pixel_id?: string
    google_tag_id?: string
  }> => {
    const response = await api.get('/site-settings/public-config')
    return response.data?.data || response.data
  },
}

// Marketing API (public): cart snapshots for abandonment tracking / retargeting.
export const marketingApi = {
  snapshotCart: async (payload: {
    deviceId: string
    items: { name: string; quantity: number; price: number; quality?: string }[]
    subtotal: number
    phone?: string
  }): Promise<void> => {
    try {
      await api.post('/marketing/cart-snapshot', payload)
    } catch {
      // Non-blocking: snapshot failures must never affect the shopping flow.
    }
  },
}

// Banner API (public, no auth needed)
export const bannerApi = {
  getSettings: async (): Promise<Record<string, string>> => {
    const response = await api.get('/site-settings/banner', { params: withCityParams() })
    return response.data.data
  },
}

// Today's Basket API (public): active combo packages for the selected city.
export interface BasketItemPublic {
  product_id: string
  name: string
  image: string | null
  quality: string
  quantity: number
  unit: string
}

export interface BasketPublic {
  id: string
  name: string
  description: string | null
  total_price: number
  image_url: string | null
  items: BasketItemPublic[]
}

export const basketApi = {
  getAll: async (): Promise<BasketPublic[]> => {
    const response = await api.get('/site-settings/baskets', { params: withCityParams() })
    const data = response.data?.data || response.data
    return Array.isArray(data) ? data : []
  },
}

// Service area API (public): active delivery polygons + out-of-area popup copy.
export const serviceAreaApi = {
  get: async (): Promise<import('../serviceArea').ServiceAreaData> => {
    const response = await api.get('/site-settings/service-area', { params: withCityParams() })
    const data = response.data?.data || response.data
    return {
      enabled: Boolean(data?.enabled),
      polygons: Array.isArray(data?.polygons) ? data.polygons : [],
      message: data?.message || {
        title: '',
        message_en: '',
        message_ur: '',
        whatsapp: '',
      },
    }
  },
}

