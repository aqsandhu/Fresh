// Reviews by other customers can be reported (App Store guideline 1.2).
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockReport = jest.fn()
jest.mock('@/lib/api', () => ({
  reviewsApi: {
    forProduct: jest.fn(async () => ({
      summary: { average: 4, count: 1 },
      reviews: [{ id: 'r1', rating: 4, comment: 'Nice', authorName: 'Ali' }],
    })),
    report: (...a: unknown[]) => mockReport(...a),
  },
}))
let mockSignedIn = true
jest.mock('@/store/cartStore', () => ({
  useAuthStore: (pick: (s: { isAuthenticated: boolean }) => unknown) => pick({ isAuthenticated: mockSignedIn }),
}))
const mockToast = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
jest.mock('react-hot-toast', () => ({ __esModule: true, default: mockToast }))

import ProductReviews from '@/components/feedback/ProductReviews'

describe('reporting a review on the website', () => {
  beforeEach(() => {
    mockReport.mockReset()
    mockSignedIn = true
  })

  it('picks a reason, sends it and shows "Reported"', async () => {
    mockReport.mockResolvedValue({ reported: true })
    render(<ProductReviews productId="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Report review by Ali' }))
    fireEvent.click(screen.getByRole('button', { name: 'Spam or fake' }))
    await waitFor(() => expect(mockReport).toHaveBeenCalledWith('r1', 'spam'))
    expect(await screen.findByText('Reported')).toBeInTheDocument()
  })

  it('asks a signed-out visitor to sign in', async () => {
    mockSignedIn = false
    render(<ProductReviews productId="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Report review by Ali' }))
    expect(mockToast).toHaveBeenCalledWith('Please sign in to report a review.')
    expect(screen.queryByRole('button', { name: 'Spam or fake' })).toBeNull()
  })
})
