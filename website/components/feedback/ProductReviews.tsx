'use client'

import { useState, useEffect } from 'react'
import StarRating from './StarRating'
import { reviewsApi, type Review } from '@/lib/api'

interface ProductReviewsProps {
  productId: string
}

/** Published customer reviews + rating summary for a product page. */
export default function ProductReviews({ productId }: ProductReviewsProps) {
  const [summary, setSummary] = useState<{ average: number; count: number }>({ average: 0, count: 0 })
  const [reviews, setReviews] = useState<Review[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    reviewsApi
      .forProduct(productId)
      .then((res) => {
        if (!active) return
        setSummary(res.summary)
        setReviews(res.reviews)
      })
      .catch(() => {})
      .finally(() => active && setLoaded(true))
    return () => {
      active = false
    }
  }, [productId])

  if (!loaded || summary.count === 0) return null

  return (
    <div className="container mx-auto px-4 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Customer Reviews</h2>
        <div className="flex items-center gap-2">
          <StarRating value={summary.average} size={18} />
          <span className="text-sm font-semibold text-gray-700">
            {summary.average.toFixed(1)} ({summary.count})
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {reviews.map((r) => (
          <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800 text-sm">
                {(r as Review & { authorName?: string }).authorName || 'Customer'}
              </span>
              <StarRating value={r.rating} size={14} />
            </div>
            {r.comment && <p className="text-sm text-gray-600 mt-1.5">{r.comment}</p>}
            {r.adminReply && (
              <div className="mt-2 bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs font-semibold text-primary-700">Seller reply</p>
                <p className="text-sm text-gray-700 mt-0.5">{r.adminReply}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
