// Restaurant (B2B) storefront API. Calls the same-origin /api proxy with the
// restaurant Bearer token (restaurant session, separate from the customer one).

import { getApiBaseUrl } from '@/lib/apiBase'
import { getRestaurantToken, clearRestaurantSession } from '@/lib/restaurantSession'

async function rfetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getRestaurantToken()
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  let body: any = {}
  try {
    body = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401) clearRestaurantSession()
    const err: any = new Error(body?.message || 'Request failed')
    err.status = res.status
    throw err
  }
  return body?.data ?? body
}

export interface RestaurantOrderItemInput {
  product_id: string
  quantity: number
  unit: string
  quality: string
}

export const restaurantShopApi = {
  getCategories: (): Promise<any[]> => rfetch('/restaurant/categories'),
  getProducts: (categoryId?: string): Promise<any[]> =>
    rfetch(`/restaurant/products${categoryId ? `?category=${encodeURIComponent(categoryId)}` : ''}`),
  getDelivery: (): Promise<{ base_charge: number; free_delivery_threshold: number }> =>
    rfetch('/restaurant/delivery'),
  placeOrder: (items: RestaurantOrderItemInput[], customer_notes?: string): Promise<any> =>
    rfetch('/restaurant/orders', {
      method: 'POST',
      body: JSON.stringify({ items, ...(customer_notes ? { customer_notes } : {}) }),
    }),
  getOrders: (): Promise<any[]> => rfetch('/restaurant/orders'),
}
