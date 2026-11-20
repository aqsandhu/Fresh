// W17 (round 10): the header on every page — G32: the Search, Orders, Cart
// and Profile icons had no name for screen readers (the cart was read as just
// "3"); now named. Search: 2+ letters search (debounced), results open the
// product, Enter goes to the results page, a click outside closes an unused
// search. I25: a slow answer for an older query replaced the newer one's
// results ("tom" results under "tomato"). A new cart item pops the cart open
// briefly (not on cart / checkout); Escape / outside close the mobile menu.
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'

const mockPush = jest.fn()
let mockPath = '/'
jest.mock('next/navigation', () => ({ usePathname: () => mockPath, useRouter: () => ({ push: mockPush }) }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, onClick, className, ...rest }: any) => <a href={href} onClick={onClick} className={className} aria-label={rest['aria-label']}>{children}</a> }))
jest.mock('next/image', () => ({ __esModule: true, default: ({ alt }: any) => <img alt={alt} /> }))
jest.mock('framer-motion', () => {
  const R = jest.requireActual('react')
  const strip = ({ initial, animate, exit, transition, ...rest }: any) => rest
  return {
    AnimatePresence: ({ children }: any) => R.createElement(R.Fragment, null, children),
    // One component per tag (a new one per render would remount the subtree).
    m: new Proxy({} as Record<string, unknown>, { get: (t, tag: string) => (t[tag] ||= (p: any) => R.createElement(tag, strip(p))) }),
    useReducedMotion: () => true,
  }
})
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: null, isLoading: false }) }))
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCityId: 'c1', selectedCity: { id: 'c1', name: 'Gujrat' } }) }))
jest.mock('@/components/ui/BrandLogo', () => ({ __esModule: true, default: () => <span>FreshBazar</span> }))
jest.mock('@/components/notifications/NotificationBell', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/layout/CartDropdown', () => ({ __esModule: true, default: ({ isOpen }: any) => (isOpen ? <div>cart panel</div> : null) }))
const mockCart = { items: [{ id: '1' }] as unknown[], hasHydrated: true, getTotalItems: () => 3 }
jest.mock('@/store/cartStore', () => ({
  useCartStore: () => mockCart,
  useAuthStore: () => ({ isAuthenticated: true, user: { name: 'Ali' } }),
}))
jest.mock('@/lib/api', () => ({
  productsApi: { getAll: jest.fn() },
  categoriesApi: { getAll: jest.fn(async () => []) },
  bannerApi: { getSettings: jest.fn(async () => ({})) },
  settingsApi: { getPublicConfig: jest.fn(async () => ({})) },
}))

import Header from '@/components/layout/Header'

/* eslint-disable @typescript-eslint/no-require-imports */
const { productsApi } = require('@/lib/api')

const product = (id: string, name: string) => ({ id, name, nameEn: name, price: 100, unit: 'kg', image: null })

beforeEach(() => {
  mockPath = '/'
  mockCart.items = [{ id: '1' }]
  productsApi.getAll.mockReset()
})

const mount = async () => {
  const r = render(<Header />)
  await act(async () => { await Promise.resolve() })
  return r
}

describe('Header', () => {
  it('every icon has a name (G32)', async () => {
    await mount()
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Cart, 3 items' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My orders' })).toHaveAttribute('href', '/orders')
    expect(screen.getByRole('link', { name: 'My profile' })).toHaveAttribute('href', '/profile')
  })

  it('search: results open the product; Enter opens the results page (I25: newest query wins)', async () => {
    jest.useFakeTimers()
    try {
      await mount()
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
      const box = screen.getByLabelText('Search products')
      let releaseOld: (v: unknown) => void = () => undefined
      productsApi.getAll.mockImplementationOnce(() => new Promise((r) => { releaseOld = r }))
      fireEvent.change(box, { target: { value: 'tom' } })
      await act(async () => { jest.advanceTimersByTime(350) })
      productsApi.getAll.mockResolvedValueOnce({ products: [product('p2', 'Tomato Red')] })
      fireEvent.change(box, { target: { value: 'tomato' } })
      await act(async () => { jest.advanceTimersByTime(350) })
      expect(await screen.findByText('Tomato Red')).toBeInTheDocument()
      await act(async () => { releaseOld({ products: [product('p1', 'Tomato Cherry Old')] }) })
      expect(screen.queryByText('Tomato Cherry Old')).toBeNull()
      expect(screen.getByText('Tomato Red').closest('a')).toHaveAttribute('href', '/product/p2')
      fireEvent.submit(box.closest('form') as HTMLFormElement)
      expect(mockPush).toHaveBeenCalledWith('/search?q=tomato')
    } finally {
      jest.useRealTimers()
    }
  })

  it('nothing found says so; a failed search shows no stale results; an unused search closes on outside click', async () => {
    jest.useFakeTimers()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await mount()
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
      productsApi.getAll.mockResolvedValueOnce({ products: [] })
      fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'xyz' } })
      await act(async () => { jest.advanceTimersByTime(350) })
      expect(screen.getByText('No products found')).toBeInTheDocument()
      productsApi.getAll.mockRejectedValueOnce(new Error('down'))
      fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'xyzw' } })
      await act(async () => { jest.advanceTimersByTime(350) })
      expect(screen.getByText('No products found')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'x' } })
      fireEvent.mouseDown(document.body)
      expect(screen.queryByLabelText('Search products')).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('a new cart item opens the cart for a moment; not on the cart page', async () => {
    jest.useFakeTimers()
    try {
      const { rerender } = await mount()
      mockCart.items = [{ id: '1' }, { id: '2' }]
      rerender(<Header />)
      expect(screen.getByText('cart panel')).toBeInTheDocument()
      act(() => { jest.advanceTimersByTime(2100) })
      expect(screen.queryByText('cart panel')).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('the mobile menu closes on Escape and outside taps', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.mouseDown(document.body)
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
  })
})
