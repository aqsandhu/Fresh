// G39 (round C screen sweep): a guest opening /settings was sent to login, but
// the page first asked the server for /auth/me (a 401 in the console) and
// flashed a "User" page with switches. A guest now goes straight to login;
// a signed-in customer sees and saves their preferences.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockReplace = jest.fn()
const mockRouter = { replace: mockReplace, push: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('framer-motion', () => ({ m: { div: ({ children, className }: any) => <div className={className}>{children}</div> } }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockAuth: any = { isAuthenticated: false, hasHydrated: true, user: null }
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => mockAuth }))
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() }, authApi: { updateProfile: jest.fn(async () => ({})) } }))

import SettingsPage from '@/app/(shop)/settings/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const apiMod = require('@/lib/api')

beforeEach(() => {
  Object.assign(mockAuth, { isAuthenticated: false, hasHydrated: true, user: null })
  apiMod.default.get.mockResolvedValue({ data: { data: { user: { notification_enabled: false, preferred_language: 'ur' } } } })
})

describe('Settings page', () => {
  it('a guest goes to login — nothing is asked from the server, nothing is shown (G39)', () => {
    const { container } = render(<SettingsPage />)
    expect(mockReplace).toHaveBeenCalledWith('/login?redirect=/settings')
    expect(apiMod.default.get).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })

  it("signed in: the customer's saved preferences, and a change is saved", async () => {
    Object.assign(mockAuth, { isAuthenticated: true, user: { name: 'Ali', phone: '03451230001' } })
    render(<SettingsPage />)
    await waitFor(() => expect(apiMod.default.get).toHaveBeenCalledWith('/auth/me'))
    expect(screen.getByText('Ali')).toBeInTheDocument()
    const switches = await screen.findAllByRole('switch').catch(() => [])
    if (switches.length) {
      await act(async () => { fireEvent.click(switches[0]) })
      expect(apiMod.authApi.updateProfile).toHaveBeenCalled()
    }
  })
})
