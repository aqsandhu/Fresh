// Restaurant (B2B) service for the customer app — a session + API that are fully
// separate from the consumer auth (a restaurant-scoped Bearer token).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@utils/constants';

const TOKEN_KEY = 'restaurant_token';
const INFO_KEY = 'restaurant_info';

export interface RestaurantInfo {
  id: string;
  business_name: string;
  owner_name?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  status?: string;
  front_image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface RestaurantCheckoutExtras {
  customer_notes?: string;
  time_slot_id?: string | null;
  requested_delivery_date?: string;
  urgent_delivery?: boolean;
  address?: string;
  latitude?: number;
  longitude?: number;
  front_image_url?: string | null;
}

export async function setRestaurantSession(token: string, info: RestaurantInfo): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [INFO_KEY, JSON.stringify(info)],
  ]);
}
export async function getRestaurantToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function getRestaurantInfo(): Promise<RestaurantInfo | null> {
  const raw = await AsyncStorage.getItem(INFO_KEY);
  try {
    return raw ? (JSON.parse(raw) as RestaurantInfo) : null;
  } catch {
    return null;
  }
}
export async function clearRestaurantSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, INFO_KEY]);
}

async function rfetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getRestaurantToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  let body: any = {};
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const err: any = new Error(body?.message || 'Request failed');
    err.status = res.status;
    if (res.status === 401) await clearRestaurantSession();
    throw err;
  }
  return body?.data ?? body;
}

export interface RestaurantOrderItemInput {
  product_id: string;
  quantity: number;
  unit: string;
  quality: string;
}

export const restaurantApi = {
  register: (input: {
    business_name: string;
    owner_name?: string;
    phone: string;
    pin: string;
    email?: string;
    address?: string;
    city?: string;
    city_id?: string;
  }) => rfetch('/restaurant/register', { method: 'POST', body: JSON.stringify(input) }),

  login: (phone: string, pin: string): Promise<{ token: string; restaurant: RestaurantInfo }> =>
    rfetch('/restaurant/login', { method: 'POST', body: JSON.stringify({ phone, pin }) }),

  getMe: (): Promise<RestaurantInfo> => rfetch('/restaurant/me'),
  getCategories: (): Promise<any[]> => rfetch('/restaurant/categories'),
  getProducts: (categoryId?: string): Promise<any[]> =>
    rfetch(`/restaurant/products${categoryId ? `?category=${encodeURIComponent(categoryId)}` : ''}`),
  getDelivery: (): Promise<{ base_charge: number; free_delivery_threshold: number; urgent_charge: number; urgent_eta: string; slot_cutoff_percent: number }> =>
    rfetch('/restaurant/delivery'),
  getTimeSlots: (date?: string): Promise<any[]> =>
    rfetch(`/restaurant/time-slots${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  uploadFrontImage: async (uri: string): Promise<{ front_image_url: string }> => {
    const token = await getRestaurantToken();
    const fd = new FormData();
    const name = uri.split('/').pop() || 'front.jpg';
    const ext = (name.split('.').pop() || 'jpg').toLowerCase();
    // RN FormData file shape.
    fd.append('image', { uri, name, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` } as any);
    const res = await fetch(`${API_BASE_URL}/restaurant/profile/front-image`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: fd,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || 'Upload failed');
    return body?.data ?? body;
  },
  placeOrder: (items: RestaurantOrderItemInput[], extras: RestaurantCheckoutExtras = {}): Promise<any> =>
    rfetch('/restaurant/orders', {
      method: 'POST',
      body: JSON.stringify({ items, ...extras }),
    }),
  getOrders: (): Promise<any[]> => rfetch('/restaurant/orders'),
};

// ── Client pricing (mirrors backend resolveQualityUnitPrice) ────────────────
export type Quality = 'A' | 'B' | 'C';
export type Unit = 'full' | 'half_kg' | 'quarter_kg' | 'half_dozen';

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export function qualityBasePrice(p: any, q: Quality): number | null {
  // Restaurant pays restaurant_price_* (falling back to the consumer price for
  // that tier). A tier is offered only when its consumer price exists.
  if (q === 'B') {
    if (n(p?.price_b) == null) return null;
    return n(p?.restaurant_price_b) ?? n(p?.price_b);
  }
  if (q === 'C') {
    if (n(p?.price_c) == null) return null;
    return n(p?.restaurant_price_c) ?? n(p?.price_c);
  }
  return n(p?.restaurant_price_a) ?? n(p?.price) ?? 0;
}
export function availableQualities(p: any): Quality[] {
  const out: Quality[] = ['A'];
  if (qualityBasePrice(p, 'B') != null) out.push('B');
  if (qualityBasePrice(p, 'C') != null) out.push('C');
  return out;
}
/** Shared stock for a quality tier (consumer + restaurant draw from the same bucket). */
export function qualityStock(p: any, q: Quality): number {
  if (q === 'B') return Number(p?.stock_quantity_b ?? 0) || 0;
  if (q === 'C') return Number(p?.stock_quantity_c ?? 0) || 0;
  return Number(p?.stock_quantity ?? 0) || 0;
}
export function availableUnits(p: any): { value: Unit; label: string; short: string }[] {
  const t = String(p?.unit_type || 'kg').toLowerCase();
  const baseShort = t === 'dozen' ? 'dozen' : t === 'kg' || t === 'gram' ? 'kg' : t || 'unit';
  const out: { value: Unit; label: string; short: string }[] = [{ value: 'full', label: `Per ${baseShort}`, short: baseShort }];
  if (t === 'kg' || t === 'gram') {
    if (p?.allow_half_kg !== false) out.push({ value: 'half_kg', label: 'Half kg', short: '½ kg' });
    if (p?.allow_quarter_kg !== false) out.push({ value: 'quarter_kg', label: 'Quarter kg', short: '¼ kg' });
  } else if (t === 'dozen') {
    out.push({ value: 'half_dozen', label: 'Half dozen', short: '½ dozen' });
  }
  return out;
}
export function unitPrice(p: any, q: Quality, u: Unit): number | null {
  const base = qualityBasePrice(p, q);
  if (base == null) return null;
  if (u === 'half_kg') return base * 0.5;
  if (u === 'quarter_kg') return base * 0.25;
  if (u === 'half_dozen') return base * 0.5;
  return base;
}
export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
export const money = (x: number) => `Rs. ${round2(x).toLocaleString('en-PK')}`;
