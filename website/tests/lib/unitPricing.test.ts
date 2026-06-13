// ============================================================================
// UNIT PRICING TESTS (storefront purchase-funnel money math)
// Mirrors the server's pricing so the price a customer sees per unit matches
// what the backend charges. Covers kg/dozen fraction units, admin overrides,
// derived fallbacks, and line-price resolution.
// ============================================================================

import type { Product, ProductUnit } from '@/types'
import {
  getUnitOptions,
  priceForUnit,
  resolveLineUnitPrice,
} from '@/lib/unitPricing'

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: 'p1',
    name: 'Test Product',
    nameUrdu: '',
    description: '',
    price: 100,
    unit: 'kg',
    category: 'vegetables',
    stock: 10,
    isFresh: true,
    tags: [],
    categoryId: 'c1',
    ...overrides,
  } as unknown as Product
}

describe('getUnitOptions', () => {
  it('returns full + half + quarter for kg products, deriving prices', () => {
    const opts = getUnitOptions(makeProduct({ unit: 'kg', price: 200 }))
    expect(opts.map((o) => o.unit)).toEqual(['full', 'half_kg', 'quarter_kg'])
    expect(opts[0].price).toBe(200)
    expect(opts[1].price).toBe(100) // derived 0.5
    expect(opts[2].price).toBe(50) // derived 0.25
    expect(opts[1].derived).toBe(true)
  })

  it('honours admin half/quarter kg overrides', () => {
    const opts = getUnitOptions(
      makeProduct({ unit: 'kg', price: 200, halfKgPrice: 120, quarterKgPrice: 70 })
    )
    expect(opts[1].price).toBe(120)
    expect(opts[1].derived).toBe(false)
    expect(opts[2].price).toBe(70)
    expect(opts[2].derived).toBe(false)
  })

  it('returns full + half dozen for dozen products', () => {
    const opts = getUnitOptions(makeProduct({ unit: 'dozen', price: 300 }))
    expect(opts.map((o) => o.unit)).toEqual(['full', 'half_dozen'])
    expect(opts[1].price).toBe(150)
  })

  it('returns a single option for piece/liter/pack products', () => {
    const opts = getUnitOptions(makeProduct({ unit: 'piece', price: 80 }))
    expect(opts).toHaveLength(1)
    expect(opts[0].unit).toBe('full')
  })

  it('returns no options when price is missing/zero', () => {
    expect(getUnitOptions(makeProduct({ price: 0 }))).toEqual([])
  })
})

describe('priceForUnit', () => {
  const product = makeProduct({ unit: 'kg', price: 200, halfKgPrice: 120 })

  it('returns the override price for the chosen unit', () => {
    expect(priceForUnit(product, 'half_kg')).toBe(120)
  })

  it('returns the base price for the full unit', () => {
    expect(priceForUnit(product, 'full')).toBe(200)
  })

  it('falls back to base price for an unavailable unit', () => {
    // dozen unit on a kg product → unit not present, falls back to product.price
    expect(priceForUnit(product, 'half_dozen' as ProductUnit)).toBe(200)
  })
})

describe('resolveLineUnitPrice', () => {
  const product = makeProduct({ unit: 'kg', price: 200, halfKgPrice: 120 })

  it('prefers a stored positive line price', () => {
    expect(resolveLineUnitPrice({ product, unit: 'half_kg', unitPrice: 99 })).toBe(99)
  })

  it('falls back to unit pricing when no stored price', () => {
    expect(resolveLineUnitPrice({ product, unit: 'half_kg' })).toBe(120)
  })

  it('ignores a zero/invalid stored price', () => {
    expect(resolveLineUnitPrice({ product, unit: 'full', unitPrice: 0 })).toBe(200)
  })
})
