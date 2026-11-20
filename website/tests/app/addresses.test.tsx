// W17 (round 10): My Addresses — only this city's addresses, add / edit open
// the address form (edit prefilled), set default, delete asks first, a failed
// load says so with Retry (I19 — it showed "No addresses saved"), guests go to
// login.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockPush = jest.fn()
const mockRouter = { push: mockPush, back: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('framer-motion', () => ({ m: { div: ({ children, className }: any) => <div className={className}>{children}</div> } }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
jest.mock('@/components/checkout/AddressForm', () => ({
  __esModule: true,
  default: ({ initial, onSaved }: any) => (
    <div>
      <p>form for {initial?.written_address || 'a new address'}</p>
      <button onClick={() => onSaved({ id: 'a-new' })}>save form</button>
    </div>
  ),
}))
const mockAuth = { isAuthenticated: true, hasHydrated: true }
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => mockAuth }))
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCity: { id: 'c1', name: 'Gujrat', province: 'Punjab' } }) }))
jest.mock('@/lib/cityStorage', () => ({ addressMatchesSelectedCity: (a: string, b: string) => (a || '').toLowerCase() === b.toLowerCase() }))
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() }, addressesApi: { delete: jest.fn() } }))

import AddressesPage from '@/app/(shop)/addresses/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const apiMod = require('@/lib/api')
const toast = require('react-hot-toast').default

const home = { id: 'a1', address_type: 'home', written_address: 'House 5', area_name: 'Model Town', city: 'Gujrat', is_default: true }
const work = { id: 'a2', address_type: 'work', written_address: 'Office 3', area_name: 'Saddar', city: 'Gujrat', is_default: false }
const lahore = { id: 'a3', address_type: 'home', written_address: 'Far House', area_name: 'DHA', city: 'Lahore', is_default: false }

beforeEach(() => {
  mockAuth.isAuthenticated = true
  apiMod.default.get.mockResolvedValue({ data: { data: [home, work, lahore] } })
  apiMod.default.put.mockResolvedValue({})
  apiMod.addressesApi.delete.mockResolvedValue({})
  jest.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('AddressesPage', () => {
  it('lists only this city\'s addresses', async () => {
    render(<AddressesPage />)
    expect(await screen.findByText(/House 5/)).toBeInTheDocument()
    expect(screen.getByText(/Office 3/)).toBeInTheDocument()
    expect(screen.queryByText(/Far House/)).toBeNull()
  })

  it('edit opens the form with the address; saving reloads the list', async () => {
    render(<AddressesPage />)
    await screen.findByText(/Office 3/)
    fireEvent.click(screen.getAllByTitle('Edit')[1])
    expect(screen.getByText('form for Office 3')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByText('save form')) })
    expect(apiMod.default.get).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))
    expect(screen.getByText('form for a new address')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByText(/form for/)).toBeNull()
  })

  it('set default and delete (after confirming)', async () => {
    render(<AddressesPage />)
    await screen.findByText(/Office 3/)
    await act(async () => { fireEvent.click(screen.getByTitle('Set as default')) })
    expect(apiMod.default.put).toHaveBeenCalledWith('/addresses/a2/set-default')
    expect(toast.success).toHaveBeenCalledWith('Default address updated')
    ;(window.confirm as jest.Mock).mockReturnValueOnce(false)
    await act(async () => { fireEvent.click(screen.getAllByTitle('Delete')[1]) })
    expect(apiMod.addressesApi.delete).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getAllByTitle('Delete')[1]) })
    expect(apiMod.addressesApi.delete).toHaveBeenCalledWith('a2')
  })

  it('a failed load says so with Retry — not "No addresses saved" (I19)', async () => {
    apiMod.default.get.mockRejectedValueOnce(new Error('down'))
    render(<AddressesPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load your addresses/)
    expect(screen.queryByText('No addresses saved')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    expect(await screen.findByText(/House 5/)).toBeInTheDocument()
  })

  it('a guest goes to login; back goes back', async () => {
    mockAuth.isAuthenticated = false
    const { unmount } = render(<AddressesPage />)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login?redirect=/addresses'))
    unmount()
    mockAuth.isAuthenticated = true
    render(<AddressesPage />)
    await screen.findByText(/House 5/)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(mockRouter.back).toHaveBeenCalled()
  })
})
