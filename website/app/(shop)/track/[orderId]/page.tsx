'use client'

import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { 
  MapPin, 
  Phone, 
  Clock, 
  CheckCircle,
  ChefHat,
  Truck,
  Package,
  ChevronLeft,
  Navigation,
  Loader2,
  AlertCircle,
  XCircle
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import OrderChatBox from '@/components/ui/OrderChatBox'
import dynamic from 'next/dynamic'
import { OrderStatus } from '@/types'
import { formatPriceShort, formatDateTime, getOrderStatusLabel, resolveImageUrl } from '@/lib/utils'
import { ordersApi } from '@/lib/api'

const RiderTrackingMap = dynamic(() => import('@/components/ui/RiderTrackingMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden h-72 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-green-600" />
    </div>
  ),
})

function resolveImg(path: string | null | undefined): string {
  return resolveImageUrl(path) || '/placeholder-product.jpg'
}

function mapStatus(s: string): OrderStatus {
  const map: Record<string, OrderStatus> = {
    'pending': 'received',
    'confirmed': 'received',
    'preparing': 'preparing',
    'ready_for_pickup': 'preparing',
    'out_for_delivery': 'out-for-delivery',
    'delivered': 'delivered',
    'cancelled': 'cancelled',
    'refunded': 'refunded',
  }
  return map[s] || 'received'
}

const timelineSteps: { status: OrderStatus; label: string; icon: typeof Package }[] = [
  { status: 'received', label: 'Order Received', icon: Package },
  { status: 'preparing', label: 'Preparing', icon: ChefHat },
  { status: 'out-for-delivery', label: 'Out for Delivery', icon: Truck },
  { status: 'delivered', label: 'Delivered', icon: CheckCircle },
]

export default function TrackOrderPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const orderId = params.orderId as string
  const [cancelling, setCancelling] = useState(false)

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const response = await ordersApi.getById(orderId)
      const raw = response.data || response
      const snapshot = raw.delivery_address_snapshot || {}

      // Format time slot using browser locale (respects 12h/24h setting)
      const formatSlotTime = (time: string) => {
        const [h, m] = time.split(':').map(Number)
        const d = new Date()
        d.setHours(h, m || 0, 0, 0)
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      }
      let formattedSlot = 'Standard Delivery'
      if (raw.slot_start && raw.slot_end) {
        formattedSlot = `${formatSlotTime(raw.slot_start)} - ${formatSlotTime(raw.slot_end)}`
      } else if (raw.slot_name) {
        // slot_name may be "10:00:00 - 14:00:00", try to parse and format
        const parts = raw.slot_name.split(' - ')
        if (parts.length === 2 && parts[0].includes(':')) {
          formattedSlot = `${formatSlotTime(parts[0].trim())} - ${formatSlotTime(parts[1].trim())}`
        } else {
          formattedSlot = raw.slot_name
        }
      }

      return {
        id: raw.id,
        orderNumber: raw.order_number || raw.id,
        status: mapStatus(raw.status),
        createdAt: raw.placed_at || raw.created_at || '',
        subtotal: parseFloat(raw.subtotal) || 0,
        deliveryCharge: parseFloat(raw.delivery_charge) || 0,
        total: parseFloat(raw.total_amount) || 0,
        timeSlot: formattedSlot,
        estimatedDelivery: raw.requested_delivery_date,
        address: {
          label: snapshot.area_name || snapshot.label || 'Delivery Address',
          fullAddress: [snapshot.written_address, snapshot.area_name, snapshot.city].filter(Boolean).join(', '),
        },
        items: (raw.items || []).map((item: any) => ({
          product: {
            name: item.product_name || 'Product',
            image: resolveImg(item.product_image),
          },
          quantity: item.quantity || 1,
          price: parseFloat(item.unit_price) || 0,
        })),
        rider: raw.rider_name ? {
          name: raw.rider_name,
          phone: raw.rider_phone || '',
        } : undefined,
        paymentMethod: raw.payment_method || 'cash_on_delivery',
      }
    },
    enabled: !!orderId,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <span className="ml-3 text-gray-600">Loading order details...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <Link
            href="/orders"
            className="inline-flex items-center text-gray-600 hover:text-primary-600 mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Orders
          </Link>
          <div className="bg-white rounded-xl p-8 shadow-sm text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Order Not Found</h2>
            <p className="text-gray-600 mb-6">
              We couldn&apos;t find the order you&apos;re looking for. Please check the order ID and try again.
            </p>
            <Link href="/orders">
              <Button>View All Orders</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const currentStepIndex = timelineSteps.findIndex((step) => step.status === order.status)

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        {/* Back Link */}
        <Link
          href="/orders"
          className="inline-flex items-center text-gray-600 hover:text-primary-600 mb-6"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Orders
        </Link>

        {/* Order Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 shadow-sm mb-6"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{order.orderNumber || orderId}</h1>
              <p className="text-gray-500">
                Placed on {formatDateTime(order.createdAt)}
              </p>
            </div>
            <Badge variant="primary" className="text-base px-4 py-2">
              {getOrderStatusLabel(order.status)}
            </Badge>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Timeline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold mb-6">Order Status</h2>
              <div className="relative">
                {/* Progress Line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200">
                  <div
                    className="absolute top-0 left-0 w-full bg-primary-500 transition-all duration-500"
                    style={{
                      height: `${(currentStepIndex / (timelineSteps.length - 1)) * 100}%`,
                    }}
                  />
                </div>

                {/* Steps */}
                <div className="space-y-8">
                  {timelineSteps.map((step, index) => {
                    const isCompleted = index <= currentStepIndex
                    const isCurrent = index === currentStepIndex
                    const Icon = step.icon

                    return (
                      <div
                        key={step.status}
                        className={`relative flex items-center gap-4 ${
                          isCompleted ? 'text-gray-900' : 'text-gray-400'
                        }`}
                      >
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center z-10 ${
                            isCompleted
                              ? 'bg-primary-500 text-white'
                              : 'bg-gray-200'
                          } ${isCurrent ? 'ring-4 ring-primary-100' : ''}`}
                        >
                          <Icon className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-medium">{step.label}</p>
                          {isCurrent && order.estimatedDelivery && (
                            <p className="text-sm text-primary-600">
                              Estimated by {formatDateTime(order.estimatedDelivery)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>

            {/* Rider Info + Live Tracking (if out for delivery) */}
            {order.status === 'out-for-delivery' && order.rider && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-6"
              >
                {/* Delivery Partner */}
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h2 className="text-xl font-semibold mb-4">Delivery Partner</h2>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                      <Navigation className="w-8 h-8 text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-lg">{order.rider.name}</p>
                      <a
                        href={`tel:${order.rider.phone}`}
                        className="text-primary-600 flex items-center gap-1"
                      >
                        <Phone className="w-4 h-4" />
                        {order.rider.phone}
                      </a>
                    </div>
                    <a
                      href={`tel:${order.rider.phone}`}
                      className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center text-white hover:bg-primary-700"
                    >
                      <Phone className="w-5 h-5" />
                    </a>
                  </div>
                </div>

                {/* Live Tracking Map */}
                <RiderTrackingMap orderId={orderId} riderName={order.rider.name} />

                {/* Chat with Rider */}
                <OrderChatBox orderId={orderId} />
              </motion.div>
            )}

            {/* Chat for non-delivered/cancelled orders without rider yet */}
            {order.status !== 'delivered' && order.status !== 'cancelled' && order.status !== 'out-for-delivery' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <OrderChatBox orderId={orderId} />
              </motion.div>
            )}

            {/* Order Items */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-xl p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold mb-4">Order Items</h2>
              <div className="space-y-4">
                {order.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="relative w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={item.product?.image || item.product?.image_url || '/placeholder-product.png'}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{item.product.name}</p>
                      <p className="text-sm text-gray-500">
                        {item.quantity} x {formatPriceShort(item.price)}
                      </p>
                    </div>
                    <p className="font-semibold">
                      {formatPriceShort(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-xl p-6 shadow-sm sticky top-24"
            >
              <h2 className="text-xl font-semibold mb-6">Order Summary</h2>

              {/* Delivery Address */}
              <div className="mb-6">
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm">Delivery Address</span>
                </div>
                <p className="font-medium">{order.address.label}</p>
                <p className="text-gray-600 text-sm">{order.address.fullAddress}</p>
              </div>

              {/* Time Slot */}
              <div className="mb-6">
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Delivery Time</span>
                </div>
                <p className="font-medium capitalize">{order.timeSlot.replace('-', ' - ')}</p>
              </div>

              {/* Price Breakdown */}
              <div className="space-y-3 mb-6 border-t pt-4">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPriceShort(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span>
                  <span className={order.deliveryCharge === 0 ? 'text-green-600' : ''}>
                    {order.deliveryCharge === 0 ? 'FREE' : formatPriceShort(order.deliveryCharge)}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>{formatPriceShort(order.total)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-sm">Payment:</span>
                <span className="font-medium">Cash on Delivery</span>
              </div>

              {/* Cancel Order Button */}
              {order.status !== 'delivered' && order.status !== 'cancelled' && order.status !== 'out-for-delivery' && (
                <div className="border-t pt-4 mt-4">
                  <Button
                    variant="outline"
                    fullWidth
                    disabled={cancelling}
                    onClick={async () => {
                      if (!confirm('Are you sure you want to cancel this order?')) return
                      setCancelling(true)
                      try {
                        await ordersApi.cancel(orderId)
                        toast.success('Order cancelled successfully')
                        queryClient.invalidateQueries({ queryKey: ['order', orderId] })
                      } catch (err: any) {
                        const msg = err?.response?.data?.message || 'Failed to cancel order'
                        toast.error(msg)
                      } finally {
                        setCancelling(false)
                      }
                    }}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    {cancelling ? 'Cancelling...' : 'Cancel Order'}
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
