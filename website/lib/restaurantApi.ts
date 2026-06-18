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
async function rupload(path: string, form: FormData): Promise<any> {
  const token = getRestaurantToken()
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  })
  let body: any = {}
  try {
    body = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401) clearRestaurantSession()
    const err: any = new Error(body?.message || 'Upload failed')
    err.status = res.status
    throw err
  }
  return body?.data ?? body
}

export const restaurantShopApi = {
  getMe: (): Promise<any> => rfetch('/restaurant/me'),
  uploadFrontImage: (file: File): Promise<{ front_image_url: string }> => {
    const fd = new FormData()
    fd.append('image', file, file.name || 'front.jpg')
    return rupload('/restaurant/profile/front-image', fd)
  },
  getCategories: (): Promise<any[]> => rfetch('/restaurant/categories'),
  getProducts: (categoryId?: string): Promise<any[]> =>
    rfetch(`/restaurant/products${categoryId ? `?category=${encodeURIComponent(categoryId)}` : ''}`),
  getDelivery: (): Promise<{ base_charge: number; free_delivery_threshold: number; urgent_charge: number; urgent_eta: string; slot_cutoff_percent: number }> =>
    rfetch('/restaurant/delivery'),
  getTimeSlots: (date?: string): Promise<any[]> =>
    rfetch(`/restaurant/time-slots${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  placeOrder: (items: RestaurantOrderItemInput[], extras: RestaurantCheckoutExtras = {}): Promise<any> =>
    rfetch('/restaurant/orders', {
      method: 'POST',
      body: JSON.stringify({ items, ...extras }),
    }),
  getOrders: (): Promise<any[]> => rfetch('/restaurant/orders'),
}
