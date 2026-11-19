// W17 (round 10): the restaurant (B2B) storefront calls — the restaurant's own
// token on every call, the data unwrapped, a failure carries the server's
// message and status, and a 401/403 ends the restaurant session (login sends
// it back to the page it was on).
jest.mock('@/lib/apiBase', () => ({ getApiBaseUrl: () => '/api' }))
const mockToken = { value: 'rtok' as string | null }
jest.mock('@/lib/restaurantSession', () => ({ getRestaurantToken: () => mockToken.value, clearRestaurantSession: jest.fn() }))
jest.mock('@/lib/portalSession', () => ({ handlePortalAuthFailure: jest.fn() }))

import { restaurantShopApi } from '@/lib/restaurantApi'

/* eslint-disable @typescript-eslint/no-require-imports */
const { handlePortalAuthFailure } = require('@/lib/portalSession')

const fetchMock = jest.fn()
const reply = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: body === undefined ? async () => { throw new Error('empty') } : async () => body })

beforeEach(() => {
  mockToken.value = 'rtok'
  ;(global as unknown as { fetch: jest.Mock }).fetch = fetchMock
  fetchMock.mockReset()
})

describe('restaurant storefront API', () => {
  it("sends the restaurant's token and unwraps the data", async () => {
    reply(200, { data: [{ id: 'veg' }] })
    await expect(restaurantShopApi.getCategories()).resolves.toEqual([{ id: 'veg' }])
    expect(fetchMock).toHaveBeenCalledWith('/api/restaurant/categories', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer rtok', 'Content-Type': 'application/json' }),
    }))
  })

  it('filters, dates and orders build the right calls', async () => {
    reply(200, { data: [] }); await restaurantShopApi.getProducts('veg & fruit')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/restaurant/products?category=veg%20%26%20fruit')
    reply(200, { data: [] }); await restaurantShopApi.getProducts()
    expect(fetchMock.mock.calls[1][0]).toBe('/api/restaurant/products')
    reply(200, { data: [] }); await restaurantShopApi.getTimeSlots('2026-11-20')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/restaurant/time-slots?date=2026-11-20')
    reply(200, { data: { id: 'o1' } })
    await expect(restaurantShopApi.placeOrder([{ product_id: 'p1', quantity: 2, unit: 'full', quality: 'A' }], { urgent_delivery: true })).resolves.toEqual({ id: 'o1' })
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ items: [{ product_id: 'p1', quantity: 2, unit: 'full', quality: 'A' }], urgent_delivery: true }) })
    reply(200, { plain: true }); await expect(restaurantShopApi.getMe()).resolves.toEqual({ plain: true })
    reply(200, { data: { base_charge: 0 } }); await expect(restaurantShopApi.getDelivery()).resolves.toEqual({ base_charge: 0 })
    reply(200, { data: [] }); await restaurantShopApi.getOrders()
  })

  it("a failure carries the server's message and status; 401 ends the restaurant session", async () => {
    reply(401, { message: 'Session expired' })
    await expect(restaurantShopApi.getOrders()).rejects.toMatchObject({ message: 'Session expired', status: 401 })
    expect(handlePortalAuthFailure).toHaveBeenCalledWith(401, '/restaurant/orders', '/restaurant/login', expect.any(Function))
    reply(500)
    await expect(restaurantShopApi.getMe()).rejects.toMatchObject({ message: 'Request failed', status: 500 })
  })

  it('front photo upload: multipart (no JSON header), token kept; a failure says so', async () => {
    reply(200, { data: { front_image_url: '/u/front.jpg' } })
    const file = new File(['x'], '', { type: 'image/jpeg' })
    await expect(restaurantShopApi.uploadFrontImage(file)).resolves.toEqual({ front_image_url: '/u/front.jpg' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/restaurant/profile/front-image')
    expect(init.headers).toEqual({ Authorization: 'Bearer rtok' })
    expect((init.body as FormData).get('image')).toBeTruthy()
    mockToken.value = null
    reply(413)
    await expect(restaurantShopApi.uploadFrontImage(file)).rejects.toMatchObject({ message: 'Upload failed', status: 413 })
    expect(fetchMock.mock.calls[1][1].headers).toEqual({})
  })
})
