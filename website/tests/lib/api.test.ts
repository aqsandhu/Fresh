// W17 (round 10): the website's HTTP client end to end (a fake network
// adapter, the real interceptors): headers, product / category mapping (what
// the cart prices from), the city on every catalogue call, each endpoint's
// URL and body, and what a 401 does on account vs public pages (H7).
jest.mock('@/lib/apiBase', () => ({ ABSOLUTE_API_URL: 'https://api.test/api', getApiBaseUrl: () => '/api' }))
const mockCity = { id: 'city-1' as string | null }
jest.mock('@/lib/cityStorage', () => ({ getSelectedCityId: () => mockCity.id }))
jest.mock('@/lib/authConfig', () => ({ usesHttpOnlyCookies: () => false }))
const mockTokens = { access: 'tok' as string | null }
jest.mock('@/lib/secureTokens', () => ({ getAccessToken: () => mockTokens.access, clearTokens: jest.fn() }))
const mockRefresh = jest.fn()
const mockStillSignedIn = { value: false }
jest.mock('@/lib/tokenRefresh', () => ({ refreshWebsiteAccessToken: () => mockRefresh(), hasRefreshableSession: () => mockStillSignedIn.value }))
const mockLogout = jest.fn()
jest.mock('@/store/cartStore', () => ({ useAuthStore: { getState: () => ({ logout: mockLogout }) } }))

import type { InternalAxiosRequestConfig } from 'axios'
import api, {
  productsApi, categoriesApi, authApi, notificationsApi, ordersApi, cartApi, myCouponsApi, chatApi, reviewsApi,
  complaintsApi, workAsRiderApi, restaurantApi, tipsApi, settingsApi, marketingApi, addressesApi, attaChakkiApi,
  bannerApi, aiChatApi, franchiseApi, basketApi, serviceAreaApi, nextProductPage,
} from '@/lib/api'

type Reply = { status: number; data?: unknown }
let replies: Reply[]
const seen: InternalAxiosRequestConfig[] = []

beforeEach(() => {
  replies = []
  seen.length = 0
  mockCity.id = 'city-1'
  mockTokens.access = 'tok'
  mockStillSignedIn.value = false
  mockRefresh.mockReset()
  mockLogout.mockReset()
  window.history.replaceState({}, '', '/')
  api.defaults.adapter = async (config) => {
    seen.push(config)
    const r = replies.shift() ?? { status: 200, data: { success: true, data: {} } }
    const response = { data: r.data, status: r.status, statusText: '', headers: {}, config }
    if (r.status >= 400) {
      const err: any = new Error(`status ${r.status}`)
      err.config = config
      err.response = response
      err.isAxiosError = true
      throw err
    }
    return response
  }
})

const last = () => seen[seen.length - 1]
const body = (c = last()) => (typeof c.data === 'string' ? JSON.parse(c.data) : c.data)

describe('requests', () => {
  it('say they are the website and carry the token; a FormData upload drops the JSON content type', async () => {
    await authApi.getProfile()
    expect(last().headers['X-Client-Platform']).toBe('website')
    expect(last().headers.Authorization).toBe('Bearer tok')
    const door = new File(['x'], 'door.jpg', { type: 'image/jpeg' })
    await addressesApi.createWithDoorPicture({ full_address: 'House 5', latitude: 32.5 }, door)
    expect(last().headers['Content-Type']).not.toBe('application/json')
    expect((last().data as FormData).get('latitude')).toBe('32.5')
    await addressesApi.updateWithDoorPicture('a1', { landmark: 'mosque' }, door)
    expect(last().url).toBe('/addresses/a1')
    expect((last().data as FormData).get('door_picture')).toBeInstanceOf(File)
  })
})

describe('catalogue mapping', () => {
  const raw = {
    id: 'p1', name_en: 'Aloo', name_ur: 'آلو', price: '100', compare_at_price: '120', unit_type: 'kg',
    category_slug: 'veg', category_id: 'c-veg', primary_image: '/uploads/aloo.jpg', stock_quantity: '0',
    price_b: '80', stock_quantity_b: '5', price_c: '0', half_kg_price: '0', quarter_kg_price: '30',
    half_kg_price_b: '45', allow_quarter_kg: false, qualifies_for_free_delivery: true, is_variable_weight: true,
  }

  it('maps a product the way the cart prices it', async () => {
    replies.push({ status: 200, data: { data: [raw], meta: { page: 1, totalPages: 2 } } })
    const { products, meta } = await productsApi.getAll({ category: 'veg' })
    expect(last().params).toEqual({ category: 'veg', city_id: 'city-1' })
    const p = products[0]
    expect(p).toMatchObject({
      name: 'Aloo', nameUrdu: 'آلو', price: 100, compareAtPrice: 120, unit: 'kg', category: 'veg', categoryId: 'c-veg',
      image: 'https://api.test/uploads/aloo.jpg',
      stock: 0, inStock: true, // A is out, but B is priced and in stock
      priceB: 80, priceC: null, // a 0 price is "not offered", never Rs 0
      halfKgPrice: null, quarterKgPrice: 30, halfKgPriceB: 45,
      allowHalfKg: true, allowQuarterKg: false, qualifiesForFreeDelivery: true, isVariableWeight: true,
    })
    expect(meta.totalPages).toBe(2)
  })

  it('image references: absolute kept, placeholder hosts dropped, data URLs kept, none → undefined', async () => {
    replies.push({ status: 200, data: { data: [
      { id: 'a', price: 1, image_url: 'https://cdn.x/a.jpg' },
      { id: 'b', price: 1, primary_image: 'https://example.com/b.jpg' },
      { id: 'c', price: 1, primary_image: 'data:image/png;base64,xx' },
      { id: 'd', price: 1, primary_image: 'uploads/d.jpg' },
      { id: 'e', price: 1, compare_at_price: 1 },
    ] } })
    const { products } = await productsApi.getAll()
    expect(products.map((p: any) => p.image)).toEqual(['https://cdn.x/a.jpg', undefined, 'data:image/png;base64,xx', 'https://api.test/uploads/d.jpg', undefined])
    expect(products[4].compareAtPrice).toBeUndefined() // not above the price → no strike-through
  })

  it('without a chosen city no city is sent', async () => {
    mockCity.id = null
    replies.push({ status: 200, data: { data: [] } })
    await productsApi.getAll()
    expect(last().params).toEqual({})
  })

  it('nextProductPage pages until the last page', () => {
    expect(nextProductPage({ page: 1, totalPages: 3 })).toBe(2)
    expect(nextProductPage({ page: '3', totalPages: '3' })).toBeUndefined()
    expect(nextProductPage({ page: 1, total: 100, limit: 48 })).toBe(2)
    expect(nextProductPage(undefined)).toBeUndefined()
  })

  it('other product / category reads', async () => {
    replies.push(
      { status: 200, data: { data: raw } },
      { status: 200, data: raw },
      { status: 200, data: { data: [raw] } },
      { status: 200, data: { data: [raw], meta: { page: 1 } } },
      { status: 200, data: { data: [raw] } },
      { status: 200, data: { data: [raw], meta: {} } },
      { status: 200, data: { data: [{ id: 'c1', name_en: 'Veg', slug: 'veg', product_count: '12', icon_url: '/i.png' }] } },
      { status: 200, data: { data: { id: 'c1', name_en: 'Veg', slug: 'veg', subcategories: [{ id: 's1', name_en: 'Leafy' }] } } },
    )
    expect((await productsApi.getById('p1')).name).toBe('Aloo')
    expect((await productsApi.getBySlug('aloo')).name).toBe('Aloo')
    expect(await productsApi.search('alo')).toHaveLength(1)
    expect((await productsApi.getFeaturedPage(2, 12)).products).toHaveLength(1)
    expect(last().params).toEqual({ page: 2, limit: 12, city_id: 'city-1' })
    expect(await productsApi.getByIds(['p1', 'p1', 'p2'], 'city-9')).toHaveLength(1)
    expect(last().params).toEqual({ ids: 'p1,p2', city_id: 'city-9', limit: 100 })
    expect((await productsApi.getByCategory('veg', { page: 2 })).products).toHaveLength(1)
    const cats = await categoriesApi.getAll()
    expect(cats[0]).toMatchObject({ name: 'Veg', productCount: 12, image: 'https://api.test/i.png' })
    expect(((await categoriesApi.getBySlug('veg')) as any).subcategories[0].name).toBe('Leafy')
    await expect(productsApi.getByIds([], 'x')).resolves.toEqual([])
  })
})

describe('endpoints send the right thing', () => {
  it.each([
    ['send OTP', () => authApi.sendOtp('03001234567', 'sms'), 'post', '/auth/send-otp', { phone: '03001234567', channel: 'sms' }],
    ['verify login with code', () => authApi.verifyLoginWithCode('0300', '123789'), 'post', '/auth/verify-login', { phone: '0300', code: '123789' }],
    ['register with code', () => authApi.verifyRegisterWithCode({ phone: '0300', code: '1', full_name: 'Ali' }), 'post', '/auth/verify-register', { phone: '0300', code: '1', full_name: 'Ali' }],
    ['delete account', () => authApi.deleteAccount('4826'), 'post', '/auth/delete-account', { pin: '4826' }],
    ['set PIN with current', () => authApi.setPin('4826', '1111'), 'post', '/auth/set-pin', { pin: '4826', current_pin: '1111' }],
    ['verify PIN', () => authApi.verifyPin('0300', '4826'), 'post', '/auth/verify-pin', { phone: '0300', pin: '4826' }],
    ['reset PIN with code', () => authApi.resetPinWithCode('0300', '1', '4826'), 'post', '/auth/reset-pin', { phone: '0300', code: '1', newPin: '4826' }],
    ['update profile', () => authApi.updateProfile({ full_name: 'Ali' }), 'put', '/auth/profile', { full_name: 'Ali' }],
    ['create order', () => ordersApi.create({ address_id: 'a1', payment_method: 'cod' }), 'post', '/orders', { address_id: 'a1', payment_method: 'cod' }],
    ['cancel order (default reason)', () => ordersApi.cancel('o1'), 'put', '/orders/o1/cancel', { reason: 'Cancelled by customer' }],
    ['apply coupon', () => cartApi.applyCoupon('EID10'), 'post', '/cart/apply-coupon', { code: 'EID10' }],
    ['sync cart (with the city)', () => cartApi.sync([{ product_id: 'p1', quantity: 2 }]), 'post', '/cart/sync', { city_id: 'city-1', items: [{ product_id: 'p1', quantity: 2 }] }],
    ['chat message', () => chatApi.sendMessage('o1', 'where?'), 'post', '/chat/o1', { message: 'where?' }],
    ['review', () => reviewsApi.submit({ orderId: 'o1', targetType: 'product', targetId: 'p1', rating: 5 } as any), 'post', '/reviews', { orderId: 'o1', targetType: 'product', targetId: 'p1', rating: 5 }],
    ['report review', () => reviewsApi.report('r1', 'spam'), 'post', '/reviews/r1/report', { reason: 'spam' }],
    ['restaurant login', () => restaurantApi.login({ phone: '0300', pin: '4826' }), 'post', '/restaurant/login', { phone: '0300', pin: '4826' }],
    ['atta request cancel', () => attaChakkiApi.cancelRequest('at1', 'changed mind'), 'put', '/atta-requests/at1/cancel', { reason: 'changed mind' }],
    ['franchise inquiry', () => franchiseApi.submitInquiry({ name: 'A', phone: '0300', city: 'Gujrat' } as any), 'post', '/franchise/inquiries', { name: 'A', phone: '0300', city: 'Gujrat' }],
    ['update address', () => addressesApi.update('a1', { landmark: 'mosque' } as any), 'put', '/addresses/a1', { landmark: 'mosque' }],
  ] as const)('%s', async (_name, run, method, url, sent) => {
    await (run as () => Promise<unknown>)()
    expect(last().method).toBe(method)
    expect(last().url).toBe(url)
    expect(body()).toEqual(sent)
  })

  it.each([
    ['PIN status', () => authApi.pinStatus('0300'), '/auth/pin-status', { phone: '0300' }],
    ['orders page (defaults)', () => ordersApi.getPage(), '/orders', { page: 1, limit: 20 }],
    ['my coupons (city)', () => myCouponsApi.list(), '/coupons/mine', { city_id: 'city-1' }],
    ['tips for a page (city)', () => tipsApi.forPage('checkout'), '/tips', { page: 'checkout', city_id: 'city-1' }],
    ['time slots for a date (city)', () => settingsApi.getTimeSlots('2026-11-20'), '/orders/time-slots', { date: '2026-11-20', city_id: 'city-1' }],
    ['delivery settings (city)', () => settingsApi.getDeliverySettings(), '/site-settings/delivery', { city_id: 'city-1' }],
    ['banner (city)', () => bannerApi.getSettings(), '/site-settings/banner', { city_id: 'city-1' }],
    ['baskets (city)', () => basketApi.getAll(), '/site-settings/baskets', { city_id: 'city-1' }],
  ] as const)('%s reads with the right query', async (_name, run, url, params) => {
    await (run as () => Promise<unknown>)()
    expect(last().url).toBe(url)
    expect(last().params).toEqual(params)
  })

  it('answers are unwrapped with safe defaults', async () => {
    replies.push(
      { status: 200, data: { data: { notifications: [{ id: 'n1' }], unreadCount: 3 } } },
      { status: 200, data: { data: { orders: [{ id: 'o1' }], pagination: { page: 2, totalPages: 5, total: 90 } } } },
      { status: 200, data: { data: [{ id: 'o2' }] } },
      { status: 200, data: { data: { items: 'oops' } } },
      { status: 200, data: { data: { service_charge: '50', milling_charge_per_kg: '7.5', delivery_charge: null, free_delivery_threshold_kg: '20' } } },
      { status: 200, data: { data: { enabled: 1, polygons: 'bad' } } },
      { status: 200, data: { data: null } },
    )
    expect(await notificationsApi.getAll()).toEqual({ notifications: [{ id: 'n1' }], unreadCount: 3 })
    expect((await ordersApi.getPage({ page: 2 })).pagination).toEqual({ page: 2, totalPages: 5, total: 90 })
    expect(await ordersApi.getAll()).toEqual([{ id: 'o2' }])
    expect(await cartApi.getSaved()).toEqual([])
    expect(await attaChakkiApi.getCharges()).toEqual({ serviceCharge: 50, millingChargePerKg: 7.5, deliveryCharge: 0, freeDeliveryThresholdKg: 20 })
    expect(await serviceAreaApi.get()).toEqual({ enabled: true, polygons: [], message: { title: '', message_en: '', message_ur: '', whatsapp: '' } })
    expect(await reviewsApi.forProduct('p1')).toEqual({ summary: { average: 0, count: 0 }, reviews: [] })
  })

  it('a complaint with photos goes as a form (max 5), without photos as JSON', async () => {
    const photos = Array.from({ length: 7 }, (_, i) => new File(['x'], `${i}.jpg`, { type: 'image/jpeg' }))
    await complaintsApi.file({ subject: 'Late', message: 'Two hours late', category: 'delivery', orderId: 'o1', images: photos })
    const fd = last().data as FormData
    expect(fd.getAll('images')).toHaveLength(5)
    expect(fd.get('orderId')).toBe('o1')
    expect(last().params).toEqual({ city_id: 'city-1' })
    await complaintsApi.file({ subject: 'Late', message: 'Two hours late', images: [] })
    expect(body()).toEqual({ subject: 'Late', message: 'Two hours late' })
  })

  it('a failed cart snapshot never breaks shopping; the socket token is null on failure', async () => {
    replies.push({ status: 500, data: {} }, { status: 401, data: {} })
    mockRefresh.mockResolvedValue(false)
    await expect(marketingApi.snapshotCart({ deviceId: 'd', items: [], subtotal: 0 })).resolves.toBeUndefined()
    await expect(authApi.getSocketToken()).resolves.toBeNull()
  })

  it('misc reads and writes', async () => {
    await workAsRiderApi.getContent()
    await workAsRiderApi.apply({ fullName: 'A', phone: '0300' } as any)
    expect(last().params).toEqual({ city_id: 'city-1' })
    await restaurantApi.register({ businessName: 'Dhaba', phone: '0300', pin: '4826' } as any)
    await aiChatApi.getStatus()
    await aiChatApi.sendMessage([{ role: 'user', content: 'hi' }], '/checkout')
    await settingsApi.getPublicConfig()
    await addressesApi.getAll()
    await addressesApi.create({ full_address: 'x' })
    await addressesApi.delete('a1')
    await attaChakkiApi.getRequests()
    await attaChakkiApi.getRequestById('at1')
    await attaChakkiApi.createRequest({ wheat_quantity_kg: 20 } as any)
    await notificationsApi.markAsRead('n1')
    await notificationsApi.markAllAsRead()
    await myCouponsApi.markSeen()
    await cartApi.removeCoupon()
    await cartApi.clear()
    await chatApi.getMessages('o1')
    await reviewsApi.forOrder('o1')
    await reviewsApi.mine()
    await complaintsApi.mine()
    await ordersApi.getById('o1')
    await ordersApi.track('o1')
    expect(seen.map((c) => `${c.method} ${c.url}`)).toEqual(expect.arrayContaining([
      'post /work-as-rider/apply', 'post /restaurant/register', 'post /ai-chat/message', 'delete /addresses/a1', 'get /atta-requests/at1',
      'patch /notifications/read-all', 'delete /cart/clear', 'get /orders/track/o1',
    ]))
  })
})

describe('401: refresh, then account pages vs public pages (H7)', () => {
  it('a refreshed session retries the call with the new token', async () => {
    mockRefresh.mockImplementation(async () => { mockTokens.access = 'fresh'; return true })
    replies.push({ status: 401, data: {} }, { status: 200, data: { success: true, data: { id: 'u1' } } })
    await authApi.getProfile()
    expect(seen).toHaveLength(2)
    expect(seen[1].headers.Authorization).toBe('Bearer fresh')
  })

  it('a dead session on an account page goes to /login with the way back', async () => {
    window.history.replaceState({}, '', '/orders')
    mockRefresh.mockResolvedValue(false)
    replies.push({ status: 401, data: {} })
    jest.spyOn(console, 'error').mockImplementation(() => undefined) // jsdom: navigation not implemented
    await expect(ordersApi.getAll()).rejects.toBeTruthy()
    expect(mockLogout).toHaveBeenCalled()
  })

  it('a dead session on a public page carries on as a guest; a wrong PIN changes nothing', async () => {
    mockRefresh.mockResolvedValue(false)
    replies.push({ status: 401, data: {} })
    await expect(cartApi.getSaved()).rejects.toBeTruthy()
    expect(mockLogout).toHaveBeenCalledTimes(1)
    mockLogout.mockReset()
    replies.push({ status: 401, data: { message: 'Wrong PIN' } })
    await expect(authApi.verifyPin('0300', '0000')).rejects.toBeTruthy()
    expect(mockLogout).not.toHaveBeenCalled()
  })

  it('the server still unreachable for the refresh keeps the session', async () => {
    mockStillSignedIn.value = true
    mockRefresh.mockResolvedValue(false)
    replies.push({ status: 401, data: {} })
    await expect(cartApi.getSaved()).rejects.toBeTruthy()
    expect(mockLogout).not.toHaveBeenCalled()
  })

  it('a refused refresh call itself ends the session', async () => {
    replies.push({ status: 401, data: {} })
    await expect(authApi.refreshToken('rt')).rejects.toBeTruthy()
    expect(mockLogout).toHaveBeenCalled()
  })
})
