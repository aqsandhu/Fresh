// W17 (round 10): restaurant checkout — signed-out restaurants go to their
// login, delivery price rules (threshold, free slot, urgent), passed / full
// slots can't be picked, the order sent (Pakistan date, address, pin,
// storefront photo), GPS pinning outcomes, and photo upload.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockRouter = { push: jest.fn(), replace: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() })
  return { __esModule: true, default: t }
})
jest.mock('@/components/checkout/GoogleMapPicker', () => ({ __esModule: true, default: () => <div data-testid="map-picker" /> }))
jest.mock('@/lib/businessDate', () => ({
  pktWallClock: () => new Date(2026, 10, 19, 13, 0, 0), // 13:00 in Pakistan
  pktDateString: (day: string = 'today') => (day === 'tomorrow' ? '2026-11-20' : '2026-11-19'),
}))
const mockGps = jest.fn()
jest.mock('@/lib/geolocation', () => ({ REQUIRED_LOCATION_ACCURACY_M: 25, getAccuratePosition: (o: unknown) => mockGps(o) }))
const mockInfo = { value: { id: 'r1', business_name: 'Dhaba One', city: 'Gujrat', phone: '03001234567', address: 'GT Road' } as any }
jest.mock('@/lib/restaurantSession', () => ({ getRestaurantInfo: () => mockInfo.value }))
jest.mock('@/lib/restaurantApi', () => ({
  restaurantShopApi: { getDelivery: jest.fn(), getMe: jest.fn(), getTimeSlots: jest.fn(), placeOrder: jest.fn(), uploadFrontImage: jest.fn() },
}))
const mockCart: any = {}
jest.mock('@/store/restaurantCartStore', () => ({ useRestaurantCartStore: () => mockCart }))

import RestaurantCheckoutPage from '@/app/(shop)/restaurant/checkout/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const { restaurantShopApi: api } = require('@/lib/restaurantApi')
const toast = require('react-hot-toast').default

const slots = [
  { id: 's-morning', start_time: '09:00:00', end_time: '12:00:00', available_slots: 5 }, // passed at 13:00
  { id: 's-full', start_time: '14:00:00', end_time: '16:00:00', available_slots: 0 },
  { id: 's-free', start_time: '16:00:00', end_time: '18:00:00', available_slots: 5, is_free_delivery_slot: true },
  { id: 's-eve', start_time: '18:00:00', end_time: '21:00:00', available_slots: 5 },
]

beforeEach(() => {
  mockInfo.value = { id: 'r1', business_name: 'Dhaba One', city: 'Gujrat', phone: '03001234567', address: 'GT Road' }
  Object.assign(mockCart, {
    items: [{ product: { id: 'p1', name: 'Onion' }, quantity: 5, unit: 'full', quality: 'A', unitPrice: 140 }],
    getSubtotal: () => 700,
    clearCart: jest.fn(),
  })
  api.getDelivery.mockResolvedValue({ base_charge: 150, free_delivery_threshold: 2000, urgent_charge: 300, urgent_eta: '45 min', slot_cutoff_percent: 60 })
  api.getMe.mockResolvedValue({ address: 'GT Road', latitude: 32.5, longitude: 74.0, front_image_url: null })
  api.getTimeSlots.mockResolvedValue(slots)
  api.placeOrder.mockResolvedValue({ id: 'o1' })
})

const summary = (label: string) => (screen.getAllByText(label).pop()!.parentElement as HTMLElement).textContent
const slot = (re: RegExp) => screen.getByRole('button', { name: re })
const open = async () => {
  render(<RestaurantCheckoutPage />)
  await waitFor(() => expect(api.getTimeSlots).toHaveBeenCalledWith('2026-11-19'))
  await screen.findByRole('button', { name: /^6:00 PM/ })
}

describe('restaurant checkout', () => {
  it('a signed-out restaurant goes to its own login', () => {
    mockInfo.value = null
    render(<RestaurantCheckoutPage />)
    expect(mockRouter.replace).toHaveBeenCalledWith('/restaurant/login')
  })

  it('an empty cart offers the catalogue', async () => {
    mockCart.items = []
    render(<RestaurantCheckoutPage />)
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument()
  })

  it('passed and full slots cannot be picked; a free slot makes delivery free', async () => {
    await open()
    expect(slot(/^9:00 AM.*Passed/)).toBeDisabled()
    expect(slot(/^2:00 PM.*Full/)).toBeDisabled()
    expect(summary('Delivery')).toContain('Rs. 150') // below Rs 2,000
    fireEvent.click(slot(/^4:00 PM/))
    expect(summary('Delivery')).toMatch(/FREE|Rs\. 0/)
  })

  it('places the order with the slot, today\'s Pakistan date, address and pin', async () => {
    await open()
    fireEvent.change(screen.getByLabelText('Order notes'), { target: { value: 'Back gate' } })
    fireEvent.click(slot(/^6:00 PM/))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Place Order/i })) })
    expect(api.placeOrder).toHaveBeenCalledWith(
      [{ product_id: 'p1', quantity: 5, unit: 'full', quality: 'A' }],
      { customer_notes: 'Back gate', time_slot_id: 's-eve', requested_delivery_date: '2026-11-19', urgent_delivery: false, address: 'GT Road', latitude: 32.5, longitude: 74 },
    )
    expect(mockCart.clearCart).toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith('/restaurant/orders')
  })

  it('without a slot it asks for one; urgent needs no slot and costs the urgent charge', async () => {
    await open()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Place Order/i })) })
    expect(toast.error).toHaveBeenCalledWith('Please select a delivery time slot')
    fireEvent.click(screen.getByLabelText(/Urgent delivery/))
    expect(summary('Delivery')).toContain('Rs. 300')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Place Order/i })) })
    expect(api.placeOrder.mock.calls[0][1]).toMatchObject({ time_slot_id: null, urgent_delivery: true, requested_delivery_date: undefined })
  })

  it('tomorrow loads tomorrow\'s slots (nothing has passed) and sends tomorrow\'s date', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: /tomorrow/i }))
    await waitFor(() => expect(api.getTimeSlots).toHaveBeenLastCalledWith('2026-11-20'))
    await waitFor(() => expect(slot(/^9:00 AM/)).toBeEnabled())
    fireEvent.click(slot(/^9:00 AM/))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Place Order/i })) })
    expect(api.placeOrder.mock.calls[0][1]).toMatchObject({ time_slot_id: 's-morning', requested_delivery_date: '2026-11-20' })
  })

  it('a refused order shows the reason and keeps the cart', async () => {
    api.placeOrder.mockRejectedValueOnce(new Error('Restaurant account is not approved'))
    await open()
    fireEvent.click(slot(/^6:00 PM/))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Place Order/i })) })
    expect(toast.error).toHaveBeenCalledWith('Restaurant account is not approved')
    expect(mockCart.clearCart).not.toHaveBeenCalled()
  })

  it('GPS: a locked fix pins the place', async () => {
    api.getMe.mockResolvedValue({ address: 'GT Road' }) // no pin saved yet
    Object.defineProperty(navigator, 'geolocation', { value: {}, configurable: true })
    mockGps.mockResolvedValueOnce({ status: 'locked', position: { lat: 32.6, lng: 74.1, accuracy: 12 } })
    await open()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Get My Location/ })) })
    expect(toast.success).toHaveBeenCalledWith('Location detected (+/-12m)')
    expect(screen.getByTestId('map-picker')).toBeInTheDocument()
  })

  it('GPS: a blocked permission says how to fix it', async () => {
    api.getMe.mockResolvedValue({ address: 'GT Road' })
    Object.defineProperty(navigator, 'geolocation', { value: {}, configurable: true })
    mockGps.mockResolvedValueOnce({ status: 'denied' })
    await open()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Get My Location/ })) })
    expect(toast.error).toHaveBeenCalledWith('Location permission blocked — allow it in browser settings.', { duration: 6000 })
    expect(screen.getByText(/Allow location for this site in your browser settings/)).toBeInTheDocument()
  })

  it('the storefront photo is uploaded and sent with the order', async () => {
    api.uploadFrontImage.mockResolvedValue({ front_image_url: 'https://cdn/front.jpg' })
    const { container } = render(<RestaurantCheckoutPage />)
    await screen.findByRole('button', { name: /^6:00 PM/ })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['x'], 'front.jpg', { type: 'image/jpeg' })] } }) })
    expect(toast.success).toHaveBeenCalledWith('Storefront photo updated')
    fireEvent.click(slot(/^6:00 PM/))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Place Order/i })) })
    expect(api.placeOrder.mock.calls[0][1]).toMatchObject({ front_image_url: 'https://cdn/front.jpg' })
  })
})
