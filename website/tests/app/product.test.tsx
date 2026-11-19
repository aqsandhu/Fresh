// W17 (round 10): the product page — loads by id or slug, quality + size
// change the price, stock is per quality (sold-out quality can't be added),
// add to cart with unit + quality (variable-weight notice), wishlist, share,
// related products, a missing product.
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockParams = { id: '7c0dae27-85fa-4453-95d0-2f275af5f140' }
const mockRouter = { back: jest.fn(), push: jest.fn() }
jest.mock('next/navigation', () => ({ useParams: () => mockParams, useRouter: () => mockRouter }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('@/components/ui/SmartImage', () => ({ __esModule: true, default: ({ alt }: any) => <span>{alt}</span> }))
jest.mock('@/components/ui/ProductCard', () => ({ __esModule: true, default: ({ product }: any) => <div>related {product.name}</div> }))
jest.mock('@/components/feedback/ProductReviews', () => ({ __esModule: true, default: () => null }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockAddItem = jest.fn()
const mockCart = { addItem: mockAddItem, items: [] as any[] }
jest.mock('@/store/cartStore', () => ({ useCartStore: () => mockCart, useAuthStore: (sel: any) => sel({ isAuthenticated: false }) }))
const mockNotify = jest.fn()
jest.mock('@/store/variableWeightNotice', () => ({ useVariableWeightNotice: (sel: any) => sel({ notify: mockNotify }) }))
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCityId: 'city-1' }) }))
jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  productsApi: { getById: jest.fn(), getBySlug: jest.fn(), getAll: jest.fn() },
}))

import ProductDetailPage from '@/app/(shop)/product/[id]/page'
import { useWishlistStore } from '@/store/wishlistStore'

/* eslint-disable @typescript-eslint/no-require-imports */
const apiMod = require('@/lib/api')
const toast = require('react-hot-toast').default

const aloo = {
  id: '7c0dae27-85fa-4453-95d0-2f275af5f140', name: 'Aloo', price: 100, unit: 'kg', categoryId: 'veg', category: 'vegetables',
  stock: 10, inStock: true, priceB: 80, stockQuantityB: 0, halfKgPrice: 55, allowHalfKg: true, allowQuarterKg: false,
  isVariableWeight: true, variableWeightNote: 'Weighed at packing',
}

const store = new Map<string, string>()
const ls = localStorage as unknown as Record<'getItem' | 'setItem', jest.Mock>

beforeEach(() => {
  store.clear()
  ls.getItem.mockImplementation((k: string) => store.get(k) ?? null)
  ls.setItem.mockImplementation((k: string, v: string) => void store.set(k, v))
  mockParams.id = aloo.id
  mockCart.items = []
  apiMod.productsApi.getById.mockResolvedValue(aloo)
  apiMod.productsApi.getBySlug.mockResolvedValue(aloo)
  apiMod.productsApi.getAll.mockResolvedValue({ products: [aloo, { ...aloo, id: 'p2', name: 'Pyaz' }] })
  apiMod.default.get.mockResolvedValue({ data: { data: { free_delivery_threshold: '800' } } })
})

const renderPage = () =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProductDetailPage /></QueryClientProvider>)

describe('product page', () => {
  it('loads by id (a slug loads by slug), shows related products but not itself', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Aloo' })).toBeInTheDocument()
    expect(await screen.findByText('related Pyaz')).toBeInTheDocument()
    expect(screen.queryByText('related Aloo')).toBeNull()
    expect(apiMod.productsApi.getAll).toHaveBeenCalledWith({ category: 'veg', limit: 5 })
  })

  it('a slug in the address loads by slug', async () => {
    mockParams.id = 'aloo-fresh'
    renderPage()
    await screen.findByRole('heading', { name: 'Aloo' })
    expect(apiMod.productsApi.getBySlug).toHaveBeenCalledWith('aloo-fresh')
  })

  it('adds the chosen size and quantity, and tells about variable weight', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Aloo' })
    fireEvent.click(document.querySelector('button[aria-haspopup="listbox"]') as HTMLElement) // the size chip
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose a size' })).getByRole('button', { name: /Half/ }))
    fireEvent.click(screen.getByLabelText('Increase quantity'))
    fireEvent.click(screen.getByRole('button', { name: /Add to Cart/ }))
    expect(mockAddItem).toHaveBeenCalledWith(aloo, 2, 'half_kg', 'A')
    expect(mockNotify).toHaveBeenCalledWith(aloo.id, 'Weighed at packing')
    expect(toast.success).toHaveBeenCalledWith('Aloo (½ kg) · Quality A added to cart!')
  })

  it('a quality with no stock shows Out of Stock and cannot be added', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Aloo' })
    fireEvent.click(screen.getByRole('button', { name: /Quality B/ }))
    expect(screen.getAllByText(/Out of Stock/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Add to Cart/ })).toBeNull()
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('wishlist toggles and is remembered; share copies the link when there is no share sheet', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn(async () => undefined) } })
    renderPage()
    await screen.findByRole('heading', { name: 'Aloo' })
    await act(async () => { fireEvent.click(screen.getByLabelText('Wishlist')) })
    expect(toast.success).toHaveBeenCalledWith('Added to wishlist')
    // W22: the wishlist store (a guest: on this device, joined to the account at sign-in)
    expect(useWishlistStore.getState().ids).toEqual([aloo.id])
    expect(screen.getByLabelText('Wishlist')).toHaveAttribute('aria-pressed', 'true')
    await act(async () => { fireEvent.click(screen.getByLabelText('Wishlist')) })
    expect(toast.success).toHaveBeenCalledWith('Removed from wishlist')
    expect(useWishlistStore.getState().ids).toEqual([])
    await act(async () => { fireEvent.click(screen.getByLabelText('Share')) })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href)
  })

  it('already in the cart → "Added to Cart"', async () => {
    mockCart.items = [{ product: aloo, quantity: 1, unit: 'full', quality: 'A' }]
    renderPage()
    expect(await screen.findByRole('button', { name: /Added to Cart/ })).toBeInTheDocument()
  })

  it('back goes back', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Aloo' })
    await waitFor(() => expect(apiMod.default.get).toHaveBeenCalledWith('/site-settings/delivery', { params: { city_id: 'city-1' } }))
    const back = screen.getAllByRole('button').find((b) => /Back/.test(b.textContent || '')) as HTMLElement
    fireEvent.click(back)
    expect(mockRouter.back).toHaveBeenCalled()
  })
})
