// Shapes the checkout page shares with its parts (W21 split).
export type CheckoutDay = 'today' | 'tomorrow'

export interface CheckoutSlot {
  id: string
  slot_name: string
  start_time: string
  end_time: string
  is_free_delivery_slot: boolean
  available_slots: number
}

export interface UrgentInfo {
  charge: number
  eta: string
  enabled: boolean
}

export interface AppliedCoupon {
  code: string
  discount_type: string
  discount_amount: number
  free_delivery: boolean
  summary: string
}

export interface PlacedOrder {
  id: string
  order_number?: string | null
  total_amount?: number | null
}
