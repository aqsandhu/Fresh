// Restaurant (B2B) storefront API. Calls the same-origin /api proxy with the
// restaurant Bearer token (restaurant session, separate from the customer one).

import { getApiBaseUrl } from '@/lib/apiBase'
import { getRestaurantToken, clearRestaurantSession } from '@/lib/restaurantSession'
import { handlePortalAuthFailure } from '@/lib/portalSession'
import type { RestaurantProduct } from '@/lib/restaurantPricing'
import type { RestaurantCategory, RestaurantOrder, RestaurantSlot } from '@freshbazar/shared-types'

// Shapes shared with the app (packages/shared-types — F4); re-exported for the pages.
export type { RestaurantCategory, RestaurantOrder, RestaurantOrderLine, RestaurantSlot } from '@freshbazar/shared-types'

async function rfetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getRestaurantToken()
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  let body: { message?: string; data?: unknown } = {}
  try {
    body = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    handlePortalAuthFailure(res.status, path, '/restaurant/login', clearRestaurantSession)
    const err = Object.assign(new Error(body?.message || 'Request failed'), { status: res.status })
    throw err
  }
  return (body?.data ?? body) as T
}

export interface RestaurantOrderItemInput {
  product_id: string
  quantity: number
  unit: string
  quality: string
}

export interface RestaurantCheckoutExtras {
  customer_notes?: string
  time_slot_id?: string | null
  requested_delivery_date?: string
  urgent_delivery?: boolean
  address?: string
  latitude?: number | string
  longitude?: number | string
  front_image_url?: string | null
}

/** Multipart upload (browser sets the multipart boundary — don't set Content-Type). */
async function rupload<T = unknown>(path: string, form: FormData): Promise<T> {
  const token = getRestaurantToken()
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  })
  let body: { message?: string; data?: unknown } = {}
  try {
    body = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    handlePortalAuthFailure(res.status, path, '/restaurant/login', clearRestaurantSession)
    const err = Object.assign(new Error(body?.message || 'Upload failed'), { status: res.status })
    throw err
  }
  return (body?.data ?? body) as T
}

export const restaurantShopApi = {
  getMe: (): Promise<any> => rfetch('/restaurant/me'),
  uploadFrontImage: (file: File): Promise<{ front_image_url: string }> => {
    const fd = new FormData()
    fd.append('image', file, file.name || 'front.jpg')
    return rupload('/restaurant/profile/front-image', fd)
  },
  getCategories: (): Promise<RestaurantCategory[]> => rfetch('/restaurant/categories'),
  getProducts: (categoryId?: string): Promise<RestaurantProduct[]> =>
    rfetch(`/restaurant/products${categoryId ? `?category=${encodeURIComponent(categoryId)}` : ''}`),
  getDelivery: (): Promise<{ base_charge: number; free_delivery_threshold: number; urgent_charge: number; urgent_eta: string; slot_cutoff_percent: number }> =>
    rfetch('/restaurant/delivery'),
  getTimeSlots: (date?: string): Promise<RestaurantSlot[]> =>
    rfetch(`/restaurant/time-slots${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  placeOrder: (items: RestaurantOrderItemInput[], extras: RestaurantCheckoutExtras = {}): Promise<RestaurantOrder> =>
    rfetch('/restaurant/orders', {
      method: 'POST',
      body: JSON.stringify({ items, ...extras }),
    }),
  getOrders: (): Promise<RestaurantOrder[]> => rfetch('/restaurant/orders'),
}
