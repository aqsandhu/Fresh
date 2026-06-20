// Shareholder portal session — separate from customer/restaurant/OCP sessions.
// The token is a shareholder-scoped JWT (type: 'shareholder') used only against
// /api/shareholder/*.

const TOKEN_KEY = 'shareholder_token'
const INFO_KEY = 'shareholder_info'

export interface ShareholderInfo {
  id: string
  name: string
  email: string
  city?: string | null
  sharePercent?: number
  status?: string
}

export function setShareholderSession(token: string, info: ShareholderInfo): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(INFO_KEY, JSON.stringify(info))
  } catch {
    /* ignore */
  }
}

export function getShareholderToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getShareholderInfo(): ShareholderInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(INFO_KEY)
    return raw ? (JSON.parse(raw) as ShareholderInfo) : null
  } catch {
    return null
  }
}

export function clearShareholderSession(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(INFO_KEY)
  } catch {
    /* ignore */
  }
}
