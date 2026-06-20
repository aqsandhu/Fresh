// Shareholder portal API — calls /api/shareholder/* with the shareholder token.

import { getApiBaseUrl } from '@/lib/apiBase'
import { getShareholderToken, clearShareholderSession } from '@/lib/shareholderSession'

async function sfetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getShareholderToken()
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
    /* empty */
  }
  if (!res.ok) {
    if (res.status === 401) clearShareholderSession()
    const err: any = new Error(body?.message || 'Request failed')
    err.status = res.status
    throw err
  }
  return body?.data ?? body
}

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const shareholderApi = {
  login: (email: string, password: string) =>
    sfetch('/shareholder/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => sfetch('/shareholder/me'),
  dashboard: (params: { period?: string; month?: number; year?: number; date?: string } = {}) =>
    sfetch(`/shareholder/dashboard${qs(params)}`),
  receivePayout: (id: string) => sfetch(`/shareholder/payouts/${id}/receive`, { method: 'POST', body: '{}' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    sfetch('/shareholder/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }),
}
