// W17 (round 10): small website helpers — image hosts, money / unit text,
// order status names, the restaurant price rules (mirror of the server), and
// the GPS search (locks only on a delivery-grade fix, can be stopped, keeps
// trying on weak signal, stops on a refused permission).
import { cn, resolveImageUrl, formatPriceShort, formatProductUnitSuffix, getOrderStatusColor, getOrderStatusLabel, formatSlotTime, formatSlotTimeRange, formatDate } from '@/lib/utils'
import { qualityBasePrice, qualityStock, availableQualities, explicitRestaurantFractionPrice, unitPrice, round2, money, type RestaurantProduct } from '@/lib/restaurantPricing'
import { getAccuratePosition, REQUIRED_LOCATION_ACCURACY_M } from '@/lib/geolocation'

describe('utils', () => {
  it('image paths: relative and old local / LAN hosts go to the backend; real hosts, data and // are kept', () => {
    const host = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '')
    expect(resolveImageUrl(null)).toBe('')
    expect(resolveImageUrl('/uploads/a.jpg')).toBe(`${host}/uploads/a.jpg`)
    expect(resolveImageUrl('uploads/a.jpg')).toBe(`${host}/uploads/a.jpg`)
    expect(resolveImageUrl('http://localhost:3000/uploads/a.jpg')).toBe(`${host}/uploads/a.jpg`)
    expect(resolveImageUrl('http://192.168.1.5:3000/uploads/a.jpg')).toBe(`${host}/uploads/a.jpg`)
    expect(resolveImageUrl('https://cdn.freshbazar.pk/a.jpg')).toBe('https://cdn.freshbazar.pk/a.jpg')
    expect(resolveImageUrl('data:image/png;base64,x')).toBe('data:image/png;base64,x')
    expect(resolveImageUrl('//cdn.x/a.jpg')).toBe('//cdn.x/a.jpg')
  })

  it('money and unit text', () => {
    expect(formatPriceShort(1234)).toBe('Rs. 1,234')
    expect(formatPriceShort(1234.5)).toBe('Rs. 1,234.50')
    expect(formatPriceShort(-50)).toBe('Rs. -50')
    expect(formatPriceShort(NaN)).toBe('Rs. 0')
    expect(formatProductUnitSuffix(' kg ')).toBe('/kg')
    expect(formatProductUnitSuffix('')).toBe('')
    expect(cn('a', false && 'b', 'p-2', 'p-4')).toBe('a p-4')
  })

  it('order status names and colours (the pages pass the display status)', () => {
    expect(getOrderStatusLabel('out-for-delivery')).toBe('Out for Delivery')
    expect(getOrderStatusLabel('received')).toBe('Order Placed')
    expect(getOrderStatusLabel('mystery')).toBe('mystery')
    expect(getOrderStatusColor('delivered')).toContain('green')
    expect(getOrderStatusColor('mystery')).toContain('gray')
  })

  it('slot times read Postgres TIME and ISO forms', () => {
    const t = formatSlotTime('14:30:00')
    expect(t).toMatch(/2:30|14:30/)
    expect(formatSlotTime('1970-01-01T09:05:00.000Z')).toMatch(/9:05|09:05/)
    expect(formatSlotTimeRange('09:00', '12:00')).toMatch(/ - /)
    expect(formatDate('2026-11-19T10:00:00Z')).toMatch(/2026/)
  })
})

describe('restaurant prices (mirror of the server)', () => {
  const onion: RestaurantProduct = {
    id: 'p1', name_en: 'Onion', price: 160, restaurant_price_a: 140, restaurant_enabled_a: true,
    price_b: '120', restaurant_price_b: null, price_c: null,
    restaurant_half_kg_price_a: 65, stock_quantity: 50, stock_quantity_b: '7' as unknown as number,
  }

  it('the restaurant pays its own price, else the shop price of that quality; a tier without a shop price is not offered', () => {
    expect(qualityBasePrice(onion, 'A')).toBe(140)
    expect(qualityBasePrice(onion, 'B')).toBe(120)
    expect(qualityBasePrice(onion, 'C')).toBeNull()
    expect(availableQualities(onion)).toEqual(['A', 'B'])
    expect(availableQualities({ ...onion, restaurant_enabled_a: false })).toEqual(['B'])
  })

  it('an explicit fraction price wins; otherwise half / quarter of the base', () => {
    expect(explicitRestaurantFractionPrice(onion, 'A', 'half_kg')).toBe(65)
    expect(unitPrice(onion, 'A', 'half_kg')).toBe(65)
    expect(unitPrice(onion, 'A', 'quarter_kg')).toBe(35)
    expect(unitPrice(onion, 'B', 'half_kg')).toBe(60)
    expect(unitPrice({ ...onion, unit_type: 'dozen' }, 'A', 'half_dozen')).toBe(70)
    expect(unitPrice(onion, 'C', 'full')).toBeNull()
    expect(explicitRestaurantFractionPrice(onion, 'A', 'full')).toBeNull()
  })

  it('stock per quality and money text', () => {
    expect(qualityStock(onion, 'A')).toBe(50)
    expect(qualityStock(onion, 'B')).toBe(7)
    expect(qualityStock(onion, 'C')).toBe(0)
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(money(1500)).toMatch(/^Rs\. 1,?500$/)
  })
})

describe('GPS search', () => {
  type Ok = (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void
  type Err = (e: { code: number; PERMISSION_DENIED: number }) => void
  let watchers: Array<{ ok: Ok; err: Err }>
  const clearWatch = jest.fn()

  beforeEach(() => {
    jest.useFakeTimers()
    watchers = []
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (ok: Ok, err: Err) => { watchers.push({ ok, err }); return watchers.length },
        clearWatch,
      },
    })
  })
  afterEach(() => jest.useRealTimers())

  const fix = (accuracy: number, w = watchers[watchers.length - 1]) =>
    w.ok({ coords: { latitude: 32.5, longitude: 74.0, accuracy } })

  it('weak fixes are only progress; a delivery-grade fix locks', async () => {
    const progress = jest.fn()
    const p = getAccuratePosition({ onProgress: progress })
    fix(80)
    fix(40)
    fix(90) // worse — not reported
    expect(progress.mock.calls.map((c) => c[0].accuracy)).toEqual([80, 40])
    fix(REQUIRED_LOCATION_ACCURACY_M)
    await expect(p).resolves.toEqual({ status: 'locked', position: { lat: 32.5, lng: 74.0, accuracy: REQUIRED_LOCATION_ACCURACY_M } })
    expect(clearWatch).toHaveBeenCalled()
  })

  it('stopping returns the best fix so far; a refused permission ends the search', async () => {
    const ctrl = new AbortController()
    const p = getAccuratePosition({ signal: ctrl.signal })
    fix(55)
    ctrl.abort()
    await expect(p).resolves.toEqual({ status: 'cancelled', best: { lat: 32.5, lng: 74.0, accuracy: 55 } })
    const q = getAccuratePosition()
    watchers[watchers.length - 1].err({ code: 1, PERMISSION_DENIED: 1 })
    await expect(q).resolves.toEqual({ status: 'denied' })
  })

  it('a timeout re-opens the watch (never gives up on its own); an already-stopped search ends at once', async () => {
    const p = getAccuratePosition()
    const before = watchers.length
    watchers[watchers.length - 1].err({ code: 3, PERMISSION_DENIED: 1 })
    jest.advanceTimersByTime(1000)
    expect(watchers.length).toBe(before + 1)
    jest.advanceTimersByTime(20000) // plateau → fresh watch
    expect(watchers.length).toBe(before + 2)
    fix(10)
    await expect(p).resolves.toMatchObject({ status: 'locked' })
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(getAccuratePosition({ signal: ctrl.signal })).resolves.toEqual({ status: 'cancelled', best: null })
  })

  it('no GPS on the device', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
    await expect(getAccuratePosition()).resolves.toEqual({ status: 'unsupported' })
  })
})
