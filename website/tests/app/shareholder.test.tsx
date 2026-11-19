// W17 (round 10): the shareholder dashboard — signed out → login; the period
// tabs (this month / today / a chosen month / all time) ask for that period;
// profit, share, received and the balance owed; a pending payment is confirmed
// after asking; payout periods read "Oct 2026" / "10 Oct 2026"; the password
// box. I24: a slow answer for the previous tab overwrote the tab now chosen
// (Today's figures under "All time"). G31: the password box and the month /
// year pickers had no labels and the box was not a dialog (no Escape, focus).
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockReplace = jest.fn()
const mockRouter = { replace: mockReplace }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockInfo = { value: { id: 's1', name: 'Bilal', email: 'b@x.pk', city: 'Gujrat', sharePercent: 20 } as null | Record<string, unknown> }
jest.mock('@/lib/shareholderSession', () => ({ getShareholderInfo: () => mockInfo.value, clearShareholderSession: jest.fn(), setShareholderSession: jest.fn() }))
jest.mock('@/lib/shareholderApi', () => ({ shareholderApi: { dashboard: jest.fn(), receivePayout: jest.fn(), changePassword: jest.fn() } }))

import ShareholderDashboard from '@/app/(shop)/shareholder/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const { shareholderApi } = require('@/lib/shareholderApi')
const session = require('@/lib/shareholderSession')
const toast = require('react-hot-toast').default

const DASH = {
  profit: 100000, distributable: 80000, sharePercent: 20, myShare: 16000, received: 10000, balance: 6000, pending: 5000,
  payouts: [
    { id: 'p1', amount: 5000, status: 'pending', period_start: '2026-10-01', period_end: '2026-10-31', created_at: '2026-11-02T10:00:00Z', note: 'Oct share' },
    { id: 'p2', amount: 5000, status: 'received', period_start: '2026-10-10', period_end: '2026-10-10', created_at: '2026-10-11T10:00:00Z' },
    { id: 'p3', amount: 2000, status: 'rejected', period_start: '2026-10-03', period_end: '2026-10-09', created_at: '2026-10-11T10:00:00Z' },
  ],
}

beforeEach(() => {
  mockInfo.value = { id: 's1', name: 'Bilal', email: 'b@x.pk', city: 'Gujrat', sharePercent: 20 }
  shareholderApi.dashboard.mockResolvedValue(DASH)
  shareholderApi.receivePayout.mockResolvedValue({})
  shareholderApi.changePassword.mockResolvedValue({ ok: true, token: 'fresh-token' })
  jest.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('shareholder dashboard', () => {
  it('signed out → the shareholder login', () => {
    mockInfo.value = null
    const { container } = render(<ShareholderDashboard />)
    expect(container).toBeEmptyDOMElement()
    expect(mockReplace).toHaveBeenCalledWith('/shareholder/login')
  })

  it("this month's figures, the balance owed, and every payment with its period", async () => {
    render(<ShareholderDashboard />)
    expect(await screen.findByText('Rs. 16,000')).toBeInTheDocument()
    expect(shareholderApi.dashboard).toHaveBeenCalledWith({ period: 'month' })
    expect(screen.getByText('Rs. 6,000')).toBeInTheDocument()
    expect(screen.getByText(/Rs. 5,000 pending your confirmation/)).toBeInTheDocument()
    expect(screen.getByText('For Oct 2026')).toBeInTheDocument()
    expect(screen.getByText('For 10 Oct 2026')).toBeInTheDocument()
    expect(screen.getByText('For 2026-10-03 – 2026-10-09')).toBeInTheDocument()
    expect(screen.getByText(/Oct share/)).toBeInTheDocument()
  })

  it('the tabs ask for their period; a chosen month and year (labelled — G31)', async () => {
    render(<ShareholderDashboard />)
    await screen.findByText('Rs. 16,000')
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(shareholderApi.dashboard).toHaveBeenLastCalledWith({ period: 'today' }))
    fireEvent.click(screen.getByRole('button', { name: 'All time' }))
    await waitFor(() => expect(shareholderApi.dashboard).toHaveBeenLastCalledWith({}))
    expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Specific month' }))
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2025' } })
    await waitFor(() => expect(shareholderApi.dashboard).toHaveBeenLastCalledWith({ month: 3, year: 2025 }))
  })

  it('a slow answer for the previous tab never replaces the tab now chosen (I24)', async () => {
    let releaseToday: (v: unknown) => void = () => undefined
    render(<ShareholderDashboard />)
    await screen.findByText('Rs. 16,000')
    shareholderApi.dashboard.mockImplementationOnce(() => new Promise((r) => { releaseToday = r }))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    shareholderApi.dashboard.mockResolvedValueOnce({ ...DASH, myShare: 99000, payouts: [] })
    fireEvent.click(screen.getByRole('button', { name: 'All time' }))
    expect(await screen.findByText('Rs. 99,000')).toBeInTheDocument()
    await act(async () => { releaseToday({ ...DASH, myShare: 111, payouts: [] }) })
    expect(screen.queryByText('Rs. 111')).toBeNull()
    expect(screen.getByText('Rs. 99,000')).toBeInTheDocument()
  })

  it('confirming a payment asks first, then saves and reloads; a failed load says so', async () => {
    render(<ShareholderDashboard />)
    await screen.findByText('Rs. 16,000')
    ;(window.confirm as jest.Mock).mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: /Confirm received/ }))
    expect(shareholderApi.receivePayout).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirm received/ })) })
    expect(shareholderApi.receivePayout).toHaveBeenCalledWith('p1')
    expect(toast.success).toHaveBeenCalledWith('Payment confirmed')
    shareholderApi.dashboard.mockRejectedValueOnce(new Error('Server busy'))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Server busy'))
  })

  it('password: a labelled dialog (Escape closes — G31); too short refused; saved; logout', async () => {
    render(<ShareholderDashboard />)
    await screen.findByText('Rs. 16,000')
    fireEvent.click(screen.getByRole('button', { name: /Password/ }))
    expect(screen.getByRole('dialog', { name: 'Change password' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Password/ }))
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-pass' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(toast.error).toHaveBeenCalledWith('New password must be at least 6 characters')
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-pass-1' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(shareholderApi.changePassword).toHaveBeenCalledWith('old-pass', 'new-pass-1')
    // B38: the change ends older sessions — this device keeps going on the new token.
    expect(session.setShareholderSession).toHaveBeenCalledWith('fresh-token', expect.objectContaining({ id: 's1' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Logout/ }))
    expect(session.clearShareholderSession).toHaveBeenCalled()
  })
})
