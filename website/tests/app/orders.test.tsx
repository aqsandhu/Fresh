// W17 (round 10): My Orders — tabs (refunded is finished, I12), paging,
// reorder (current price, skips sold-out), a failed load says so, and I17:
// "Cancel Order" only when the server would accept it (pending any time,
// otherwise within 30 minutes; never once on the road).
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { canCustomerCancel, CANCELLATION_WINDOW_MINUTES } from '@/lib/orderCancel'

const mockPush = jest.fn()
const mockRouter = { push: mockPush } // stable, like the real router
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('next/image', () => ({ __esModule: true, default: ({ alt }: any) => <span>{alt}</span> }))
jest.mock('framer-motion', () => ({ motion: { div: ({ children, className }: any) => <div className={className}>{children}</div> } }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
jest.mock('@/components/feedback/OrderFeedback', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/ui/EmptyState', () => ({ __esModule: true, default: () => <p>no orders yet</p> }))
const mockAuth = { isAuthenticated: true, hasHydrated: true }
const mockAddItem = jest.fn()
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => mockAuth, useCartStore: () => ({ addItem: mockAddItem }) }))
jest.mock('@/lib/api', () => ({ ordersApi: { getPage: jest.fn(), cancel: jest.fn() }, productsApi: { getById: jest.fn() } }))

import OrdersPage from '@/app/(shop)/orders/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const { ordersApi, productsApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString()
const order = (id: string, status: string, placedMinsAgo = 5, extra: Record<string, unknown> = {}) => ({
  id, order_number: `ORD-${id}`, status, total_amount: '500', placed_at: minsAgo(placedMinsAgo),
  items: [{ product_id: 'p1', product_name: 'Aloo', quantity: 2, unit_price: '100', unit: 'half_kg', quality: 'B' }], ...extra,
})

beforeEach(() => {
  mockAuth.isAuthenticated = true
  ordersApi.getPage.mockResolvedValue({
    orders: [
      order('1', 'pending', 120), order('2', 'confirmed', 10), order('3', 'preparing', 90),
      order('4', 'out_for_delivery'), order('5', 'delivered'), order('6', 'refunded'),
    ],
    pagination: { page: 1, totalPages: 2, total: 26 },
  })
  ordersApi.cancel.mockResolvedValue({})
  productsApi.getById.mockResolvedValue({ id: 'p1', name: 'Aloo', price: 110, inStock: true })
  jest.spyOn(window, 'confirm').mockReturnValue(true)
})

const card = (n: string) => screen.getByText(`ORD-${n}`).closest('div.bg-white') as HTMLElement
const cancelIn = (n: string) => card(n).querySelector('button') && Array.from(card(n).querySelectorAll('button')).find((b) => /Cancel Order/.test(b.textContent || ''))

describe('the cancel rule (same as the server)', () => {
  const now = Date.parse('2026-11-19T12:00:00Z')
  it.each([
    ['pending', 600, true],
    ['confirmed', 10, true],
    ['confirmed', CANCELLATION_WINDOW_MINUTES + 1, false],
    ['preparing', 29, true],
    ['ready_for_pickup', 45, false],
    ['out_for_delivery', 1, false],
    ['delivered', 1, false],
    ['refunded', 1, false],
  ])('%s placed %d min ago → %s', (status, mins, allowed) => {
    expect(canCustomerCancel(status, new Date(now - mins * 60000).toISOString(), now)).toBe(allowed)
  })
  it('no status or no time → not offered', () => {
    expect(canCustomerCancel(undefined, minsAgo(1))).toBe(false)
    expect(canCustomerCancel('confirmed', null)).toBe(false)
  })
})

describe('My Orders', () => {
  it('Cancel is offered only where the server allows it (I17)', async () => {
    render(<OrdersPage />)
    await screen.findByText('ORD-1')
    expect(cancelIn('1')).toBeTruthy() // pending, 2 hours — still yes
    expect(cancelIn('2')).toBeTruthy() // confirmed, 10 min
    expect(cancelIn('3')).toBeFalsy() // preparing, 90 min — the server says no
    expect(cancelIn('4')).toBeFalsy()
  })

  it('cancelling asks first, then reloads the list', async () => {
    render(<OrdersPage />)
    await screen.findByText('ORD-2')
    await act(async () => { fireEvent.click(cancelIn('2') as HTMLElement) })
    expect(ordersApi.cancel).toHaveBeenCalledWith('2')
    expect(toast.success).toHaveBeenCalledWith('Order cancelled successfully')
    expect(ordersApi.getPage).toHaveBeenCalledTimes(2)
  })

  it('tabs: refunded counts as completed', async () => {
    render(<OrdersPage />)
    await screen.findByText('ORD-1')
    fireEvent.click(screen.getByRole('button', { name: 'completed' }))
    expect(screen.queryByText('ORD-1')).toBeNull()
    expect(screen.getByText('ORD-6')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'active' }))
    expect(screen.getByText('ORD-4')).toBeInTheDocument()
    expect(screen.queryByText('ORD-5')).toBeNull()
  })

  it('reorder adds what is still sold, at today\'s product, with the same unit and quality', async () => {
    render(<OrdersPage />)
    await screen.findByText('ORD-5')
    const reorder = Array.from(card('5').querySelectorAll('button')).find((b) => /Reorder/.test(b.textContent || '')) as HTMLElement
    await act(async () => { fireEvent.click(reorder) })
    expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({ price: 110 }), 2, 'half_kg', 'B')
    expect(toast.success).toHaveBeenCalledWith('1 item added to cart!')
    productsApi.getById.mockResolvedValue({ id: 'p1', inStock: false })
    await act(async () => { fireEvent.click(reorder) })
    expect(toast.error).toHaveBeenCalledWith('None of these items are available right now')
  })

  it('a failed load says so with Retry; a guest goes to login', async () => {
    ordersApi.getPage.mockRejectedValueOnce(new Error('down'))
    const { unmount } = render(<OrdersPage />)
    expect(await screen.findByText(/load orders/i)).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Retry/ })) })
    expect(await screen.findByText('ORD-1')).toBeInTheDocument()
    unmount()
    mockAuth.isAuthenticated = false
    render(<OrdersPage />)
    expect(mockPush).toHaveBeenCalledWith('/login?redirect=/orders')
  })

  it('more pages load and are added below', async () => {
    render(<OrdersPage />)
    await screen.findByText('ORD-1')
    ordersApi.getPage.mockResolvedValueOnce({ orders: [order('7', 'delivered')], pagination: { page: 2, totalPages: 2, total: 26 } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load older orders (20 more)' })) })
    await waitFor(() => expect(ordersApi.getPage).toHaveBeenLastCalledWith({ page: 2, limit: 20 }))
    expect(screen.getByText('ORD-7')).toBeInTheDocument()
    expect(screen.getByText('ORD-1')).toBeInTheDocument()
  })
})
