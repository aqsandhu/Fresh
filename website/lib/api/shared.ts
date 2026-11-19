// Shared helpers for the api handlers (moved from api.ts, W21).

import type { ApiCategoryRow, ApiProductRow } from '@freshbazar/shared-types'
import axios from 'axios'
import { Product, Category, type UnitType } from '@/types'
import { getSelectedCityId } from '@/lib/cityStorage'
import { useAuthStore } from '@/store/cartStore'
import { refreshWebsiteAccessToken, hasRefreshableSession } from '@/lib/tokenRefresh'
import { afterFailedRefresh } from '@/lib/sessionExpiry'
import { usesHttpOnlyCookies } from '@/lib/authConfig'
import { clearTokens, getAccessToken } from '@/lib/secureTokens'
import { ABSOLUTE_API_URL, getApiBaseUrl } from '@/lib/apiBase'

export function redirectToLogin() {
  clearTokens()
  useAuthStore.getState().logout()
  if (typeof window === 'undefined') return
  const currentPath = window.location.pathname
  if (currentPath !== '/login' && !currentPath.startsWith('/register')) {
    window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`
  }
}

export function withCityParams<T extends Record<string, unknown>>(params?: T): T & { city_id?: string } {
  const cityId = getSelectedCityId()
  if (!cityId) return (params || {}) as T & { city_id?: string }
  return { ...(params || {}), city_id: cityId } as T & { city_id?: string }
}

// Browser → same-origin '/api' (proxied to the backend by the rewrites);
// server → absolute backend URL. See lib/apiBase.ts for why.
export const API_BASE_URL = getApiBaseUrl()

export const api = axios.create({
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
      // A 401 from an auth endpoint (bad PIN, bad credentials) is an expected
      // failure of the inline login/sign-up flow — don't yank the user away
      // to /login (e.g. mid-checkout). The B2B portals (restaurant / OCP /
      // shareholder) have their own login pages and sessions; a wrong PIN
      // there must never wipe the customer session.
      const url = original.url || ''
      const isAuthEndpoint =
        url.includes('/auth/') ||
        /\/(restaurant|ocp|shareholder)\/(login|register)\b/.test(url)
      if (isRefreshCall) {
        if (typeof window !== 'undefined') {
          const next = afterFailedRefresh({ isAuthEndpoint: false, stillSignedIn: false, pathname: window.location.pathname })
          if (next === 'login') redirectToLogin()
          else {
            clearTokens()
            useAuthStore.getState().logout()
          }
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
        // Server unreachable → session kept; real end on a public page →
        // carry on as a guest; only account pages go to /login (H7).
        const next = afterFailedRefresh({
          isAuthEndpoint,
          stillSignedIn: hasRefreshableSession(),
          pathname: window.location.pathname,
        })
        if (next === 'login') redirectToLogin()
        else if (next === 'guest') {
          clearTokens()
          useAuthStore.getState().logout()
        }
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
export const BACKEND_URL = ABSOLUTE_API_URL.replace(/\/api\/?$/, '')

// Resolve a stored image reference to a full URL the browser can load. Returns
// `undefined` (NOT a fake placeholder path) when there is no image, so cards
// can render their own visual fallback consistently. Previously this returned
// a non-existent /placeholder-product.svg which made some surfaces show a
// broken-image icon and others show their fallback — confusing UX.
export function resolveImageUrl(path: string | null | undefined): string | undefined {
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

export function mapBackendProduct(raw: ApiProductRow): Product {
  const price = parseFloat(String(raw.price)) || 0
  const compareAt = parseFloat(String(raw.compare_at_price || raw.compareAtPrice)) || 0
  const toOptionalPrice = (v: unknown): number | null | undefined => {
    if (v === null || v === undefined || v === '') return null
    const n = parseFloat(String(v))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const stockA = parseFloat(String(raw.stock_quantity ?? raw.stockQuantity)) || 0
  const priceB = toOptionalPrice(raw.price_b ?? raw.priceB)
  const priceC = toOptionalPrice(raw.price_c ?? raw.priceC)
  const stockB = parseFloat(String(raw.stock_quantity_b ?? raw.stockQuantityB)) || 0
  const stockC = parseFloat(String(raw.stock_quantity_c ?? raw.stockQuantityC)) || 0
  const consumerEnabledA = (raw.consumer_enabled_a ?? raw.consumerEnabledA) !== false
  const consumerEnabledB = (raw.consumer_enabled_b ?? raw.consumerEnabledB) !== false
  const consumerEnabledC = (raw.consumer_enabled_c ?? raw.consumerEnabledC) !== false
  const hasStock =
    (consumerEnabledA && stockA > 0) ||
    (consumerEnabledB && priceB != null && stockB > 0) ||
    (consumerEnabledC && priceC != null && stockC > 0)
  return {
    id: raw.id,
    name: raw.name_en || raw.nameEn || '',
    nameUrdu: raw.name_ur || raw.nameUr || '',
    description: raw.description_en || raw.descriptionEn || raw.short_description || '',
    price,
    compareAtPrice: compareAt > price ? compareAt : undefined,
    unit: (raw.unit_type || raw.unitType || 'kg') as UnitType,
    category: raw.category_slug || raw.categorySlug || raw.category_id || raw.categoryId || '',
    image: resolveImageUrl(raw.primary_image || raw.primaryImage || raw.image_url || raw.imageUrl),
    stock: stockA,
    inStock: hasStock,
    isFresh: hasStock && (raw.is_active !== false),
    rating: parseFloat(String(raw.rating_average || raw.ratingAverage)) || undefined,
    reviews: parseInt(String(raw.review_count || raw.reviewCount || raw.order_count || raw.orderCount)) || undefined,
    tags: raw.tags || [],
    categoryId: raw.category_id || raw.categoryId || '',
    halfKgPrice: toOptionalPrice(raw.half_kg_price ?? raw.halfKgPrice),
    quarterKgPrice: toOptionalPrice(raw.quarter_kg_price ?? raw.quarterKgPrice),
    halfDozenPrice: toOptionalPrice(raw.half_dozen_price ?? raw.halfDozenPrice),
    // B/C fraction overrides — the server charges these at checkout, so the
    // cart must show the same numbers (previously derived ×0.5/×0.25 only).
    halfKgPriceB: toOptionalPrice(raw.half_kg_price_b ?? raw.halfKgPriceB),
    quarterKgPriceB: toOptionalPrice(raw.quarter_kg_price_b ?? raw.quarterKgPriceB),
    halfDozenPriceB: toOptionalPrice(raw.half_dozen_price_b ?? raw.halfDozenPriceB),
    halfKgPriceC: toOptionalPrice(raw.half_kg_price_c ?? raw.halfKgPriceC),
    quarterKgPriceC: toOptionalPrice(raw.quarter_kg_price_c ?? raw.quarterKgPriceC),
    halfDozenPriceC: toOptionalPrice(raw.half_dozen_price_c ?? raw.halfDozenPriceC),
    // Quality tiers (B/C optional). Each tier has its own consumer price + stock.
    priceB,
    priceC,
    stockQuantityB: stockB,
    stockQuantityC: stockC,
    // Default true when the field is absent (pre-migration / older payloads).
    allowHalfKg: (raw.allow_half_kg ?? raw.allowHalfKg) !== false,
    allowQuarterKg: (raw.allow_quarter_kg ?? raw.allowQuarterKg) !== false,
    // Free-delivery eligibility comes straight from the category flag (admin
    // checkbox). Only flagged categories count toward the threshold.
    qualifiesForFreeDelivery:
      (raw.qualifies_for_free_delivery ?? raw.qualifiesForFreeDelivery) === true,
    isVariableWeight:
      raw.is_variable_weight === true || raw.isVariableWeight === true,
    variableWeightNote: raw.variable_weight_note ?? raw.variableWeightNote ?? null,
  }
}

export function mapBackendCategory(raw: ApiCategoryRow): Category {
  return {
    id: raw.id,
    name: raw.name_en || raw.nameEn || '',
    nameUrdu: raw.name_ur || raw.nameUr || '',
    slug: raw.slug || '',
    image: resolveImageUrl(raw.image_url || raw.imageUrl || raw.icon_url || raw.iconUrl),
    description: raw.meta_description || raw.description || '',
    productCount: parseInt(String(raw.product_count || raw.productCount)) || 0,
  }
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/** Page size for product listings — below the backend's 100-per-page cap. */
export const PRODUCTS_PAGE_SIZE = 48

/** `getNextPageParam` helper for product listings (backend `meta` → next page or undefined). */
export function nextProductPage(meta: { page?: number | string; totalPages?: number | string; total?: number | string; limit?: number | string } | undefined): number | undefined {
  if (!meta) return undefined
  const page = Number(meta.page) || 1
  const limit = Number(meta.limit) || PRODUCTS_PAGE_SIZE
  const total = Number(meta.total) || 0
  const totalPages = Number(meta.totalPages) || Math.ceil(total / limit)
  return page < totalPages ? page + 1 : undefined
}
