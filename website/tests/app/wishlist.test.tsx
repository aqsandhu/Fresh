// W22: the wishlist page — the saved products as sold in this city now (one
// no longer sold here does not show), newest first; add to cart; remove one
// (a named, always-visible button — it used to appear on mouse hover only);
// clear all (from the account too when signed in); says where it is kept.
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('framer-motion', () => ({ motion: { div: ({ children, className }: any) => <div className={className}>{children}</div> } }))
jest.mock('next/image', () => ({ __esModule: true, default: ({ alt }: any) => <img alt={alt} /> }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a> }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockAddItem = jest.fn()
const mockAuth = { isAuthenticated: true }
jest.mock('@/store/cartStore', () => ({
  useCartStore: () => ({ addItem: mockAddItem }),
  useAuthStore: (sel: (s: typeof mockAuth) => unknown) => sel(mockAuth),
}))
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCityId: 'c1' }) }))
jest.mock('@/components/ui/ProductPrice', () => ({ __esModule: true, default: ({ price }: any) => <span>Rs. {price}</span> }))
jest.mock('@/lib/api', () => ({
  productsApi: { getByIds: jest.fn() },
  wishlistApi: { remove: jest.fn(async () => []), add: jest.fn(), get: jest.fn(), merge: jest.fn() },
}))

import WishlistPage from '@/app/(shop)/wishlist/page'
import { useWishlistStore } from '@/store/wishlistStore'

/* eslint-disable @typescript-eslint/no-require-imports */
const { productsApi, wishlistApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

const prod = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, price: 120, unit: 'kg', inStock: true, ...extra })
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WishlistPage /></QueryClientProvider>)

beforeEach(() => {
  mockAuth.isAuthenticated = true
  useWishlistStore.setState({ ids: ['p2', 'p1', 'gone'], unsynced: false })
  productsApi.getByIds.mockResolvedValue([prod('p1', 'Aloo'), prod('p2', 'Tamatar', { inStock: false })])
  jest.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('wishlist page', () => {
  it("this city's products, newest first; a product no longer sold here is left out", async () => {
    mount()
    expect(await screen.findByText('My Wishlist (2)')).toBeInTheDocument()
    expect(productsApi.getByIds).toHaveBeenCalledWith(['p2', 'p1', 'gone'], 'c1')
    const names = screen.getAllByRole('link').map((a) => a.textContent).filter((t) => t === 'Aloo' || t === 'Tamatar')
    expect(names).toEqual(['Tamatar', 'Aloo'])
    expect(screen.getByText(/Saved to your account/)).toBeInTheDocument()
  })

  it('add to cart (not when out of stock); remove one with its named button', async () => {
    mount()
    await screen.findByText('My Wishlist (2)')
    const addButtons = screen.getAllByRole('button', { name: /Add/ })
    expect(addButtons[0]).toBeDisabled() // Tamatar out of stock
    fireEvent.click(addButtons[1])
    expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 1)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove Aloo from wishlist' })) })
    expect(wishlistApi.remove).toHaveBeenCalledWith('p1')
    expect(toast.success).toHaveBeenCalledWith('Removed from wishlist')
  })

  it('clear all removes them from the account; a guest is told to sign in to keep it', async () => {
    mount()
    await screen.findByText('My Wishlist (2)')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Clear All/ })) })
    expect(wishlistApi.remove).toHaveBeenCalledTimes(3)
    expect(useWishlistStore.getState().ids).toEqual([])
    expect(await screen.findByText('Your Wishlist is Empty')).toBeInTheDocument()
    mockAuth.isAuthenticated = false
    mount()
    expect(screen.getAllByText(/Sign in to keep it on every device/).length).toBeGreaterThan(0)
  })
})
