// W17 (round 10): feedback under an order — "Rate & Review" only once
// delivered; every product, the rider and the service can be rated (blank =
// skipped), existing reviews are prefilled, a complaint is filed against the
// order with a type, subject and details.
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
jest.mock('@/lib/api', () => ({ reviewsApi: { forOrder: jest.fn(), submit: jest.fn() }, complaintsApi: { file: jest.fn() } }))

import OrderFeedback from '@/components/feedback/OrderFeedback'

/* eslint-disable @typescript-eslint/no-require-imports */
const { reviewsApi, complaintsApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

beforeEach(() => {
  reviewsApi.forOrder.mockResolvedValue({
    products: [{ productId: 'p1', productName: 'Aloo', productImage: '/a.jpg' }, { productId: 'p2', productName: 'Pyaz' }],
    rider: { riderId: 'r1', riderName: 'Bilal' },
    reviews: [{ targetType: 'service', rating: 4, comment: 'Quick' }],
  })
  reviewsApi.submit.mockResolvedValue({})
  complaintsApi.file.mockResolvedValue({ ticketNumber: 'CMP-7' })
})

const rowOf = (label: string) => screen.getByText(label).closest('.border') as HTMLElement

describe('OrderFeedback', () => {
  it('"Rate & Review" only for a delivered order; Complaint always', () => {
    const { rerender } = render(<OrderFeedback orderId="o1" orderNumber="ORD-1" delivered={false} />)
    expect(screen.queryByRole('button', { name: /Rate & Review/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Complaint/ })).toBeInTheDocument()
    rerender(<OrderFeedback orderId="o1" orderNumber="ORD-1" delivered />)
    expect(screen.getByRole('button', { name: /Rate & Review/ })).toBeInTheDocument()
  })

  it('rates what the customer chose (blank skipped); the earlier service review is prefilled', async () => {
    render(<OrderFeedback orderId="o1" orderNumber="ORD-1" delivered />)
    fireEvent.click(screen.getByRole('button', { name: /Rate & Review/ }))
    await screen.findByText('Aloo')
    expect(screen.getByLabelText('Comment for Company Service')).toHaveValue('Quick')
    fireEvent.click(within(rowOf('Aloo')).getByRole('button', { name: '5 stars' }))
    fireEvent.change(screen.getByLabelText('Comment for Aloo'), { target: { value: 'Very fresh' } })
    fireEvent.click(within(rowOf('Rider: Bilal')).getByRole('button', { name: '3 stars' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit Review' })) })
    const sent = reviewsApi.submit.mock.calls.map((c: any[]) => c[0])
    expect(sent).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetType: 'product', orderId: 'o1', productId: 'p1', rating: 5, comment: 'Very fresh' }),
      expect.objectContaining({ targetType: 'rider', rating: 3 }),
      expect.objectContaining({ targetType: 'service', rating: 4, comment: 'Quick' }),
    ]))
    expect(sent.find((r: any) => r.productId === 'p2')).toBeUndefined() // Pyaz not rated → skipped
    expect(toast.success).toHaveBeenCalledWith('Thank you for your feedback')
  })

  it('nothing rated → asks for at least one star', async () => {
    reviewsApi.forOrder.mockResolvedValue({ products: [{ productId: 'p1', productName: 'Aloo' }], rider: null, reviews: [] })
    render(<OrderFeedback orderId="o1" delivered />)
    fireEvent.click(screen.getByRole('button', { name: /Rate & Review/ }))
    await screen.findByText('Aloo')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit Review' })) })
    expect(toast.error).toHaveBeenCalledWith('Please rate at least one item before submitting')
    expect(reviewsApi.submit).not.toHaveBeenCalled()
  })

  it('a complaint is filed against this order', async () => {
    render(<OrderFeedback orderId="o1" orderNumber="ORD-1" delivered />)
    fireEvent.click(screen.getByRole('button', { name: /Complaint/ }))
    const d = screen.getByRole('dialog')
    fireEvent.click(within(d).getByRole('button', { name: 'Rider behaviour' }))
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: /Submit/ })) })
    expect(toast.error).toHaveBeenCalledWith('Please add a short subject')
    fireEvent.change(within(d).getByLabelText('Subject'), { target: { value: 'Rude rider' } })
    fireEvent.change(within(d).getByLabelText('Details'), { target: { value: 'He shouted at the gate' } })
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: /Submit/ })) })
    expect(complaintsApi.file).toHaveBeenCalledWith({ subject: 'Rude rider', message: 'He shouted at the gate', category: 'rider_behavior', orderId: 'o1' })
    expect(toast.success).toHaveBeenCalledWith('Complaint submitted — ticket CMP-7')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('a review list that fails to load says so', async () => {
    reviewsApi.forOrder.mockRejectedValue(new Error('down'))
    render(<OrderFeedback orderId="o1" delivered />)
    fireEvent.click(screen.getByRole('button', { name: /Rate & Review/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not load review options'))
  })
})
