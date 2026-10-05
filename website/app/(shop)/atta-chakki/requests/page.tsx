'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Wheat, Loader2, ArrowLeft, XCircle, Clock } from 'lucide-react'
import Button from '@/components/ui/Button'
import { attaChakkiApi } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'
import { formatPriceShort } from '@/lib/utils'
import type { AttaChakkiRequest } from '@/types'

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending_pickup: { label: 'Pickup pending', tone: 'bg-amber-100 text-amber-800' },
  picked_up: { label: 'Wheat picked up', tone: 'bg-blue-100 text-blue-800' },
  at_mill: { label: 'At the mill', tone: 'bg-blue-100 text-blue-800' },
  milling: { label: 'Grinding', tone: 'bg-indigo-100 text-indigo-800' },
  ready_for_delivery: { label: 'Atta ready', tone: 'bg-primary-100 text-primary-800' },
  out_for_delivery: { label: 'Out for delivery', tone: 'bg-primary-100 text-primary-800' },
  delivered: { label: 'Delivered', tone: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelled', tone: 'bg-gray-100 text-gray-600' },
}

// Mirrors backend cancelAttaRequest: nothing after pickup can be cancelled.
const CANCELLABLE = new Set(['pending_pickup'])

export default function AttaRequestsPage() {
  const router = useRouter()
  const { isAuthenticated, hasHydrated } = useAuthStore()
  const [requests, setRequests] = useState<AttaChakkiRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(false)
    try {
      const list = await attaChakkiApi.getRequests()
      setRequests(Array.isArray(list) ? list : [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated) {
      router.push('/login?redirect=/atta-chakki/requests')
      return
    }
    load()
  }, [hasHydrated, isAuthenticated, router, load])

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this atta request?')) return
    setCancellingId(id)
    try {
      await attaChakkiApi.cancelRequest(id, 'Cancelled by customer')
      toast.success('Request cancelled')
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not cancel this request')
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/atta-chakki" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
              <ArrowLeft className="w-4 h-4" /> Atta Chakki
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mt-1">My Atta Requests</h1>
          </div>
          <Link href="/atta-chakki">
            <Button size="sm">New request</Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm">
            <p className="text-gray-700 font-medium mb-3">Could not load your requests.</p>
            <Button variant="outline" onClick={() => { setLoading(true); load() }}>Retry</Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm">
            <Wheat className="w-12 h-12 text-primary-300 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">No atta requests yet</p>
            <p className="text-sm text-gray-500 mt-1">Book a wheat pickup and we&apos;ll bring back fresh atta.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r, i) => {
              const meta = STATUS_LABEL[r.status] || { label: r.status.replace(/_/g, ' '), tone: 'bg-gray-100 text-gray-700' }
              const total = Number(r.total_amount) || 0
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                  className="bg-white rounded-xl p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {r.request_number ? `#${r.request_number}` : `Request ${r.id.slice(0, 8).toUpperCase()}`}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {r.wheat_quantity_kg} kg wheat · {r.flour_type || 'fine'} flour
                      </p>
                      {r.pickup_address ? (
                        <p className="text-sm text-gray-500 mt-0.5 truncate">{r.pickup_address}</p>
                      ) : null}
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(r.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${meta.tone}`}>{meta.label}</span>
                      <p className="text-lg font-bold text-gray-900 mt-2">{formatPriceShort(total)}</p>
                      {r.payment_status ? (
                        <p className="text-xs text-gray-500">{r.payment_status === 'completed' ? 'Paid' : 'Pay on delivery'}</p>
                      ) : null}
                    </div>
                  </div>
                  {CANCELLABLE.has(r.status) && (
                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancel(r.id)}
                        disabled={cancellingId === r.id}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        {cancellingId === r.id ? 'Cancelling…' : 'Cancel request'}
                      </Button>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
