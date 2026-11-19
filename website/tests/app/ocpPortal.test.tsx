// W17 (round 10): the collection-point (OCP) portal — signed-out goes to its
// login, orders (phone hidden when the office hides it, COD due / collected),
// order detail (assign a rider, mark cash collected after confirming, print
// slip), stock to verify + current stock, and cash settlements.
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mockRouter = { replace: jest.fn(), push: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockInfo = { value: { id: 'k1', name: 'Kiryana One', city: 'Gujrat', phone: '03001110001' } as any }
jest.mock('@/lib/ocpSession', () => ({ getOcpInfo: () => mockInfo.value, clearOcpSession: jest.fn() }))
jest.mock('@/lib/ocpSlip', () => ({ ...jest.requireActual('@/lib/ocpSlip'), printOcpSlip: jest.fn() }))
jest.mock('@/lib/ocpApi', () => ({
  ocpApi: {
    getOrders: jest.fn(), getOrder: jest.fn(), getRiders: jest.fn(), assignRider: jest.fn(), collect: jest.fn(),
    getStock: jest.fn(), getStockRequests: jest.fn(), receiveStock: jest.fn(), getSettlements: jest.fn(), sendSettlement: jest.fn(),
  },
}))

import OcpDashboard from '@/app/(shop)/ocp/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const { ocpApi } = require('@/lib/ocpApi')
const session = require('@/lib/ocpSession')
const { printOcpSlip } = require('@/lib/ocpSlip')
const toast = require('react-hot-toast').default

const o1 = { id: 'o1', order_number: 'ORD-11', status: 'ready_for_pickup', customer_name: 'Ali', customer_phone: '03451230001', address: 'House 5', total_amount: '500', paid_amount: '0', delivery_charge: '50', subtotal: '450', items: [{ product_name: 'Aloo', quantity: 2, unit: 'half_kg', unit_price: '45', total_price: '90' }] }
const o2 = { id: 'o2', order_number: 'ORD-12', status: 'delivered', customer_name: 'Sara', phone_hidden: true, address: 'House 9', total_amount: '300', paid_amount: '300' }

beforeEach(() => {
  mockInfo.value = { id: 'k1', name: 'Kiryana One', city: 'Gujrat', phone: '03001110001' }
  ocpApi.getOrders.mockResolvedValue([o1, o2])
  ocpApi.getRiders.mockResolvedValue([{ id: 'r1', name: 'Bilal', status: 'available' }])
  ocpApi.getOrder.mockResolvedValue(o1)
  ocpApi.assignRider.mockResolvedValue({})
  ocpApi.collect.mockResolvedValue({})
  ocpApi.getStockRequests.mockResolvedValue([{ id: 'sr1', status: 'pending', created_at: '2026-11-18T05:00:00Z', items: [{ product_name: 'Aloo', quality: 'A', quantity: '5' }] }])
  ocpApi.getStock.mockResolvedValue([{ product_name: 'Pyaz', quality: 'B', quantity: '3.5' }])
  ocpApi.receiveStock.mockResolvedValue({})
  ocpApi.getSettlements.mockResolvedValue({ due_amount: 1200, due_orders: 3, settlements: [{ id: 's1', amount: '800', status: 'received', requested_at: '2026-11-17T05:00:00Z' }, { id: 's2', amount: '400', status: 'pending', requested_at: '2026-11-18T05:00:00Z' }] })
  ocpApi.sendSettlement.mockResolvedValue({})
  jest.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('OCP portal', () => {
  it('signed out → its own login; log out clears the session', async () => {
    mockInfo.value = null
    const { unmount } = render(<OcpDashboard />)
    expect(mockRouter.replace).toHaveBeenCalledWith('/ocp/login')
    unmount()
    mockInfo.value = { id: 'k1', name: 'Kiryana One' }
    render(<OcpDashboard />)
    await screen.findByText(/ORD-11/)
    fireEvent.click(screen.getByRole('button', { name: /Logout|Log out/i }))
    expect(session.clearOcpSession).toHaveBeenCalled()
  })

  it('orders: phone shown or hidden as the office decided; COD due vs collected', async () => {
    render(<OcpDashboard />)
    const first = (await screen.findByText(/ORD-11/)).closest('.bg-white') as HTMLElement
    expect(within(first).getByText('COD due')).toBeInTheDocument()
    const second = screen.getByText(/ORD-12/).closest('.bg-white') as HTMLElement
    expect(within(second).getByText('phone hidden')).toBeInTheDocument()
    expect(within(second).getByText('Collected')).toBeInTheDocument()
  })

  it('order detail: assign a rider, collect cash after confirming, print the slip', async () => {
    render(<OcpDashboard />)
    const first = (await screen.findByText(/ORD-11/)).closest('.bg-white') as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: /View/ }))
    const rider = await screen.findByLabelText('Rider')
    fireEvent.change(rider, { target: { value: 'r1' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Assign' })) })
    expect(ocpApi.assignRider).toHaveBeenCalledWith('o1', 'r1')
    expect(toast.success).toHaveBeenCalledWith('Rider assigned')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Mark collected/ })) })
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/collected Rs\. 500 cash/))
    expect(ocpApi.collect).toHaveBeenCalledWith('o1')
    fireEvent.click(screen.getByRole('button', { name: /Print slip/ }))
    expect(printOcpSlip).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByLabelText('Rider')).toBeNull()
    // G31: the order box is a labelled dialog; Escape closes it.
    fireEvent.click(within(first).getByRole('button', { name: /View/ }))
    expect(await screen.findByRole('dialog', { name: /Order #ORD-11/ })).toHaveAttribute('aria-modal', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stock: incoming stock is verified and received; current stock listed', async () => {
    render(<OcpDashboard />)
    await screen.findByText(/ORD-11/)
    fireEvent.click(screen.getByRole('button', { name: 'Stock' }))
    expect(await screen.findByText(/Aloo · QA · 5/)).toBeInTheDocument()
    expect(screen.getByText('3.5')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Verify & receive/ })) })
    expect(ocpApi.receiveStock).toHaveBeenCalledWith('sr1')
    expect(toast.success).toHaveBeenCalledWith('Stock received')
  })

  it('payments: cash in hand, waiting, settled; sending a settlement asks first', async () => {
    render(<OcpDashboard />)
    await screen.findByText(/ORD-11/)
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }))
    expect(await screen.findByText('Rs. 1,200')).toBeInTheDocument()
    expect(screen.getAllByText('Rs. 400').length).toBeGreaterThan(0) // waiting for the admin + history
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Send settlement/ })) })
    expect(ocpApi.sendSettlement).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Settlement sent to admin')
  })

  it('nothing to settle → the send button is off', async () => {
    ocpApi.getSettlements.mockResolvedValue({ due_amount: 0, due_orders: 0, settlements: [] })
    render(<OcpDashboard />)
    await screen.findByText(/ORD-11/)
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }))
    expect(await screen.findByText('No collected cash to settle right now.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send settlement/ })).toBeDisabled()
  })
})
