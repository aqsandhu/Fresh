// OCP operator API — calls /api/ocp/* with the OCP Bearer token.

import { getApiBaseUrl } from '@/lib/apiBase'
import { getOcpToken, clearOcpSession } from '@/lib/ocpSession'

async function ofetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getOcpToken()
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
    if (res.status === 401) clearOcpSession()
    const err: any = new Error(body?.message || 'Request failed')
    err.status = res.status
    throw err
  }
  return body?.data ?? body
}

export const ocpApi = {
  login: (phone: string, pin: string) =>
    ofetch('/ocp/login', { method: 'POST', body: JSON.stringify({ phone, pin }) }),
  me: () => ofetch('/ocp/me'),
  getOrders: (): Promise<any[]> => ofetch('/ocp/orders'),
  getOrder: (id: string) => ofetch(`/ocp/orders/${id}`),
  getRiders: (): Promise<any[]> => ofetch('/ocp/riders'),
  assignRider: (orderId: string, riderId: string) =>
    ofetch(`/ocp/orders/${orderId}/assign-rider`, { method: 'POST', body: JSON.stringify({ rider_id: riderId }) }),
  collect: (orderId: string, amount: number) =>
    ofetch(`/ocp/orders/${orderId}/collect`, { method: 'POST', body: JSON.stringify({ amount }) }),
  getStock: (): Promise<any[]> => ofetch('/ocp/stock'),
  getStockRequests: (): Promise<any[]> => ofetch('/ocp/stock-requests'),
  receiveStock: (id: string) => ofetch(`/ocp/stock-requests/${id}/receive`, { method: 'POST', body: '{}' }),
  getSettlements: () => ofetch('/ocp/settlements'),
  sendSettlement: () => ofetch('/ocp/settlements', { method: 'POST', body: '{}' }),
}
