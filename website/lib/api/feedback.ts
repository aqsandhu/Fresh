// Reviews and complaints — moved from api.ts (W21: only the place changed, not the behaviour).

import { withCityParams, api } from './shared'

export type ReviewTargetType = 'product' | 'rider' | 'service'

export interface Review {
  id: string
  targetType: ReviewTargetType
  productId?: string | null
  riderId?: string | null
  orderId?: string | null
  rating: number
  comment?: string | null
  adminReply?: string | null
  productName?: string | null
  orderNumber?: string | null
  riderName?: string | null
  createdAt?: string
}

export interface OrderReviewables {
  canReview: boolean
  delivered: boolean
  products: { productId: string; productName: string; productImage?: string | null }[]
  rider: { riderId: string; riderName: string } | null
  reviews: Review[]
}

export type ComplaintCategory =
  | 'delivery'
  | 'product_quality'
  | 'rider_behavior'
  | 'payment'
  | 'app_issue'
  | 'other'

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface Complaint {
  id: string
  ticketNumber: string
  orderId?: string | null
  orderNumber?: string | null
  category: ComplaintCategory
  subject: string
  message: string
  status: ComplaintStatus
  priority: 'low' | 'normal' | 'high'
  images?: string[]
  adminResponse?: string | null
  resolvedAt?: string | null
  createdAt?: string
}

export const reviewsApi = {
  submit: async (input: {
    targetType: ReviewTargetType
    orderId: string
    productId?: string
    rating: number
    comment?: string
  }): Promise<Review> => {
    const response = await api.post('/reviews', input)
    return response.data?.data || response.data
  },
  forOrder: async (orderId: string): Promise<OrderReviewables> => {
    const response = await api.get(`/reviews/order/${orderId}`)
    return response.data?.data || response.data
  },
  mine: async (): Promise<Review[]> => {
    const response = await api.get('/reviews/mine')
    return response.data?.data || []
  },
  forProduct: async (
    productId: string
  ): Promise<{ summary: { average: number; count: number }; reviews: Review[] }> => {
    const response = await api.get(`/reviews/product/${productId}`)
    return response.data?.data || { summary: { average: 0, count: 0 }, reviews: [] }
  },
  /** Report someone else's review (App Store guideline 1.2). */
  report: async (
    reviewId: string,
    reason: 'offensive' | 'spam' | 'personal_info' | 'other'
  ): Promise<{ reported?: boolean; alreadyReported?: boolean }> => {
    const response = await api.post(`/reviews/${reviewId}/report`, { reason })
    return response.data?.data || {}
  },
}

export const complaintsApi = {
  file: async (input: {
    subject: string
    message: string
    category?: ComplaintCategory
    orderId?: string
    images?: File[]
  }): Promise<Complaint> => {
    // Use multipart only when there are attachments; otherwise plain JSON.
    if (input.images && input.images.length > 0) {
      const fd = new FormData()
      fd.append('subject', input.subject)
      fd.append('message', input.message)
      if (input.category) fd.append('category', input.category)
      if (input.orderId) fd.append('orderId', input.orderId)
      input.images.slice(0, 5).forEach((file) => fd.append('images', file))
      const response = await api.post('/complaints', fd, { params: withCityParams() })
      return response.data?.data || response.data
    }
    const { images: _images, ...payload } = input
    const response = await api.post('/complaints', payload, { params: withCityParams() })
    return response.data?.data || response.data
  },
  mine: async (): Promise<Complaint[]> => {
    const response = await api.get('/complaints/mine')
    return response.data?.data || []
  },
}
