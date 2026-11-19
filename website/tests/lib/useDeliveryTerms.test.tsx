// W17 (round 10): the delivery facts quoted on the info pages (FAQ, Help,
// Shipping, Terms) — read for the selected city from the office settings and
// the live slots, so the copy never contradicts the checkout. I22: an office
// charge of 0 (free delivery) was quoted as Rs 100.
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('@/context/CityContext', () => ({
  useCityContext: () => ({ selectedCityId: 'c1' }),
  useOptionalCityName: () => 'Gujrat',
}))
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }))

import { formatSlotTime, listSlots, useDeliveryTerms } from '@/lib/useDeliveryTerms'

/* eslint-disable @typescript-eslint/no-require-imports */
const apiMod = require('@/lib/api')

const SLOTS = [
  { id: 's1', slot_name: 'Morning', start_time: '10:00:00', end_time: '14:00:00', is_free_delivery_slot: false },
  { id: 's2', start_time: '18:00', end_time: '21:30', is_free_delivery_slot: true, is_express_slot: true },
]
const serve = (settings: Record<string, unknown> | null) =>
  apiMod.default.get.mockImplementation(async (url: string) =>
    url === '/orders/time-slots' ? { data: { data: SLOTS } } : { data: { data: settings } })

const run = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(() => useDeliveryTerms(), { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> })
}

describe('delivery terms on the info pages', () => {
  it("the city's figures and slots (asked for this city)", async () => {
    serve({ base_charge: 150, free_delivery_threshold: 1000, urgent_charge: 250, urgent_eta: '45 min', slot_cutoff_percent: 50 })
    const { result } = run()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(apiMod.default.get).toHaveBeenCalledWith('/site-settings/delivery', { params: { city_id: 'c1' } })
    expect(result.current).toMatchObject({
      cityName: 'Gujrat', baseCharge: 150, freeDeliveryThreshold: 1000, urgentEnabled: true, urgentCharge: 250, urgentEta: '45 min', slotCutoffPercent: 50,
    })
    expect(result.current.slots.map((s) => s.name)).toEqual(['Morning', '6:00 PM - 9:30 PM'])
    expect(result.current.freeSlot).toMatchObject({ id: 's2', window: '6:00 PM - 9:30 PM', isExpress: true })
  })

  it('a charge of 0 is quoted as free (0), not Rs 100 (I22); no urgent charge = no urgent delivery', async () => {
    serve({ base_charge: 0, free_delivery_threshold: 0, urgent_charge: 0 })
    const { result } = run()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toMatchObject({ baseCharge: 0, freeDeliveryThreshold: 0, urgentEnabled: false })
  })

  it('settings missing → the defaults', async () => {
    serve(null)
    const { result } = run()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toMatchObject({ baseCharge: 100, freeDeliveryThreshold: 500, slotCutoffPercent: 60 })
  })

  it('time and list formatting', () => {
    expect(formatSlotTime('00:05')).toBe('12:05 AM')
    expect(formatSlotTime('12:00')).toBe('12:00 PM')
    expect(formatSlotTime('9')).toBe('9:00 AM')
    expect(formatSlotTime('x')).toBe('x')
    expect(formatSlotTime(null)).toBe('')
    const w = (window: string) => ({ id: window, name: window, window, isFreeDelivery: false, isExpress: false })
    expect(listSlots([])).toBe('')
    expect(listSlots([w('A')])).toBe('A')
    expect(listSlots([w('A'), w('B'), w('C')])).toBe('A, B and C')
  })
})
