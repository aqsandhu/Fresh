// W17 (round 10): the website checkout — guest vs signed-in, this city's
// addresses, slots (passed / full / free, first free one picked), the server
// cart sync + server delivery price, coupons, urgent delivery, tomorrow's
// date, a new address saved by Place Order, and the order sent.
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/checkout' }))
jest.mock('next/image', () => ({ __esModule: true, default: ({ alt }: { alt: string }) => <span>{alt}</span> }))
Element.prototype.scrollIntoView = jest.fn()
jest.mock('framer-motion', () => {
  const R = jest.requireActual('react')
  const div = R.forwardRef(({ initial, animate, exit, transition, ...p }: any, ref: any) => R.createElement('div', { ...p, ref }))
  return { m: { div } }
})
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
jest.mock('@/components/auth/PinReauthGate', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }))
jest.mock('@/components/checkout/CheckoutAuthPanel', () => ({ __esModule: true, default: () => <div>sign-in panel</div> }))
jest.mock('@/components/checkout/AddressActions', () => ({ __esModule: true, default: () => null }))
const mockAddressSubmit = jest.fn()
jest.mock('@/components/checkout/AddressForm', () => {
  const React = jest.requireActual('react')
  return {
    __esModule: true,
    default: React.forwardRef(function AddressFormStub(props: any, ref: any) {
      React.useImperativeHandle(ref, () => ({ submit: mockAddressSubmit }))
      return <button onClick={() => props.onValidityChange?.(true)}>fill new address</button>
    }),
  }
})
jest.mock('@/lib/businessDate', () => ({
  pktWallClock: () => new Date(2026, 10, 19, 10, 0, 0), // 10:00 in Pakistan
  pktDateString: (day: string = 'today') => (day === 'tomorrow' ? '2026-11-20' : '2026-11-19'),
  pktDisplayDate: (day: string) => (day === 'tomorrow' ? '20 Nov' : '19 Nov'),
}))
const mockCityId = { value: 'city-1' as string | null }
jest.mock('@/lib/cityStorage', () => ({
  getSelectedCityId: () => mockCityId.value,
  addressMatchesSelectedCity: (a: string, b: string) => !b || (a || '').toLowerCase() === b.toLowerCase(),
}))
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCity: { id: 'city-1', name: 'Gujrat', province: 'Punjab' } }) }))
const mockAuth = { isAuthenticated: true, hasHydrated: true }
const mockCart: any = {}
jest.mock('@/store/cartStore', () => ({ useCartStore: () => mockCart, useAuthStore: () => mockAuth }))
jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { post: jest.fn() },
  addressesApi: { getAll: jest.fn() },
  settingsApi: { getDeliverySettings: jest.fn(), getTimeSlots: jest.fn() },
  cartApi: { sync: jest.fn(), applyCoupon: jest.fn(), removeCoupon: jest.fn() },
  myCouponsApi: { list: jest.fn() },
}))

import CheckoutPage from '@/app/(shop)/checkout/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const apiMod = require('@/lib/api')
const toast = require('react-hot-toast').default
const post = apiMod.default.post as jest.Mock

const aloo = { id: 'p1', name: 'Aloo', price: 100, unit: 'kg', image: '/a.jpg' }
const slots = [
  { id: 's-morning', slot_name: 'Morning', start_time: '08:00:00', end_time: '10:30:00', is_free_delivery_slot: false, available_slots: 5 }, // 80% passed
  { id: 's-noon', slot_name: 'Noon', start_time: '12:00:00', end_time: '15:00:00', is_free_delivery_slot: true, available_slots: 5 },
  { id: 's-full', slot_name: 'Full', start_time: '16:00:00', end_time: '18:00:00', is_free_delivery_slot: false, available_slots: 0 },
  { id: 's-eve', slot_name: 'Evening', start_time: '18:00:00', end_time: '21:00:00', is_free_delivery_slot: false, available_slots: 5 },
]

beforeEach(() => {
  mockAuth.isAuthenticated = true
  mockCityId.value = 'city-1'
  Object.assign(mockCart, {
    items: [{ product: aloo, quantity: 2, unit: 'full', quality: 'A' }],
    getSubtotal: () => 200,
    getDeliveryCharge: (free: boolean) => (free ? 0 : 100),
    getFinalTotal: () => 300,
    clearCart: jest.fn(),
    hasHydrated: true,
  })
  apiMod.addressesApi.getAll.mockResolvedValue([
    { id: 'a1', address_type: 'home', written_address: 'House 5', area_name: 'Model Town', city: 'Gujrat', is_default: true },
    { id: 'a2', address_type: 'work', written_address: 'Office', city: 'Lahore' },
  ])
  apiMod.settingsApi.getDeliverySettings.mockResolvedValue({ urgent_charge: 250, urgent_eta: '45 min', slot_cutoff_percent: 60 })
  apiMod.settingsApi.getTimeSlots.mockResolvedValue(slots)
  apiMod.cartApi.sync.mockResolvedValue({ cart: { subtotal: '200' } })
  apiMod.cartApi.applyCoupon.mockResolvedValue({ code: 'SAVE50', discount_type: 'fixed', discount_amount: 50, free_delivery: false, summary: 'Rs. 50 off' })
  apiMod.cartApi.removeCoupon.mockResolvedValue({})
  apiMod.myCouponsApi.list.mockResolvedValue({ coupons: [{ code: 'WELCOME', summary: 'Free delivery', discount_type: 'free_delivery' }] })
  post.mockImplementation(async (url: string) =>
    url === '/cart/delivery-charge'
      ? { data: { data: { delivery_charge: 0 } } }
      : { data: { data: { order: { id: 'o1', order_number: 'ORD-501', total_amount: '200' } } } })
})

const line = (label: string) => (screen.getByText(label, { selector: 'span' }).parentElement as HTMLElement).textContent
const ready = async () => {
  render(<CheckoutPage />)
  await waitFor(() => expect(post).toHaveBeenCalledWith('/cart/delivery-charge', { time_slot_id: 's-noon' }))
}
const placed = () => post.mock.calls.find((c) => c[0] === '/orders')?.[1]

describe('who sees what', () => {
  it('a guest sees the sign-in panel and the cart subtotal, nothing that needs an account', () => {
    mockAuth.isAuthenticated = false
    render(<CheckoutPage />)
    expect(screen.getByText('sign-in panel')).toBeInTheDocument()
    expect(screen.getAllByText('Rs. 200').length).toBeGreaterThan(0)
    expect(apiMod.addressesApi.getAll).not.toHaveBeenCalled()
  })

  it('an empty cart goes back to the cart page', () => {
    mockCart.items = []
    render(<CheckoutPage />)
    expect(mockPush).toHaveBeenCalledWith('/cart')
  })
})

describe('signed in', () => {
  it('only this city\'s addresses; default picked; slots marked passed / full; the first free slot chosen', async () => {
    await ready()
    expect(screen.getByLabelText(/House 5, Model Town, Gujrat/)).toBeChecked()
    expect(screen.queryByText(/Office/)).toBeNull()
    expect(screen.getByText('Unavailable')).toBeInTheDocument() // morning: 80% gone (cutoff 60%)
    expect(screen.getByText('FULL')).toBeInTheDocument()
    expect(apiMod.cartApi.sync).toHaveBeenCalledTimes(1)
    expect(apiMod.cartApi.sync).toHaveBeenCalledWith([{ product_id: 'p1', quantity: 2, unit: 'full', quality: 'A' }])
    await waitFor(() => expect(line('Delivery')).toContain('FREE'))
  })

  it('places the order for today\'s slot, then shows the order number and total', async () => {
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }))
    await waitFor(() => expect(placed()).toBeDefined())
    expect(placed()).toEqual({ address_id: 'a1', payment_method: 'cash_on_delivery', customer_notes: '', city_id: 'city-1', time_slot_id: 's-noon' })
    expect(await screen.findByText('Order placed successfully!')).toBeInTheDocument()
    expect(screen.getByText('ORD-501')).toBeInTheDocument()
    expect(mockCart.clearCart).toHaveBeenCalled()
    // G31: announced as a dialog with focus inside; Escape opens the order.
    const box = screen.getByRole('dialog', { name: 'Order placed successfully!' })
    expect(box).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/track\//))
  })

  it('tomorrow: tomorrow\'s slots and the date go with the order', async () => {
    await ready()
    fireEvent.click(screen.getByRole('button', { name: /tomorrow/i }))
    await waitFor(() => expect(apiMod.settingsApi.getTimeSlots).toHaveBeenLastCalledWith('2026-11-20'))
    await waitFor(() => expect(screen.queryByText('Unavailable')).toBeNull()) // nothing has passed tomorrow
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }))
    await waitFor(() => expect(placed()).toMatchObject({ requested_delivery_date: '2026-11-20', time_slot_id: 's-morning' }))
  })

  it('urgent delivery: its own charge, no slot, no coupon discount', async () => {
    await ready()
    fireEvent.change(screen.getByLabelText(/Have a coupon/), { target: { value: 'save50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(line('Total')).toContain('Rs. 150'))
    fireEvent.click(screen.getByRole('button', { name: /Urgent delivery/ }))
    expect(line('Delivery')).toContain('Rs. 250')
    expect(line('Total')).toContain('Rs. 450')
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }))
    await waitFor(() => expect(placed()).toBeDefined())
    expect(placed()).toMatchObject({ urgent_delivery: 'true' })
    expect(placed().time_slot_id).toBeUndefined()
  })

  it('coupons: apply (synced first), a refusal is shown, remove, and "your coupons" apply in one tap', async () => {
    await ready()
    apiMod.cartApi.applyCoupon.mockRejectedValueOnce({ response: { data: { message: 'Coupon expired' } } })
    fireEvent.change(screen.getByLabelText(/Have a coupon/), { target: { value: 'old' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('Coupon expired')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /WELCOME/ }))
    await waitFor(() => expect(apiMod.cartApi.applyCoupon).toHaveBeenLastCalledWith('WELCOME'))
    expect(await screen.findByText('SAVE50 applied')).toBeInTheDocument()
    expect(line('Total')).toContain('Rs. 150')
    fireEvent.click(screen.getByLabelText('Remove coupon'))
    await waitFor(() => expect(apiMod.cartApi.removeCoupon).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('SAVE50 applied')).toBeNull())
  })

  it('no city chosen → says so instead of a server error; a refused order shows the reason', async () => {
    await ready()
    mockCityId.value = null
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }))
    expect(await screen.findByText('Please select your city before placing your order.')).toBeInTheDocument()
    mockCityId.value = 'city-1'
    post.mockImplementation(async (url: string) => {
      if (url === '/orders') throw { response: { data: { message: 'Aloo is out of stock' } } }
      return { data: { data: { delivery_charge: 0 } } }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Aloo is out of stock'))
    expect(screen.queryByText('Order placed successfully!')).toBeNull()
  })

  it('with no saved address, Place Order saves the new address first and orders to it', async () => {
    apiMod.addressesApi.getAll.mockResolvedValue([])
    mockAddressSubmit.mockResolvedValue({ id: 'a-new', address_type: 'home', written_address: 'New House', city: 'Gujrat' })
    await ready()
    const place = screen.getByRole('button', { name: 'Place Order' })
    expect(place).toBeDisabled() // nothing to deliver to yet
    fireEvent.click(screen.getByText('fill new address'))
    await act(async () => { fireEvent.click(place) })
    await waitFor(() => expect(mockAddressSubmit).toHaveBeenCalled())
    await waitFor(() => expect(placed()).toMatchObject({ address_id: 'a-new' }))
  })

  it('a FULL first slot is not picked for the customer (I15) — the next one with room is', async () => {
    await ready()
    apiMod.settingsApi.getTimeSlots.mockResolvedValue(slots.map((s) => (s.id === 's-morning' ? { ...s, available_slots: 0 } : s)))
    fireEvent.click(screen.getByRole('button', { name: /tomorrow/i }))
    await waitFor(() => expect(within(screen.getAllByText('FULL')[0].closest('label') as HTMLElement).getByRole('radio')).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }))
    await waitFor(() => expect(placed()).toMatchObject({ time_slot_id: 's-noon' })) // first slot that still has room
  })
})
