// Shareholder portal API — calls /api/shareholder/* with the shareholder token.

import { getApiBaseUrl } from '@/lib/apiBase'
import { getShareholderToken, clearShareholderSession, type ShareholderInfo } from '@/lib/shareholderSession'
import { handlePortalAuthFailure } from '@/lib/portalSession'

async function sfetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getShareholderToken()
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
    /* empty */
  }
  if (!res.ok) {
    handlePortalAuthFailure(res.status, path, '/shareholder/login', clearShareholderSession)
    const err = Object.assign(new Error(body?.message || 'Request failed'), { status: res.status })
    throw err
  }
  return (body?.data ?? body) as T
}

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const shareholderApi = {
  login: (email: string, password: string): Promise<{ token: string; shareholder: ShareholderInfo }> =>
    sfetch('/shareholder/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => sfetch('/shareholder/me'),
  dashboard: (params: { period?: string; month?: number; year?: number; date?: string } = {}) =>
    sfetch(`/shareholder/dashboard${qs(params)}`),
  receivePayout: (id: string) => sfetch(`/shareholder/payouts/${id}/receive`, { method: 'POST', body: '{}' }),
  changePassword: (currentPassword: string, newPassword: string): Promise<{ token?: string }> =>
    sfetch('/shareholder/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }),
}
