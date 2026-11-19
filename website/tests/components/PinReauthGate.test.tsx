// W17 (round 10): the PIN check before checkout after a long break — a fresh
// PIN lets the page through, a stale one asks for the PIN (the masked number
// shown), a right PIN refreshes the session, a wrong one says so, and a
// signed-out visitor goes to login with the way back.
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'

const mockReplace = jest.fn()
const mockRouter = { replace: mockReplace }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter, usePathname: () => '/checkout' }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('framer-motion', () => ({ motion: { div: ({ children, className }: any) => <div className={className}>{children}</div> } }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockSetAuth = jest.fn()
const mockAuth: any = {}
jest.mock('@/store/cartStore', () => {
  const hook: any = () => mockAuth
  hook.getState = () => ({ setAuth: mockSetAuth })
  return { useAuthStore: hook }
})
jest.mock('@/lib/api', () => ({ authApi: { verifyPin: jest.fn() } }))

import PinReauthGate from '@/components/auth/PinReauthGate'

/* eslint-disable @typescript-eslint/no-require-imports */
const { authApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

const DAY = 24 * 60 * 60 * 1000
beforeEach(() => {
  Object.assign(mockAuth, {
    user: { id: 'u1', name: 'Ali', phone: '03451230001', role: 'customer' },
    isAuthenticated: true, hasHydrated: true, pinVerifiedAt: Date.now() - 4 * DAY, markPinVerified: jest.fn(),
  })
  authApi.verifyPin.mockResolvedValue({ data: { user: { id: 'u1', full_name: 'Ali', phone: '03451230001', role: 'customer' }, tokens: { accessToken: 'at', refreshToken: 'rt' } } })
})

const gate = () => render(<PinReauthGate><p>checkout page</p></PinReauthGate>)
const pin = async (p: string) => {
  const el = screen.getByLabelText('PIN digit 1 of 4')
  await act(async () => { fireEvent.change(el, { target: { value: p } }) })
}

describe('PinReauthGate', () => {
  it('a recent PIN lets the page through', () => {
    mockAuth.pinVerifiedAt = Date.now() - 60_000
    gate()
    expect(screen.getByText('checkout page')).toBeInTheDocument()
  })

  it('after a long break the PIN is asked (masked number); the right PIN refreshes the session and opens the page', async () => {
    gate()
    expect(screen.queryByText('checkout page')).toBeNull()
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    await pin('4826')
    expect(authApi.verifyPin).toHaveBeenCalledWith('03451230001', '4826')
    expect(mockSetAuth).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }), { accessToken: 'at', refreshToken: 'rt' })
    expect(mockAuth.markPinVerified).toHaveBeenCalled()
    expect(screen.getByText('checkout page')).toBeInTheDocument()
  })

  it('a wrong PIN says so and stays locked', async () => {
    authApi.verifyPin.mockRejectedValueOnce({ response: { status: 401, data: { message: 'Incorrect PIN' } } })
    gate()
    await pin('0000')
    expect(toast.error).toHaveBeenCalled()
    expect(screen.queryByText('checkout page')).toBeNull()
    expect(screen.getByLabelText('PIN digit 1 of 4')).toHaveValue('')
  })

  it('"another number" goes to login and back to this page', () => {
    gate()
    expect(screen.getByRole('link', { name: 'Login with another number' })).toHaveAttribute('href', '/login?redirect=%2Fcheckout&another=1')
  })

  it('signed out → login with the way back', () => {
    mockAuth.isAuthenticated = false
    const { container } = gate()
    expect(container).toBeEmptyDOMElement()
    expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Fcheckout')
  })
})
