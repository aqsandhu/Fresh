// Restaurant (B2B) session — kept separate from the customer session. The token
// is a restaurant-scoped JWT (type: 'restaurant') used only against
// /api/restaurant/* and the restaurant storefront endpoints.

const TOKEN_KEY = 'restaurant_token'
const INFO_KEY = 'restaurant_info'

export interface RestaurantInfo {
  id: string
  business_name: string
  owner_name?: string | null
  phone: string
  email?: string | null
  address?: string | null
  city?: string | null
  status?: string
}

export function setRestaurantSession(token: string, info: RestaurantInfo): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(INFO_KEY, JSON.stringify(info))
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function getRestaurantToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getRestaurantInfo(): RestaurantInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(INFO_KEY)
    return raw ? (JSON.parse(raw) as RestaurantInfo) : null
  } catch {
    return null
  }
}

export function clearRestaurantSession(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(INFO_KEY)
  } catch {
    /* ignore */
  }
}
