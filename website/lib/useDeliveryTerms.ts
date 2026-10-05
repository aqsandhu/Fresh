'use client'

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useCityContext, useOptionalCityName } from '@/context/CityContext'

/**
 * One source of truth for the delivery facts quoted on the static info pages
 * (FAQ, Help, Shipping, Terms, About). Everything here is read from the
 * admin-configured settings and the live time-slot table for the selected
 * city, so the copy can never contradict the checkout.
 */
export interface DeliverySlot {
  id: string
  name: string
  /** "10:00 AM - 2:00 PM" */
  window: string
  isFreeDelivery: boolean
  isExpress: boolean
}

export interface DeliveryTerms {
  cityName: string
  /** Vegetables + fruits subtotal from which delivery is free. */
  freeDeliveryThreshold: number
  /** Flat delivery charge below the threshold. */
  baseCharge: number
  /** Urgent (on-demand, slot-less) delivery; disabled when charge is 0. */
  urgentEnabled: boolean
  urgentCharge: number
  urgentEta: string
  /** % of a today-slot's window that may elapse before it closes. */
  slotCutoffPercent: number
  slots: DeliverySlot[]
  freeSlot: DeliverySlot | null
  isLoading: boolean
}

export function formatSlotTime(time?: string | null): string {
  if (!time) return ''
  const [hStr, mStr = '00'] = time.split(':')
  const h = parseInt(hStr, 10)
  if (!Number.isFinite(h)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mStr.slice(0, 2)} ${period}`
}

const DEFAULTS = {
  free_delivery_threshold: 500,
  base_charge: 100,
  urgent_charge: 0,
  urgent_eta: '',
  slot_cutoff_percent: 60,
}

export function useDeliveryTerms(): DeliveryTerms {
  const { selectedCityId } = useCityContext()
  const cityName = useOptionalCityName()

  const settingsQuery = useQuery({
    queryKey: ['delivery-settings', selectedCityId],
    queryFn: async () => {
      const res = await api.get('/site-settings/delivery', {
        params: selectedCityId ? { city_id: selectedCityId } : {},
      })
      return { ...DEFAULTS, ...(res.data?.data || {}) } as typeof DEFAULTS
    },
    staleTime: 5 * 60 * 1000,
  })

  const slotsQuery = useQuery({
    queryKey: ['delivery-time-slots', selectedCityId],
    queryFn: async () => {
      const res = await api.get('/orders/time-slots', {
        params: selectedCityId ? { city_id: selectedCityId } : {},
      })
      const rows: Array<{
        id: string
        slot_name?: string
        start_time?: string
        end_time?: string
        is_free_delivery_slot?: boolean
        is_express_slot?: boolean
      }> = res.data?.data || []
      return rows.map<DeliverySlot>((s) => ({
        id: s.id,
        name: s.slot_name || `${formatSlotTime(s.start_time)} - ${formatSlotTime(s.end_time)}`,
        window: `${formatSlotTime(s.start_time)} - ${formatSlotTime(s.end_time)}`,
        isFreeDelivery: !!s.is_free_delivery_slot,
        isExpress: !!s.is_express_slot,
      }))
    },
    staleTime: 5 * 60 * 1000,
  })

  const s = settingsQuery.data ?? DEFAULTS
  const slots = slotsQuery.data ?? []
  const urgentCharge = Number(s.urgent_charge) || 0

  return {
    cityName,
    freeDeliveryThreshold: Number(s.free_delivery_threshold) || DEFAULTS.free_delivery_threshold,
    baseCharge: Number(s.base_charge) || DEFAULTS.base_charge,
    urgentEnabled: urgentCharge > 0,
    urgentCharge,
    urgentEta: String(s.urgent_eta || ''),
    slotCutoffPercent: Number(s.slot_cutoff_percent) || DEFAULTS.slot_cutoff_percent,
    slots,
    freeSlot: slots.find((x) => x.isFreeDelivery) ?? null,
    isLoading: settingsQuery.isLoading || slotsQuery.isLoading,
  }
}

/** "10:00 AM - 2:00 PM, 2:00 PM - 6:00 PM and 6:00 PM - 9:00 PM" */
export function listSlots(slots: DeliverySlot[]): string {
  const names = slots.map((x) => x.window)
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
