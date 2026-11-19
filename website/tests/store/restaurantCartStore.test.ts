// W17 (round 10): the restaurant (B2B) cart — one line per product + quality +
// unit, quantities add up, zero removes, money rounded to paisa, delivery
// free from the restaurant's limit. I22: the restaurant's delivery charge of 0
// (free delivery) was shown as Rs 100 — the server bills 0.
jest.mock('@/lib/restaurantApi', () => ({ restaurantShopApi: { getDelivery: jest.fn() } }))

import { useRestaurantCartStore } from '@/store/restaurantCartStore'

/* eslint-disable @typescript-eslint/no-require-imports */
const { restaurantShopApi } = require('@/lib/restaurantApi')

const product = (id: string) => ({ id, name: id } as never)
const line = (id: string, quantity: number, unitPrice: number, quality = 'A', unit = 'full') =>
  ({ product: product(id), quantity, unitPrice, quality, unit } as never)
const cart = () => useRestaurantCartStore.getState()

beforeEach(() => {
  useRestaurantCartStore.setState({ items: [], deliveryBaseCharge: 100, deliveryFreeThreshold: 2000 })
})

describe('restaurant cart', () => {
  it('same product + quality + unit adds up; another quality is its own line', () => {
    cart().addItem(line('p1', 2, 100))
    cart().addItem(line('p1', 3, 100))
    cart().addItem(line('p1', 1, 80, 'B'))
    expect(cart().items).toHaveLength(2)
    expect(cart().getTotalItems()).toBe(6)
  })

  it('quantity changes; zero removes the line; clear empties', () => {
    cart().addItem(line('p1', 2, 100))
    cart().addItem(line('p2', 1, 50))
    cart().updateQuantity('p1', 'A' as never, 'full' as never, 5)
    expect(cart().items[0].quantity).toBe(5)
    cart().updateQuantity('p1', 'A' as never, 'full' as never, 0)
    expect(cart().items.map((i) => i.product.id)).toEqual(['p2'])
    cart().removeItem('p2', 'A' as never, 'full' as never)
    expect(cart().items).toEqual([])
    cart().addItem(line('p3', 1, 10))
    cart().clearCart()
    expect(cart().items).toEqual([])
  })

  it('money to the paisa; delivery charged below the limit, free from it; an empty cart pays nothing', () => {
    expect(cart().getDeliveryCharge()).toBe(0)
    cart().addItem(line('p1', 3, 33.335))
    expect(cart().getSubtotal()).toBe(100.01)
    expect(cart().getDeliveryCharge()).toBe(100)
    expect(cart().getFinalTotal()).toBe(200.01)
    cart().addItem(line('p2', 1, 1900))
    expect(cart().getDeliveryCharge()).toBe(0)
  })

  it("the restaurant's own delivery settings; a broken answer keeps the defaults", async () => {
    restaurantShopApi.getDelivery.mockResolvedValueOnce({ base_charge: 150, free_delivery_threshold: 5000 })
    await cart().loadDeliverySettings()
    expect(cart()).toMatchObject({ deliveryBaseCharge: 150, deliveryFreeThreshold: 5000 })
    restaurantShopApi.getDelivery.mockResolvedValueOnce({})
    await cart().loadDeliverySettings()
    expect(cart()).toMatchObject({ deliveryBaseCharge: 100, deliveryFreeThreshold: 2000 })
    restaurantShopApi.getDelivery.mockRejectedValueOnce(new Error('down'))
    await cart().loadDeliverySettings()
    expect(cart()).toMatchObject({ deliveryBaseCharge: 100, deliveryFreeThreshold: 2000 })
  })

  it('a delivery charge of 0 stays 0 — free delivery, as the server bills (I22)', async () => {
    restaurantShopApi.getDelivery.mockResolvedValueOnce({ base_charge: 0, free_delivery_threshold: 2000 })
    await cart().loadDeliverySettings()
    cart().addItem(line('p1', 1, 500))
    expect(cart().getDeliveryCharge()).toBe(0)
  })
})
