'use client'

import { useState, useEffect, useCallback } from 'react'
import { Star, MessageSquareWarning, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import StarRating from './StarRating'
import {
  reviewsApi,
  complaintsApi,
  type OrderReviewables,
  type Review,
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

function ReviewModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [data, setData] = useState<OrderReviewables | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await reviewsApi.forOrder(orderId))
    } catch {
      toast.error('Could not load review options')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  const findReview = (predicate: (r: Review) => boolean) => data?.reviews.find(predicate)

  return (
    <Overlay onClose={onClose} title="Rate & Review">
      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="space-y-4">
          {data?.products.map((p) => (
            <ReviewRow
              key={`p-${p.productId}`}
              orderId={orderId}
              target="product"
              productId={p.productId}
              label={p.productName}
              image={p.productImage}
              existing={findReview((r) => r.targetType === 'product' && r.productId === p.productId)}
              onSaved={load}
            />
          ))}
          {data?.rider && (
            <ReviewRow
              orderId={orderId}
              target="rider"
              label={`Rider: ${data.rider.riderName || 'Delivery'}`}
              existing={findReview((r) => r.targetType === 'rider')}
              onSaved={load}
            />
          )}
          <ReviewRow
            orderId={orderId}
            target="service"
            label="Service / delivery experience"
            existing={findReview((r) => r.targetType === 'service')}
            onSaved={load}
          />
        </div>
      )}
    </Overlay>
  )
}

function ReviewRow({
  orderId,
  target,
  productId,
  label,
  image,
  existing,
  onSaved,
}: {
  orderId: string
  target: ReviewTargetType
  productId?: string
  label: string
  image?: string | null
  existing?: Review
  onSaved: () => void
}) {
  const [rating, setRating] = useState(existing?.rating || 0)
  const [comment, setComment] = useState(existing?.comment || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setRating(existing?.rating || 0)
    setComment(existing?.comment || '')
  }, [existing])

  const save = async () => {
    if (rating < 1) {
      toast.error('Please select a star rating')
      return
    }
    setSaving(true)
    try {
      await reviewsApi.submit({ targetType: target, orderId, productId, rating, comment: comment.trim() || undefined })
      toast.success('Thanks for your feedback')
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not save review')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageUrl(image) || '/placeholder-product.jpg'}
            alt={label}
            className="w-10 h-10 rounded-lg object-cover"
          />
        ) : null}
        <span className="flex-1 font-medium text-gray-800 text-sm">{label}</span>
        {existing && <span className="text-xs text-green-600 font-semibold">Rated</span>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <StarRating value={rating} onChange={setRating} size={24} />
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : existing ? 'Update' : 'Submit'}
        </Button>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)"
        maxLength={2000}
        rows={2}
        className="mt-2 w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />
    </div>
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
