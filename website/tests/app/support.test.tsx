// W17 (round 10): Reviews & Complaints — my complaints / reviews, filing a
// complaint (subject + details required, issue type, a delivered order,
// photos max 5 and ≤ 5 MB), and I19: a failed load showed "No complaints
// yet" instead of saying it failed; photo previews leaked a new object URL on
// every keystroke; every photo's remove button had the same name.
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mockPush = jest.fn()
const mockRouter = { push: mockPush }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
jest.mock('@/components/feedback/StarRating', () => ({ __esModule: true, default: ({ value }: any) => <span>{value} stars</span> }))
const mockAuth = { isAuthenticated: true }
jest.mock('@/store/cartStore', () => ({ useAuthStore: (sel: (s: typeof mockAuth) => unknown) => sel(mockAuth) }))
jest.mock('@/lib/api', () => ({
  complaintsApi: { mine: jest.fn(), file: jest.fn() },
  reviewsApi: { mine: jest.fn() },
  ordersApi: { getAll: jest.fn() },
}))

import SupportPage from '@/app/(shop)/support/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const { complaintsApi, reviewsApi, ordersApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

const created = jest.fn((f: File) => `blob:${f.name}`)
const revoked = jest.fn()
Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked })

beforeEach(() => {
  mockAuth.isAuthenticated = true
  complaintsApi.mine.mockResolvedValue([
    { id: 'c1', ticketNumber: 'CMP-1', status: 'in_progress', category: 'delivery', subject: 'Late order', message: 'Two hours late', createdAt: '2026-11-18T05:00:00Z', adminResponse: 'Sorry — rider was stuck' },
  ])
  reviewsApi.mine.mockResolvedValue([{ id: 'r1', targetType: 'rider', rating: 4, comment: 'Polite', createdAt: '2026-11-18T05:00:00Z' }])
  ordersApi.getAll.mockResolvedValue([
    { id: 'o1', order_number: 'ORD-1', status: 'delivered', delivered_at: '2026-11-18T05:00:00Z' },
    { id: 'o2', order_number: 'ORD-2', status: 'pending' },
  ])
  complaintsApi.file.mockResolvedValue({ ticketNumber: 'CMP-2' })
})

const openForm = async () => {
  render(<SupportPage />)
  await screen.findByText('Late order')
  fireEvent.click(screen.getByRole('button', { name: /New Complaint/ }))
  return screen.getByRole('dialog')
}

describe('support', () => {
  it('lists my complaints with the office reply, and my reviews', async () => {
    render(<SupportPage />)
    expect(await screen.findByText('Late order')).toBeInTheDocument()
    expect(screen.getByText(/Sorry — rider was stuck/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /My Reviews/ }))
    expect(screen.getByText('Polite')).toBeInTheDocument()
  })

  it('a failed load says so and can be retried — not "No complaints yet" (I19)', async () => {
    complaintsApi.mine.mockRejectedValueOnce(new Error('down'))
    render(<SupportPage />)
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument()
    expect(screen.queryByText('No complaints yet')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Retry/ })) })
    expect(await screen.findByText('Late order')).toBeInTheDocument()
  })

  it('files a complaint with type, a delivered order and photos; subject and details are required', async () => {
    const d = await openForm()
    fireEvent.click(within(d).getByRole('button', { name: 'Product quality' }))
    await waitFor(() => expect(within(d).getByRole('option', { name: /ORD-1/ })).toBeInTheDocument())
    expect(within(d).queryByRole('option', { name: /ORD-2/ })).toBeNull() // only delivered orders
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: /Submit/ })) })
    expect(toast.error).toHaveBeenCalledWith('Please add a short subject')
    fireEvent.change(within(d).getByLabelText('Subject'), { target: { value: 'Rotten tomatoes' } })
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: /Submit/ })) })
    expect(toast.error).toHaveBeenCalledWith('Please describe the issue')
    fireEvent.change(within(d).getByLabelText('Details'), { target: { value: 'Half of them were rotten' } })
    fireEvent.change(within(d).getByLabelText(/order/i), { target: { value: 'o1' } })
    const photo = new File(['x'], 'tomato.jpg', { type: 'image/jpeg' })
    fireEvent.change(d.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [photo] } })
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: /Submit/ })) })
    expect(complaintsApi.file).toHaveBeenCalledWith({ subject: 'Rotten tomatoes', message: 'Half of them were rotten', category: 'product_quality', orderId: 'o1', images: [photo] })
    expect(toast.success).toHaveBeenCalledWith('Complaint submitted — ticket CMP-2')
  })

  it('photos: over 5 MB refused, at most 5 kept, each removable by name; previews are made once and released (I19)', async () => {
    const d = await openForm()
    const input = d.querySelector('input[type="file"]') as HTMLInputElement
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [big] } })
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/larger than 5 MB/))
    const files = Array.from({ length: 6 }, (_, i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }))
    fireEvent.change(input, { target: { files } })
    expect(within(d).getAllByRole('button', { name: /Remove image \d/ })).toHaveLength(5)
    const made = created.mock.calls.length
    fireEvent.change(within(d).getByLabelText('Subject'), { target: { value: 'typing re-renders' } })
    expect(created.mock.calls.length).toBe(made) // no new object URL per keystroke
    fireEvent.click(within(d).getByRole('button', { name: 'Remove image 2' }))
    expect(within(d).getAllByRole('button', { name: /Remove image \d/ })).toHaveLength(4)
    expect(revoked).toHaveBeenCalled()
  })

  it('a guest goes to login', () => {
    mockAuth.isAuthenticated = false
    render(<SupportPage />)
    expect(mockPush).toHaveBeenCalledWith('/login?redirect=/support')
  })
})
