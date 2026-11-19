// W17 (round 10): the website bell — hidden for guests, unread badge (9+),
// a notification opens its own page (only on-site links; otherwise the order),
// reading one / all is saved (live socket items stay local), Escape and an
// outside click close it.
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useNotificationStore } from '@/store/notificationStore'

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, onClick }: any) => <a href={href} onClick={onClick}>{children}</a> }))
const mockAuth = { isAuthenticated: true, hasHydrated: true }
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => mockAuth }))
jest.mock('@/lib/api', () => ({ notificationsApi: { markAsRead: jest.fn(async () => ({})), markAllAsRead: jest.fn(async () => ({})) } }))

import NotificationBell from '@/components/notifications/NotificationBell'

/* eslint-disable @typescript-eslint/no-require-imports */
const { notificationsApi } = require('@/lib/api')

const n = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: 'order', title: `Title ${id}`, message: `Message ${id}`, isRead: false, createdAt: new Date(Date.now() - 5 * 60000).toISOString(), ...extra,
})

beforeEach(() => {
  mockAuth.isAuthenticated = true
  useNotificationStore.getState().reset()
  useNotificationStore.getState().setNotifications([
    n('n1', { orderId: 'o1', actionUrl: '//evil.example' }),
    n('n2', { actionUrl: '/support' }),
    n('socket-3', { orderId: 'o3' }),
  ], 12)
})

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))

describe('NotificationBell', () => {
  it('hidden for guests', () => {
    mockAuth.isAuthenticated = false
    const { container } = render(<NotificationBell />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows 9+ for many unread; links stay on the site (an outside link opens the order instead)', () => {
    render(<NotificationBell />)
    expect(screen.getByText('9+')).toBeInTheDocument()
    open()
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(expect.arrayContaining(['/track/o1', '/support', '/track/o3']))
    expect(links.some((l) => (l.getAttribute('href') || '').includes('evil'))).toBe(false)
    expect(screen.getAllByText('5m ago').length).toBeGreaterThan(0)
  })

  it('opening one marks it read on the server — a live socket item only locally', async () => {
    render(<NotificationBell />)
    open()
    await act(async () => { fireEvent.click(screen.getAllByText('Title n2')[0]) })
    expect(notificationsApi.markAsRead).toHaveBeenCalledWith('n2')
    open()
    await act(async () => { fireEvent.click(screen.getAllByText('Title socket-3')[0]) })
    expect(notificationsApi.markAsRead).not.toHaveBeenCalledWith('socket-3')
    expect(useNotificationStore.getState().notifications.find((x) => x.id === 'socket-3')?.isRead).toBe(true)
  })

  it('mark all read', async () => {
    render(<NotificationBell />)
    open()
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /Mark all read/ })[0]) })
    expect(notificationsApi.markAllAsRead).toHaveBeenCalled()
    expect(useNotificationStore.getState().unreadCount).toBe(0)
  })

  it('Escape or a click outside closes it; an empty list says so', () => {
    useNotificationStore.getState().setNotifications([], 0)
    render(<NotificationBell />)
    open()
    expect(screen.getAllByText('No notifications yet').length).toBeGreaterThan(0)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('No notifications yet')).toBeNull()
    open()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('No notifications yet')).toBeNull()
  })
})
