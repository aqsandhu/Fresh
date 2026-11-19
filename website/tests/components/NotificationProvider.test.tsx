// W17 (round 10): live notifications on the website — signed in: the list is
// loaded and the socket listens for order events (each adds a bell item and
// toasts the important ones, then the list is re-read once); an expired token
// on the socket is refreshed and the socket reconnects; signing out clears the
// bell and closes the socket; unmount removes every listener.
import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { useNotificationStore } from '@/store/notificationStore'

jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockAuth = { isAuthenticated: true, hasHydrated: true }
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => mockAuth }))
jest.mock('@/lib/api', () => ({ notificationsApi: { getAll: jest.fn() } }))
const mockHandlers: Record<string, Array<(d: any) => unknown>> = {}
const mockSocket = {
  on: jest.fn((e: string, fn: (d: any) => unknown) => { (mockHandlers[e] ||= []).push(fn) }),
  off: jest.fn((e: string, fn: (d: any) => unknown) => { mockHandlers[e] = (mockHandlers[e] || []).filter((f) => f !== fn) }),
}
jest.mock('@/lib/socket', () => ({
  connectSocket: jest.fn(() => mockSocket),
  disconnectSocket: jest.fn(),
  getSocket: jest.fn(() => mockSocket),
  reconnectSocket: jest.fn(),
  resolveSocketAuthToken: jest.fn(async () => 'tok'),
}))
const mockCookies = { on: false }
jest.mock('@/lib/authConfig', () => ({ usesHttpOnlyCookies: () => mockCookies.on }))
jest.mock('@/lib/tokenRefresh', () => ({ ensureAuthSession: jest.fn(async () => true), refreshWebsiteAccessToken: jest.fn(async () => true) }))

import NotificationProvider from '@/components/providers/NotificationProvider'

/* eslint-disable @typescript-eslint/no-require-imports */
const { notificationsApi } = require('@/lib/api')
const sock = require('@/lib/socket')
const tokens = require('@/lib/tokenRefresh')
const toast = require('react-hot-toast').default

const emit = async (event: string, data: Record<string, unknown>) => {
  await act(async () => { for (const fn of mockHandlers[event] || []) await fn(data) })
}
const mount = async () => {
  const r = render(<NotificationProvider><p>page</p></NotificationProvider>)
  await waitFor(() => expect(mockHandlers['order:created']?.length).toBe(1))
  return r
}

beforeEach(() => {
  for (const k of Object.keys(mockHandlers)) delete mockHandlers[k]
  mockAuth.isAuthenticated = true
  mockCookies.on = false
  useNotificationStore.getState().reset()
  notificationsApi.getAll.mockResolvedValue({ notifications: [{ id: 'n1', type: 'order', title: 'Old', message: 'old one', isRead: false, createdAt: new Date().toISOString() }], unreadCount: 1 })
  tokens.ensureAuthSession.mockResolvedValue(true)
  tokens.refreshWebsiteAccessToken.mockResolvedValue(true)
  sock.resolveSocketAuthToken.mockResolvedValue('tok')
})

describe('NotificationProvider', () => {
  it('signed in: loads the list and connects the socket with the session token', async () => {
    await mount()
    expect(useNotificationStore.getState().notifications.map((n) => n.id)).toEqual(['n1'])
    expect(sock.connectSocket).toHaveBeenCalledWith('tok')
  })

  it('each order event adds a bell item that opens the order; important ones toast; the list is re-read once', async () => {
    jest.useFakeTimers()
    try {
      await mount()
      notificationsApi.getAll.mockClear()
      await emit('order:created', { orderId: 'o1', orderNumber: 'FB-1' })
      await emit('order:status_changed', { orderId: 'o1' })
      await emit('order:rider_assigned', { orderId: 'o1', message: 'Ali is on the way' })
      await emit('order:rider_arrived', { orderId: 'o1' })
      await emit('order:delivered', {})
      const items = useNotificationStore.getState().notifications
      expect(items[0]).toMatchObject({ title: 'Order delivered', actionUrl: '/orders' })
      expect(items.find((n) => n.title === 'Order placed')).toMatchObject({ message: 'Order #FB-1 placed successfully', actionUrl: '/track/o1', orderId: 'o1' })
      expect(items.find((n) => n.title === 'Rider assigned')?.message).toBe('Ali is on the way')
      expect(toast.success).toHaveBeenCalledWith('Order #FB-1 placed successfully')
      expect(toast.success).toHaveBeenCalledWith('Aapka order aapke darwaze par hai!', { duration: 10000 })
      expect(toast.success).toHaveBeenCalledWith('Your order has been delivered')
      await act(async () => { jest.advanceTimersByTime(900) })
      expect(notificationsApi.getAll).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('an expired token on the socket: refreshed and reconnected (bearer); other errors ignored', async () => {
    await mount()
    sock.resolveSocketAuthToken.mockResolvedValue('fresh')
    await emit('connect_error', new Error('xhr poll error') as any)
    expect(sock.reconnectSocket).not.toHaveBeenCalled()
    await emit('connect_error', new Error('jwt expired') as any)
    expect(tokens.refreshWebsiteAccessToken).toHaveBeenCalled()
    expect(sock.reconnectSocket).toHaveBeenCalledWith('fresh')
    sock.reconnectSocket.mockClear()
    tokens.refreshWebsiteAccessToken.mockResolvedValueOnce(false)
    await emit('connect_error', new Error('Token expired') as any)
    expect(sock.reconnectSocket).not.toHaveBeenCalled()
  })

  it('cookie mode: no refresh needed, just a fresh socket token', async () => {
    mockCookies.on = true
    await mount()
    await emit('connect_error', new Error('jwt expired') as any)
    expect(tokens.refreshWebsiteAccessToken).not.toHaveBeenCalled()
    expect(sock.reconnectSocket).toHaveBeenCalled()
  })

  it('no session → no socket; a failed list load keeps what is there', async () => {
    tokens.ensureAuthSession.mockResolvedValue(false)
    notificationsApi.getAll.mockRejectedValue(new Error('down'))
    useNotificationStore.getState().setNotifications([{ id: 'keep', type: 'order', title: 'K', message: 'k', isRead: false, createdAt: new Date().toISOString() }], 1)
    render(<NotificationProvider><p>page</p></NotificationProvider>)
    await waitFor(() => expect(useNotificationStore.getState().isLoading).toBe(false))
    expect(useNotificationStore.getState().notifications.map((n) => n.id)).toEqual(['keep'])
    expect(sock.connectSocket).not.toHaveBeenCalled()
  })

  it('signed out: the bell is cleared and the socket closed; unmount removes the listeners', async () => {
    const { unmount } = await mount()
    unmount()
    expect(mockHandlers['order:created']).toEqual([])
    expect(mockHandlers['connect_error']).toEqual([])
    mockAuth.isAuthenticated = false
    render(<NotificationProvider><p>page</p></NotificationProvider>)
    expect(sock.disconnectSocket).toHaveBeenCalled()
    expect(useNotificationStore.getState().notifications).toEqual([])
  })
})
