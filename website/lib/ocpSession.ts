// OCP (Order Collection Point) session — separate from customer/restaurant
// sessions. The token is an OCP-scoped JWT (type: 'ocp') used only against
// /api/ocp/*.

const TOKEN_KEY = 'ocp_token'
const INFO_KEY = 'ocp_info'

export interface OcpInfo {
  id: string
  name: string
  owner_name?: string | null
  phone: string
  city?: string | null
  city_id?: string | null
  address?: string | null
  status?: string
}

export function setOcpSession(token: string, info: OcpInfo): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(INFO_KEY, JSON.stringify(info))
  } catch {
    /* ignore */
  }
}

export function getOcpToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getOcpInfo(): OcpInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(INFO_KEY)
    return raw ? (JSON.parse(raw) as OcpInfo) : null
  } catch {
    return null
  }
}

export function clearOcpSession(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(INFO_KEY)
  } catch {
    /* ignore */
  }
}
