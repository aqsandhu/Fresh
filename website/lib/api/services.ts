// Work as rider, restaurant, atta chakki, franchise — moved from api.ts (W21: only the place changed, not the behaviour).

import type { RestaurantInfo } from '@/lib/restaurantSession'
import { AttaChakkiRequest } from '@/types'
import { withCityParams, api } from './shared'

// Work-as-rider page (content + application)
export interface WorkAsRiderContent {
  intro: string
  benefits: string
  hours: string
  terms: string
}

export const workAsRiderApi = {
  getContent: async (): Promise<WorkAsRiderContent> => {
    const response = await api.get('/work-as-rider')
    return (response.data?.data || response.data) as WorkAsRiderContent
  },
  apply: async (input: {
    fullName: string
    phone: string
    city?: string
    area?: string
    vehicleType?: string
    message?: string
  }) => {
    const response = await api.post('/work-as-rider/apply', input, { params: withCityParams() })
    return response.data?.data || response.data
  },
}

// Restaurant (B2B) registration + PIN login. Snake_case keys match the backend
// validation schema exactly.
export const restaurantApi = {
  register: async (input: {
    business_name: string
    owner_name?: string
    phone: string
    pin: string
    email?: string
    address?: string
    city?: string
    city_id?: string
  }) => {
    const response = await api.post('/restaurant/register', input)
    return response.data?.data || response.data
  },
  login: async (input: { phone: string; pin: string }): Promise<{ token: string; restaurant: RestaurantInfo }> => {
    const response = await api.post('/restaurant/login', input)
    return (response.data?.data || response.data) as { token: string; restaurant: RestaurantInfo }
  },
}

// Atta Chakki API
export const attaChakkiApi = {
  getRequests: async (): Promise<AttaChakkiRequest[]> => {
    const response = await api.get('/atta-requests')
    const body = response.data
    return body.data?.requests || body.data || []
  },

  createRequest: async (data: {
    wheat_quantity_kg: number
    address_id: string
    flour_type?: string
    wheat_quality?: string
    special_instructions?: string
  }) => {
    const response = await api.post('/atta-requests', data)
    return response.data
  },

  getRequestById: async (id: string): Promise<AttaChakkiRequest> => {
    const response = await api.get(`/atta-requests/${id}`)
    const body = response.data
    return body.data?.request || body.data || body
  },

  cancelRequest: async (id: string, reason?: string) => {
    const response = await api.put(`/atta-requests/${id}/cancel`, { reason })
    return response.data
  },

  /** Live admin-configured charges (public) — never hard-code rates in copy. */
  getCharges: async (): Promise<AttaCharges> => {
    const response = await api.get('/atta-requests/charges')
    const d = response.data?.data || {}
    return {
      serviceCharge: Number(d.service_charge) || 0,
      millingChargePerKg: Number(d.milling_charge_per_kg) || 0,
      deliveryCharge: Number(d.delivery_charge) || 0,
      freeDeliveryThresholdKg: Number(d.free_delivery_threshold_kg) || 0,
    }
  },
}

export interface AttaCharges {
  serviceCharge: number
  millingChargePerKg: number
  deliveryCharge: number
  freeDeliveryThresholdKg: number
}

// Franchise API (public lead capture)
export const franchiseApi = {
  submitInquiry: async (data: {
    name: string
    phone: string
    email?: string
    city?: string
    message?: string
  }): Promise<{ id: string }> => {
    const response = await api.post('/franchise/inquiries', data)
    return response.data?.data || response.data
  },
}
