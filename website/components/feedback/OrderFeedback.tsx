'use client'

import { useState, useEffect } from 'react'
import { Star, MessageSquareWarning, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import StarRating from './StarRating'
import {
  reviewsApi,
  complaintsApi,
  type OrderReviewables,
  type ReviewTargetType,
  type ComplaintCategory,
} from '@/lib/api'
import { resolveImageUrl } from '@/lib/utils'

interface OrderFeedbackProps {
  orderId: string
  orderNumber?: string
  delivered: boolean
}

const CATEGORIES: { value: ComplaintCategory; label: string }[] = [
  { value: 'delivery', label: 'Delivery delay' },
  { value: 'product_quality', label: 'Product quality' },
  { value: 'rider_behavior', label: 'Rider behaviour' },
  { value: 'payment', label: 'Payment / amount' },
  { value: 'app_issue', label: 'App issue' },
  { value: 'other', label: 'Other' },
]

/** "Rate & review" + "Complaint" actions shown below a delivered order. */
export default function OrderFeedback({ orderId, orderNumber, delivered }: OrderFeedbackProps) {
  const [showReview, setShowReview] = useState(false)
  const [showComplaint, setShowComplaint] = useState(false)

  return (
    <>
      {delivered && (
        <Button variant="outline" onClick={() => setShowReview(true)} className="flex-1">
          <Star className="w-4 h-4 mr-2" />
          Rate &amp; Review
        </Button>
      )}
      <Button
        variant="ghost"
        onClick={() => setShowComplaint(true)}
        className="flex-1 text-red-600 hover:bg-red-50"
      >
        <MessageSquareWarning className="w-4 h-4 mr-2" />
        Complaint
      </Button>

      {showReview && (
        <ReviewModal orderId={orderId} onClose={() => setShowReview(false)} />
      )}
      {showComplaint && (
        <ComplaintModal
          orderId={orderId}
          orderNumber={orderNumber}
          onClose={() => setShowComplaint(false)}
        />
      )}
    </>
  )
}

// ── Review modal ─────────────────────────────────────────────────────────────

interface ReviewTargetRow {
  key: string
  target: ReviewTargetType
  productId?: string
  label: string
  image?: string | null
}

interface Draft {
  rating: number
  comment: string
}

function ReviewModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [data, setData] = useState<OrderReviewables | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await reviewsApi.forOrder(orderId)
        if (!active) return
        setData(res)
        // Pre-fill any reviews the customer already left.
        const initial: Record<string, Draft> = {}
        for (const r of res.reviews) {
          const key =
            r.targetType === 'product' ? `product:${r.productId}` : r.targetType
          initial[key] = { rating: r.rating, comment: r.comment || '' }
        }
        setDrafts(initial)
      } catch {
        toast.error('Could not load review options')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [orderId])

  const rows: ReviewTargetRow[] = [
    ...(data?.products || []).map((p) => ({
      key: `product:${p.productId}`,
      target: 'product' as ReviewTargetType,
      productId: p.productId,
      label: p.productName,
      image: p.productImage,
    })),
    {
      key: 'rider',
      target: 'rider' as ReviewTargetType,
      // riderId may be null (no rider assigned) — still reviewable.
      label: data?.rider?.riderName ? `Rider: ${data.rider.riderName}` : 'Rider behaviour',
    },
    {
      key: 'service',
      target: 'service' as ReviewTargetType,
      label: 'Company Service',
    },
  ]

  const setDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({
      ...prev,
      [key]: { rating: prev[key]?.rating || 0, comment: prev[key]?.comment || '', ...patch },
    }))

  // Submit ALL targets the customer actually rated (rating >= 1). Empty stars =
  // "not reviewed" and are skipped — one button for the whole order.
  const submitAll = async () => {
    const toSubmit = rows.filter((r) => (drafts[r.key]?.rating || 0) >= 1)
    if (toSubmit.length === 0) {
      toast.error('Please rate at least one item before submitting')
      return
    }
    setSaving(true)
    try {
      for (const r of toSubmit) {
        const d = drafts[r.key]
        await reviewsApi.submit({
          targetType: r.target,
          orderId,
          productId: r.productId,
          rating: d.rating,
          comment: d.comment.trim() || undefined,
        })
      }
      toast.success('Thank you for your feedback')
      onClose()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not save your review')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose} title="Rate & Review">
      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-3">
            Rate whatever you want — leave the rest blank. One tap submits everything.
          </p>
          <div className="space-y-3">
            {rows.map((row) => {
              const d = drafts[row.key] || { rating: 0, comment: '' }
              return (
                <div key={row.key} className="border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    {row.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveImageUrl(row.image) || '/placeholder-product.jpg'}
                        alt={row.label}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    ) : null}
                    <span className="flex-1 font-medium text-gray-800 text-sm">{row.label}</span>
                  </div>
                  <div className="mt-2">
                    <StarRating
                      value={d.rating}
                      onChange={(rating) => setDraft(row.key, { rating })}
                      size={26}
                    />
                  </div>
                  <textarea
                    value={d.comment}
                    onChange={(e) => setDraft(row.key, { comment: e.target.value })}
                    placeholder="Add a comment (optional)"
                    maxLength={2000}
                    rows={2}
                    className="mt-2 w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </div>
              )
            })}
          </div>
          <Button fullWidth onClick={submitAll} disabled={saving} className="mt-4">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Submit Review'}
          </Button>
        </>
      )}
    </Overlay>
  )
}

// ── Complaint modal ──────────────────────────────────────────────────────────

function ComplaintModal({
  orderId,
  orderNumber,
  onClose,
}: {
  orderId?: string
  orderNumber?: string
  onClose: () => void
}) {
  const [category, setCategory] = useState<ComplaintCategory>('delivery')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (subject.trim().length < 3) return toast.error('Please add a short subject')
    if (message.trim().length < 5) return toast.error('Please describe the issue')
    setSaving(true)
    try {
      const res = await complaintsApi.file({ subject: subject.trim(), message: message.trim(), category, orderId })
      toast.success(`Complaint submitted — ticket ${res.ticketNumber}`)
      onClose()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not submit complaint')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose} title="File a Complaint">
      <div className="space-y-3">
        {orderNumber && (
          <p className="text-xs text-gray-500">Linked to order #{orderNumber}</p>
        )}
        <div>
          <label className="text-sm font-medium text-gray-700">Issue type</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  category === c.value
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            className="mt-1 w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
            placeholder="Short subject"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Details</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={4000}
            rows={4}
            className="mt-1 w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
            placeholder="Describe your complaint"
          />
        </div>
        <Button fullWidth onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Submit Complaint'}
        </Button>
      </div>
    </Overlay>
  )
}

// ── Shared overlay ───────────────────────────────────────────────────────────

function Overlay({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
