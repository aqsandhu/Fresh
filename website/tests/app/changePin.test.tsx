// W17 (round 10): change PIN — current PIN first when one exists (C2), new
// PIN twice, an easy PIN refused before the second entry, every session
// revoked → sign in again, a refusal restarts the flow, guests go to login.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('framer-motion', () => ({ motion: { div: ({ children }: any) => <div>{children}</div> } }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockAuth: any = {}
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => mockAuth }))
jest.mock('@/lib/api', () => ({ authApi: { pinStatus: jest.fn(), setPin: jest.fn() } }))

import ChangePinPage from '@/app/(shop)/settings/pin/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const { authApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

beforeEach(() => {
  Object.assign(mockAuth, { isAuthenticated: true, hasHydrated: true, user: { phone: '03001230001' }, markPinVerified: jest.fn(), logout: jest.fn() })
  authApi.pinStatus.mockResolvedValue({ exists: true, hasPin: true })
  authApi.setPin.mockResolvedValue({ data: { sessions_revoked: true } })
})

const enter = async (label: string, pin: string) => {
  const el = await screen.findByLabelText(`${label} digit 1 of 4`)
  await act(async () => { fireEvent.change(el, { target: { value: pin } }) })
}

describe('ChangePinPage', () => {
  it('current → new → confirm; all sessions end, so the customer signs in again', async () => {
    render(<ChangePinPage />)
    await enter('Current PIN', '4826')
    await enter('New PIN', '5718')
    await enter('Confirm PIN', '5718')
    await waitFor(() => expect(authApi.setPin).toHaveBeenCalledWith('5718', '4826'))
    expect(mockAuth.logout).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/login')
  })

  it('an easy new PIN is refused before the confirm step', async () => {
    render(<ChangePinPage />)
    await enter('Current PIN', '4826')
    await enter('New PIN', '0000')
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/too easy to guess/))
    expect(screen.queryByLabelText('Confirm PIN digit 1 of 4')).toBeNull()
    expect(authApi.setPin).not.toHaveBeenCalled()
  })

  it('no PIN yet: new PIN twice, no current PIN asked; stays signed in', async () => {
    authApi.pinStatus.mockResolvedValue({ exists: true, hasPin: false })
    authApi.setPin.mockResolvedValue({ data: {} })
    render(<ChangePinPage />)
    await enter('New PIN', '5718')
    await enter('Confirm PIN', '5718')
    await waitFor(() => expect(authApi.setPin).toHaveBeenCalledWith('5718', undefined))
    expect(mockAuth.markPinVerified).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/profile')
  })

  it('a mismatch starts the new PIN again; a wrong current PIN restarts from the current PIN', async () => {
    authApi.setPin.mockRejectedValueOnce({ response: { data: { message: 'Current PIN is incorrect' } } })
    render(<ChangePinPage />)
    await enter('Current PIN', '1357')
    await enter('New PIN', '5718')
    await enter('Confirm PIN', '5719')
    expect(toast.error).toHaveBeenCalledWith('PINs do not match. Try again.')
    await enter('New PIN', '5718')
    await enter('Confirm PIN', '5718')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Current PIN is incorrect'))
    expect(await screen.findByLabelText('Current PIN digit 1 of 4')).toBeInTheDocument()
  })

  it('a guest is sent to login', () => {
    mockAuth.isAuthenticated = false
    render(<ChangePinPage />)
    expect(mockPush).toHaveBeenCalledWith('/login?redirect=/settings/pin')
  })
})
