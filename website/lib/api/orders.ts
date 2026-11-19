// Orders, wishlist, cart, my coupons — moved from api.ts (W21: only the place changed, not the behaviour).

import { Order } from '@/types'
import { withCityParams, api } from './shared'

// Orders API
export interface OrdersPage {
  orders: Order[]
  pagination: { page: number; totalPages: number; total: number }
}

export const ordersApi = {
  /** Flat list (first 100) — for pickers; use getPage for the orders screen. */
  getAll: async (): Promise<Order[]> => {
    const response = await api.get('/orders', { params: { limit: 100 } })
    const body = response.data
    return body.data?.orders || body.data || []
  },

  /** Paged list — the backend defaults to 10 per page, so page explicitly. */
  getPage: async (params: { page?: number; limit?: number } = {}): Promise<OrdersPage> => {
    const response = await api.get('/orders', {
      params: { page: params.page ?? 1, limit: params.limit ?? 20 },
    })
    const data = response.data?.data || {}
    const orders: Order[] = Array.isArray(data) ? data : data.orders || []
    const p = data.pagination || {}
    return {
      orders,
      pagination: {
        page: Number(p.page) || params.page || 1,
        totalPages: Number(p.totalPages) || 1,
        total: Number(p.total) || orders.length,
      },
    }
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
/** The wishlist kept with the account (W22) — product ids, newest first. */
type WishlistAnswer = { data?: { product_ids?: string[] } }

const wishlistIds = (r: { data: WishlistAnswer }): string[] => r.data?.data?.product_ids || []

export const wishlistApi = {
  get: async (): Promise<string[]> => wishlistIds(await api.get('/wishlist')),
  add: async (productId: string): Promise<string[]> => wishlistIds(await api.post(`/wishlist/${productId}`)),
  remove: async (productId: string): Promise<string[]> => wishlistIds(await api.delete(`/wishlist/${productId}`)),
  /** At sign-in: join this device's list to the account's. */
  merge: async (productIds: string[]): Promise<string[]> => wishlistIds(await api.post('/wishlist/merge', { product_ids: productIds })),
}

export const cartApi = {
  /**
   * Atomically replace the server cart with the local cart in ONE request.
   * Returns the server cart snapshot (server-priced).
   */
  sync: async (items: Array<{ product_id: string; quantity: number; unit?: string; quality?: string }>) => {
    const response = await api.post('/cart/sync', { ...withCityParams({}), items })
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

  /** The cart saved with the account (raw lines: product_id, quantity, unit, quality, city_id). */
  getSaved: async (): Promise<unknown[]> => {
    const response = await api.get('/cart')
    const items = response.data?.data?.items
    return Array.isArray(items) ? items : []
  },

  /** Empty the cart saved with the account. */
  clear: async () => {
    const response = await api.delete('/cart/clear')
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
