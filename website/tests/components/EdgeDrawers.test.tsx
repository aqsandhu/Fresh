// W17 (round 10): the two edge rails. Left — the shop categories (Urdu names)
// + Today's Basket; right — Support, Instructions, City, Shop Now, WhatsApp.
// Both open from their handle or an edge swipe, close on Escape / backdrop /
// a swipe back, lock the page scroll while open, and stay away from the
// login / PIN / portal pages. City change is hidden on cart and checkout.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('framer-motion', () => {
  const R = jest.requireActual('react')
  const strip = ({ custom, variants, initial, animate, exit, transition, ...rest }: any) => rest
  const make = (tag: string) => R.forwardRef((p: any, ref: any) => R.createElement(tag, { ...strip(p), ref }))
  return {
    AnimatePresence: ({ children }: any) => R.createElement(R.Fragment, null, children),
    motion: new Proxy({}, { get: (_t, tag: string) => make(tag) }),
    useReducedMotion: () => mockReduce.value,
  }
})
const mockReduce = { value: false }
let mockPath = '/'
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, onClick, className }: any) => <a href={href} onClick={onClick} className={className}>{children}</a> }))
jest.mock('@/components/ui/SmartImage', () => ({ __esModule: true, default: ({ alt }: any) => <img alt={alt} /> }))
const mockCity = { value: { id: 'c1', name: 'Gujrat' } as null | { id: string; name: string } }
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCity: mockCity.value, selectedCityId: mockCity.value?.id ?? null }) }))
jest.mock('@/lib/api', () => ({
  categoriesApi: { getAll: jest.fn() },
  aiChatApi: { getStatus: jest.fn() },
  bannerApi: { getSettings: jest.fn() },
}))
jest.mock('@/lib/whatsapp', () => ({ ...jest.requireActual('@/lib/whatsapp'), openWhatsAppOrder: jest.fn() }))

import CategoriesDrawer from '@/components/layout/CategoriesDrawer'
import UtilityDrawer from '@/components/layout/UtilityDrawer'
import { useLeftDrawer } from '@/store/leftDrawer'
import { useRightDrawer } from '@/store/rightDrawer'
import { useBasketUi } from '@/store/basketUi'
import { useInstructionsPopup } from '@/store/instructionsPopup'

/* eslint-disable @typescript-eslint/no-require-imports */
const api = require('@/lib/api')
const wa = require('@/lib/whatsapp')

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}
const touch = (type: 'touchStart' | 'touchMove', x: number, y = 400) =>
  act(() => { fireEvent[type](document, { touches: [{ clientX: x, clientY: y }] }) })

beforeEach(() => {
  mockPath = '/'
  mockReduce.value = false
  mockCity.value = { id: 'c1', name: 'Gujrat' }
  Object.assign(window, { innerWidth: 400, innerHeight: 800 })
  useLeftDrawer.setState({ open: false })
  useRightDrawer.setState({ open: false, chatOpen: false, cityPickerOpen: false })
  useBasketUi.setState({ isOpen: false })
  useInstructionsPopup.setState({ open: false })
  api.categoriesApi.getAll.mockResolvedValue([
    { id: 'k1', slug: 'vegetables', name: 'Vegetables', nameUrdu: 'سبزیاں', image: '/v.png' },
    { id: 'k2', slug: 'fruits', name: 'Fruits', image: null },
  ])
  api.aiChatApi.getStatus.mockResolvedValue({ enabled: true })
  api.bannerApi.getSettings.mockResolvedValue({ whatsapp_order_url: '+92 300 1234567' })
})

describe('categories rail (left)', () => {
  it('the handle opens it: categories in Urdu (English when none) + Today\'s Basket; scroll locked', async () => {
    wrap(<CategoriesDrawer />)
    fireEvent.click(screen.getByRole('button', { name: 'Open categories' }))
    expect(await screen.findByText('سبزیاں')).toBeInTheDocument()
    expect(screen.getByText('Fruits').closest('a')).toHaveAttribute('href', '/category/fruits')
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByText('آج کی ٹوکری'))
    expect(useBasketUi.getState().isOpen).toBe(true)
    expect(useLeftDrawer.getState().open).toBe(false)
    await waitFor(() => expect(document.body.style.overflow).toBe(''))
  })

  it('swipe from the left edge opens; a swipe back or Escape closes; a category link closes it', async () => {
    mockReduce.value = true
    wrap(<CategoriesDrawer />)
    touch('touchStart', 300); touch('touchMove', 380)
    expect(useLeftDrawer.getState().open).toBe(false)
    touch('touchStart', 10); touch('touchMove', 60, 500)
    expect(useLeftDrawer.getState().open).toBe(false)
    touch('touchStart', 10); touch('touchMove', 60)
    expect(useLeftDrawer.getState().open).toBe(true)
    touch('touchStart', 200); touch('touchMove', 100)
    expect(useLeftDrawer.getState().open).toBe(false)
    act(() => useLeftDrawer.getState().setOpen(true))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useLeftDrawer.getState().open).toBe(false)
    act(() => useLeftDrawer.getState().setOpen(true))
    fireEvent.click(await screen.findByText('سبزیاں'))
    expect(useLeftDrawer.getState().open).toBe(false)
  })

  it('not on login / PIN pages, nor before a city is chosen', () => {
    mockPath = '/login'
    const { container, unmount } = wrap(<CategoriesDrawer />)
    expect(container).toBeEmptyDOMElement()
    unmount()
    mockPath = '/'
    mockCity.value = null
    expect(wrap(<CategoriesDrawer />).container).toBeEmptyDOMElement()
  })
})

describe('quick-help rail (right)', () => {
  const openRail = async () => {
    wrap(<UtilityDrawer />)
    fireEvent.click(screen.getByRole('button', { name: 'Open quick help' }))
    return screen.findByRole('dialog', { name: 'Quick help' })
  }

  it('Support opens the chat, Instructions the tips, City the picker (with the city name)', async () => {
    await openRail()
    expect(screen.getByText('Gujrat')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Support'))
    expect(useRightDrawer.getState()).toMatchObject({ open: false, chatOpen: true })
    act(() => useRightDrawer.getState().setOpen(true))
    fireEvent.click(screen.getByText('Instructions'))
    expect(useInstructionsPopup.getState().open).toBe(true)
    act(() => useRightDrawer.getState().setOpen(true))
    fireEvent.click(screen.getByText('City'))
    expect(useRightDrawer.getState().cityPickerOpen).toBe(true)
    act(() => useRightDrawer.getState().setOpen(true))
    expect(screen.getByText('Shop Now').closest('a')).toHaveAttribute('href', '/products')
  })

  it('To Order opens WhatsApp with the city\'s number once known', async () => {
    await openRail()
    await waitFor(() => expect(api.bannerApi.getSettings).toHaveBeenCalled())
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByText('To Order'))
    expect(wa.openWhatsAppOrder).toHaveBeenCalledWith('+92 300 1234567')
  })

  it('support switched off / no WhatsApp number → those chips go away; no city change on checkout', async () => {
    api.aiChatApi.getStatus.mockResolvedValue({ enabled: false })
    api.bannerApi.getSettings.mockResolvedValue({})
    mockPath = '/checkout'
    await openRail()
    await waitFor(() => expect(screen.queryByText('Support')).toBeNull())
    await waitFor(() => expect(screen.queryByText('To Order')).toBeNull())
    expect(screen.queryByText('City')).toBeNull()
  })

  it('swipe in from the right edge opens; swipe right or Escape closes', () => {
    mockReduce.value = true
    wrap(<UtilityDrawer />)
    touch('touchStart', 395); touch('touchMove', 340)
    expect(useRightDrawer.getState().open).toBe(true)
    touch('touchStart', 300); touch('touchMove', 360)
    expect(useRightDrawer.getState().open).toBe(false)
    act(() => useRightDrawer.getState().setOpen(true))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useRightDrawer.getState().open).toBe(false)
  })

  it('not on the PIN page', () => {
    mockPath = '/settings/pin'
    expect(wrap(<UtilityDrawer />).container).toBeEmptyDOMElement()
  })
})
