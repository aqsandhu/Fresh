'use client'

import { useState, useEffect } from 'react'
import StarRating from './StarRating'
import toast from 'react-hot-toast'
import { reviewsApi, type Review } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'

const REASONS = [
  { value: 'offensive', label: 'Offensive or abusive' },
  { value: 'spam', label: 'Spam or fake' },
  { value: 'personal_info', label: 'Shows personal information' },
] as const

interface ProductReviewsProps {
  productId: string
}

/** Published customer reviews + rating summary for a product page. */
export default function ProductReviews({ productId }: ProductReviewsProps) {
  const [summary, setSummary] = useState<{ average: number; count: number }>({ average: 0, count: 0 })
  const [reviews, setReviews] = useState<Review[]>([])
  const [loaded, setLoaded] = useState(false)
  const [reporting, setReporting] = useState<string | null>(null)
  const [reported, setReported] = useState<Record<string, boolean>>({})
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  // Other customers' reviews can be reported (App Store guideline 1.2). Three
  // different reports hide a review until the shop has looked at it.
  const report = async (id: string, reason: (typeof REASONS)[number]['value']) => {
    try {
      const res = await reviewsApi.report(id, reason)
      setReported((prev) => ({ ...prev, [id]: true }))
      toast.success(res.alreadyReported ? 'You have already reported this review.' : 'Thank you. We will look at this review.')
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Could not report the review.')
    } finally {
      setReporting(null)
    }
  }

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
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-xs">
              {reported[r.id] ? (
                <span className="text-gray-500">Reported</span>
              ) : reporting === r.id ? (
                <>
                  <span className="text-gray-600">Why?</span>
                  {REASONS.map((reason) => (
                    <button
                      key={reason.value}
                      type="button"
                      onClick={() => report(r.id, reason.value)}
                      className="rounded-full border border-gray-300 px-2.5 py-1 text-gray-700 hover:border-red-400 hover:text-red-600"
                    >
                      {reason.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setReporting(null)} className="px-1 text-gray-500 underline">
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => (isAuthenticated ? setReporting(r.id) : toast('Please sign in to report a review.'))}
                  className="text-gray-500 underline hover:text-red-600"
                  aria-label={`Report review by ${(r as Review & { authorName?: string }).authorName || 'Customer'}`}
                >
                  Report
                </button>
              )}
            </div>
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
