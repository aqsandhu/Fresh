// W17 (round 10): My Profile — shows the account, edits name + email (an
// empty email clears it), lists addresses, logs out. I20: deleting an address
// took ONE tap with no question (the app asks first), and a refused profile
// update hid the server's reason.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockPush = jest.fn()
const mockRouter = { push: mockPush }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, title }: any) => <a href={href} title={title}>{children}</a> }))
jest.mock('framer-motion', () => ({ m: { div: ({ children, className }: any) => <div className={className}>{children}</div> } }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockAuth: any = {}
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => mockAuth }))
jest.mock('@/lib/api', () => ({
  authApi: { getProfile: jest.fn(), updateProfile: jest.fn() },
  addressesApi: { getAll: jest.fn(), delete: jest.fn() },
  myCouponsApi: { list: jest.fn(async () => ({ coupons: [] })) },
}))

import ProfilePage from '@/app/(shop)/profile/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const { authApi, addressesApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

beforeEach(() => {
  Object.assign(mockAuth, { user: { id: 'u1', name: 'Ali', phone: '03451230001', email: '' }, isAuthenticated: true, hasHydrated: true, logout: jest.fn() })
  authApi.getProfile.mockResolvedValue({ data: { id: 'u1', full_name: 'Ali Raza', phone: '03451230001', email: 'ali@x.pk' } })
  authApi.updateProfile.mockResolvedValue({})
  addressesApi.getAll.mockResolvedValue([{ id: 'a1', address_type: 'home', written_address: 'House 5', area_name: 'Model Town', city: 'Gujrat', is_default: true }])
  addressesApi.delete.mockResolvedValue({})
  jest.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('ProfilePage', () => {
  it('shows the account and addresses', async () => {
    render(<ProfilePage />)
    expect((await screen.findAllByText('Ali Raza')).length).toBeGreaterThan(0)
    expect(await screen.findByText('House 5, Model Town, Gujrat')).toBeInTheDocument()
  })

  it('edits name and email; an empty email clears it on the server', async () => {
    render(<ProfilePage />)
    await screen.findAllByText('Ali Raza')
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Ali R.' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  ' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save/ })) })
    expect(authApi.updateProfile).toHaveBeenCalledWith({ full_name: 'Ali R.', email: '' })
    expect(toast.success).toHaveBeenCalledWith('Profile updated successfully!')
  })

  it('a refused update shows the server\'s reason (I20)', async () => {
    authApi.updateProfile.mockRejectedValueOnce({ response: { data: { message: 'This email is already used by another account' } } })
    render(<ProfilePage />)
    await screen.findAllByText('Ali Raza')
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save/ })) })
    expect(toast.error).toHaveBeenCalledWith('This email is already used by another account')
  })

  it('deleting an address asks first (I20) — "no" keeps it, "yes" deletes it', async () => {
    render(<ProfilePage />)
    await screen.findByText('House 5, Model Town, Gujrat')
    ;(window.confirm as jest.Mock).mockReturnValueOnce(false)
    await act(async () => { fireEvent.click(screen.getByTitle('Delete')) })
    expect(window.confirm).toHaveBeenCalled()
    expect(addressesApi.delete).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByTitle('Delete')) })
    expect(addressesApi.delete).toHaveBeenCalledWith('a1')
    await waitFor(() => expect(screen.queryByText('House 5, Model Town, Gujrat')).toBeNull())
  })

  it('an expired session goes to login; a server hiccup falls back to what is known', async () => {
    authApi.getProfile.mockRejectedValueOnce({ response: { status: 500 } })
    const { unmount } = render(<ProfilePage />)
    expect((await screen.findAllByText('Ali')).length).toBeGreaterThan(0)
    unmount()
    authApi.getProfile.mockRejectedValueOnce({ response: { status: 401 } })
    render(<ProfilePage />)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
    expect(mockAuth.logout).toHaveBeenCalled()
  })

  it('log out', async () => {
    render(<ProfilePage />)
    await screen.findAllByText('Ali Raza')
    fireEvent.click(screen.getByRole('button', { name: /Logout/ }))
    expect(mockAuth.logout).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Logged out successfully!')
  })
})
