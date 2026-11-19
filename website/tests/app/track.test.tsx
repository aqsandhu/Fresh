// W17 (round 10): order tracking — the order shown from the server's data
// (status name, ETA from the delivery date + slot end, urgent ETA, coupon),
// cancel only while the server allows it (I17), the rider map + chat on the
// road, and a missing order.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({ useParams: () => ({ orderId: 'o1' }), useRouter: () => ({ push: jest.fn() }) }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('next/image', () => ({ __esModule: true, default: ({ alt }: any) => <span>{alt}</span> }))
jest.mock('next/dynamic', () => () => () => <div data-testid="rider-map" />)
jest.mock('framer-motion', () => ({ motion: { div: ({ children, className }: any) => <div className={className}>{children}</div> } }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
jest.mock('@/components/ui/OrderChatBox', () => ({ __esModule: true, default: () => <div data-testid="chat" /> }))
jest.mock('@/lib/api', () => ({ ordersApi: { getById: jest.fn(), cancel: jest.fn() } }))

import TrackOrderPage from '@/app/(shop)/track/[orderId]/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const { ordersApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'o1', order_number: 'ORD-900', status: 'pending', placed_at: new Date(Date.now() - 5 * 60000).toISOString(),
  subtotal: '450', delivery_charge: '50', coupon_discount: '50', coupon_code: 'SAVE50', total_amount: '450',
  slot_start: '12:00:00', slot_end: '14:00:00', requested_delivery_date: '2026-11-20',
  delivery_address_snapshot: { written_address: 'House 5', area_name: 'Model Town', city: 'Gujrat' },
  items: [{ product_name: 'Aloo', quantity: 2, unit_price: '45', unit: 'half_kg' }],
  ...over,
})

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TrackOrderPage />
    </QueryClientProvider>
  )

beforeEach(() => {
  ordersApi.getById.mockResolvedValue(raw())
  ordersApi.cancel.mockResolvedValue({})
  jest.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('track order', () => {
  it('shows the order: status, items, coupon and the expected delivery from the date + slot end', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'ORD-900' })).toBeInTheDocument()
    expect(screen.getAllByText('Order Placed').length).toBeGreaterThan(0)
    expect(screen.getByText(/Expected .*20 Nov.*by 2:00 PM/)).toBeInTheDocument()
    expect(screen.getByText(/SAVE50/)).toBeInTheDocument()
    expect(screen.getByText(/House 5, Model Town, Gujrat/)).toBeInTheDocument()
  })

  it('an urgent order shows its own ETA', async () => {
    ordersApi.getById.mockResolvedValue(raw({ is_urgent_delivery: true, urgent_delivery_eta: '45 minutes' }))
    renderPage()
    expect(await screen.findByText(/Expected 45 minutes/)).toBeInTheDocument()
  })

  it('cancel (while allowed) asks first, cancels and reloads', async () => {
    renderPage()
    const button = await screen.findByRole('button', { name: /Cancel Order/ })
    ordersApi.getById.mockResolvedValue(raw({ status: 'cancelled' }))
    await act(async () => { fireEvent.click(button) })
    expect(ordersApi.cancel).toHaveBeenCalledWith('o1')
    expect(toast.success).toHaveBeenCalledWith('Order cancelled successfully')
    await waitFor(() => expect(screen.queryByRole('button', { name: /Cancel Order/ })).toBeNull())
  })

  it('a confirmed order older than 30 minutes cannot be cancelled here (the server would refuse) (I17)', async () => {
    ordersApi.getById.mockResolvedValue(raw({ status: 'confirmed', placed_at: new Date(Date.now() - 45 * 60000).toISOString() }))
    renderPage()
    await screen.findByRole('heading', { name: 'ORD-900' })
    expect(screen.queryByRole('button', { name: /Cancel Order/ })).toBeNull()
  })

  it('on the road: the rider map and chat, and no cancel', async () => {
    ordersApi.getById.mockResolvedValue(raw({ status: 'out_for_delivery', rider_name: 'Bilal', rider_phone: '03001230001' }))
    renderPage()
    expect(await screen.findByTestId('rider-map')).toBeInTheDocument()
    expect(screen.getAllByTestId('chat').length).toBeGreaterThan(0)
    expect(screen.getByText('Bilal')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancel Order/ })).toBeNull()
  })

  it('a missing order says so', async () => {
    ordersApi.getById.mockRejectedValue(new Error('404'))
    renderPage()
    expect(await screen.findByText('Order Not Found')).toBeInTheDocument()
  })
})
