'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Star, MessageSquareWarning, Plus, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import StarRating from '@/components/feedback/StarRating'
import {
  reviewsApi,
  complaintsApi,
  ordersApi,
  type Review,
  type Complaint,
  type ComplaintCategory,
  type ComplaintStatus,
} from '@/lib/api'
import { formatDate, resolveImageUrl } from '@/lib/utils'
import { useAuthStore } from '@/store/cartStore'

const CATEGORIES: { value: ComplaintCategory; label: string }[] = [
  { value: 'delivery', label: 'Delivery delay' },
  { value: 'product_quality', label: 'Product quality' },
  { value: 'rider_behavior', label: 'Rider behaviour' },
  { value: 'payment', label: 'Payment / amount' },
  { value: 'app_issue', label: 'App issue' },
  { value: 'other', label: 'Other' },
]

const STATUS_META: Record<ComplaintStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-amber-50 text-amber-700' },
  in_progress: { label: 'In progress', cls: 'bg-blue-50 text-blue-700' },
  resolved: { label: 'Resolved', cls: 'bg-green-50 text-green-700' },
  closed: { label: 'Closed', cls: 'bg-gray-100 text-gray-600' },
}

const TARGET_LABEL: Record<string, string> = {
  product: 'Product',
  rider: 'Rider',
  service: 'Company Service',
}

export default function SupportPage() {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [tab, setTab] = useState<'complaints' | 'reviews'>('complaints')
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, r] = await Promise.all([complaintsApi.mine(), reviewsApi.mine()])
      setComplaints(c)
      setReviews(r)
    } catch {
      /* non-critical */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/support')
      return
    }
    load()
  }, [isAuthenticated, load, router])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Reviews &amp; Complaints</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <TabButton active={tab === 'complaints'} onClick={() => setTab('complaints')}>
            <MessageSquareWarning className="w-4 h-4" /> Complaints
          </TabButton>
          <TabButton active={tab === 'reviews'} onClick={() => setTab('reviews')}>
            <Star className="w-4 h-4" /> My Reviews
          </TabButton>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
          </div>
        ) : tab === 'complaints' ? (
          <div className="space-y-3">
            <Button onClick={() => setShowForm(true)} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-1" /> New Complaint
            </Button>
            {complaints.length === 0 ? (
              <EmptyState
                type="generic"
                title="No complaints yet"
                description="If something goes wrong with an order you can raise a complaint here."
              />
            ) : (
              complaints.map((c) => <ComplaintCard key={c.id} complaint={c} />)
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.length === 0 ? (
              <EmptyState
                type="generic"
                title="No reviews yet"
                description="After an order is delivered you can rate the products, rider and service."
              />
            ) : (
              reviews.map((r) => <ReviewCard key={r.id} review={r} />)
            )}
          </div>
        )}
      </div>

      {showForm && (
        <NewComplaintModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
        active ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function ComplaintCard({ complaint }: { complaint: Complaint }) {
  const meta = STATUS_META[complaint.status] || STATUS_META.open
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-primary-700">#{complaint.ticketNumber}</span>
        <span className={`text-xs font-semibold px-2 py-1 rounded ${meta.cls}`}>{meta.label}</span>
      </div>
      <h3 className="font-semibold text-gray-900 mt-2">{complaint.subject}</h3>
      <p className="text-sm text-gray-600 mt-1">{complaint.message}</p>
      {complaint.images && complaint.images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {complaint.images.map((img, i) => (
            <a
              key={i}
              href={resolveImageUrl(img) || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="h-16 w-16 overflow-hidden rounded-lg border border-gray-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveImageUrl(img) || ''} alt="" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      {complaint.orderNumber && (
        <p className="text-xs text-gray-400 mt-2">Order #{complaint.orderNumber}</p>
      )}
      {complaint.adminResponse && (
        <div className="mt-3 bg-green-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-green-700">Support reply</p>
          <p className="text-sm text-green-800 mt-1">{complaint.adminResponse}</p>
        </div>
      )}
      {complaint.createdAt && (
        <p className="text-xs text-gray-400 mt-2">{formatDate(complaint.createdAt)}</p>
      )}
    </div>
  )
}

function ReviewCard({ review }: { review: Review }) {
  const title =
    review.targetType === 'product'
      ? review.productName || 'Product'
      : review.targetType === 'rider'
      ? review.riderName
        ? `Rider: ${review.riderName}`
        : 'Rider'
      : 'Company Service'
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary-50 text-primary-700">
          {TARGET_LABEL[review.targetType]}
        </span>
      </div>
      <div className="mt-1">
        <StarRating value={review.rating} size={16} />
      </div>
      {review.comment && <p className="text-sm text-gray-600 mt-2">{review.comment}</p>}
      {review.orderNumber && <p className="text-xs text-gray-400 mt-2">Order #{review.orderNumber}</p>}
      {review.adminReply && (
        <div className="mt-3 bg-blue-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-700">Reply</p>
          <p className="text-sm text-blue-800 mt-1">{review.adminReply}</p>
        </div>
      )}
    </div>
  )
}

interface DeliveredOrder {
  id: string
  orderNumber: string
  date: string
}

function NewComplaintModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<ComplaintCategory>('other')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [orderId, setOrderId] = useState('')
  const [orders, setOrders] = useState<DeliveredOrder[]>([])
  const [images, setImages] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const addImages = (files: FileList | null) => {
    if (!files) return
    const picked = Array.from(files).filter((f) => f.type.startsWith('image/'))
    setImages((prev) => [...prev, ...picked].slice(0, 5))
  }

  // Load the customer's delivered orders so they can (optionally) attach one.
  useEffect(() => {
    let active = true
    ordersApi
      .getAll()
      .then((res) => {
        if (!active) return
        const delivered = (Array.isArray(res) ? res : [])
          .filter((o: any) => o.status === 'delivered')
          .map((o: any) => ({
            id: o.id,
            orderNumber: o.order_number || o.id,
            date: o.delivered_at || o.placed_at || o.created_at || '',
          }))
        setOrders(delivered)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const submit = async () => {
    if (subject.trim().length < 3) return toast.error('Please add a short subject')
    if (message.trim().length < 5) return toast.error('Please describe the issue')
    setSaving(true)
    try {
      const res = await complaintsApi.file({
        subject: subject.trim(),
        message: message.trim(),
        category,
        ...(orderId ? { orderId } : {}),
        ...(images.length > 0 ? { images } : {}),
      })
      toast.success(`Complaint submitted — ticket ${res.ticketNumber}`)
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not submit complaint')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">New Complaint</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
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
          {orders.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700">
                Related order <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                <option value="">Select specific order (optional)</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.orderNumber}
                    {o.date ? ` — ${formatDate(o.date)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
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
          <div>
            <label className="text-sm font-medium text-gray-700">
              Photos <span className="font-normal text-gray-400">(optional, up to 5)</span>
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {images.map((file, i) => (
                <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                    aria-label="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-primary-400 hover:text-primary-500">
                  <Plus className="h-5 w-5" />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addImages(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
          </div>
          <Button fullWidth onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Submit Complaint'}
          </Button>
        </div>
      </div>
    </div>
  )
}
