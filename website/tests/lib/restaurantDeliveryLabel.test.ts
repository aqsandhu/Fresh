import { restaurantDeliveryLabel } from '@freshbazar/shared-types'

// Session 10: the restaurant's "My Orders" showed only when an order was
// placed — never the day and slot it was booked for.
describe('restaurantDeliveryLabel', () => {
  it('day + slot window in 12-hour time', () => {
    expect(
      restaurantDeliveryLabel({ requested_delivery_date: '2026-11-21', slot_start: '10:00', slot_end: '12:00' })
    ).toBe('Sat, 21 Nov · 10:00 AM – 12:00 PM')
  })

  it('midnight and late evening read correctly', () => {
    expect(restaurantDeliveryLabel({ requested_delivery_date: null, slot_start: '00:00', slot_end: '23:59' }))
      .toBe('12:00 AM – 11:59 PM')
  })

  it('a date with no slot (urgent) still shows the day; nothing known → null', () => {
    expect(restaurantDeliveryLabel({ requested_delivery_date: '2026-11-20', slot_start: null, slot_end: null })).toBe('Fri, 20 Nov')
    expect(restaurantDeliveryLabel({ requested_delivery_date: null, slot_start: null, slot_end: null })).toBeNull()
  })
})
