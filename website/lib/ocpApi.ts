// OCP operator API — calls /api/ocp/* with the OCP Bearer token.

import { getApiBaseUrl } from '@/lib/apiBase'
import { getOcpToken, clearOcpSession, type OcpInfo } from '@/lib/ocpSession'
import { handlePortalAuthFailure } from '@/lib/portalSession'
import type { OcpOrder, OcpRider, OcpSettlementSummary, OcpStockRequest, OcpStockRow } from '@freshbazar/shared-types'

// Shapes of the OCP answers live in packages/shared-types (F4); re-exported for the pages.
export type { OcpOrder, OcpOrderLine, OcpRider, OcpSettlement, OcpSettlementSummary, OcpStockRequest, OcpStockRow } from '@freshbazar/shared-types'

async function ofetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getOcpToken()
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
    handlePortalAuthFailure(res.status, path, '/ocp/login', clearOcpSession)
    const err = Object.assign(new Error(body?.message || 'Request failed'), { status: res.status })
    throw err
  }
  return (body?.data ?? body) as T
}

export const ocpApi = {
  login: (phone: string, pin: string): Promise<{ token: string; ocp: OcpInfo }> =>
    ofetch('/ocp/login', { method: 'POST', body: JSON.stringify({ phone, pin }) }),
  me: () => ofetch('/ocp/me'),
  getOrders: (): Promise<OcpOrder[]> => ofetch('/ocp/orders'),
  getOrder: (id: string): Promise<OcpOrder> => ofetch(`/ocp/orders/${id}`),
  getRiders: (): Promise<OcpRider[]> => ofetch('/ocp/riders'),
  assignRider: (orderId: string, riderId: string) =>
    ofetch(`/ocp/orders/${orderId}/assign-rider`, { method: 'POST', body: JSON.stringify({ rider_id: riderId }) }),
  // Collection is always the full order total — server-authoritative, no amount param.
  collect: (orderId: string) =>
    ofetch(`/ocp/orders/${orderId}/collect`, { method: 'POST', body: '{}' }),
  getStock: (): Promise<OcpStockRow[]> => ofetch('/ocp/stock'),
  getStockRequests: (): Promise<OcpStockRequest[]> => ofetch('/ocp/stock-requests'),
  receiveStock: (id: string) => ofetch(`/ocp/stock-requests/${id}/receive`, { method: 'POST', body: '{}' }),
  getSettlements: (): Promise<OcpSettlementSummary> => ofetch('/ocp/settlements'),
  sendSettlement: () => ofetch('/ocp/settlements', { method: 'POST', body: '{}' }),
}
