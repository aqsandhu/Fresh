'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { 
  Package, 
  ChevronRight, 
  RotateCcw,
  Clock,
  CheckCircle,
  Truck,
  ChefHat,
  XCircle,
  Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { OrderStatus } from '@/types'
import { formatPriceShort, formatDate, getOrderStatusColor, getOrderStatusLabel, resolveImageUrl } from '@/lib/utils'
import { ordersApi } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'

function resolveImg(path: string | null | undefined): string {
  return resolveImageUrl(path) || '/placeholder-product.jpg'
}

// Map backend status to website UI status
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

interface MappedOrder {
  id: string
  orderNumber: string
  status: OrderStatus
  total: number
  createdAt: string
  items: { name: string; image: string; quantity: number; price: number }[]
  rider?: { name: string; phone: string }
}

const statusIcons: Record<OrderStatus, typeof Package> = {
  'received': Clock,
  'preparing': ChefHat,
  'out-for-delivery': Truck,
  'delivered': CheckCircle,
  'cancelled': XCircle,
  'refunded': RotateCcw,
}

export default function OrdersPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [orders, setOrders] = useState<MappedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed'>('all')

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/orders')
      return
    }
    loadOrders()
  }, [isAuthenticated])

  const loadOrders = async () => {
    try {
      const res = await ordersApi.getAll()
      const payload = res.data || res
      const rawOrders = payload.orders || (Array.isArray(payload) ? payload : [])
      
      const mapped: MappedOrder[] = rawOrders.map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number || o.id,
        status: mapStatus(o.status),
        total: parseFloat(o.total_amount) || 0,
        createdAt: o.placed_at || o.created_at || new Date().toISOString(),
        items: (o.items || []).map((item: any) => ({
          name: item.product_name || item.name || 'Product',
          image: resolveImg(item.product_image),
          quantity: item.quantity || 1,
          price: parseFloat(item.unit_price) || parseFloat(item.total_price) / (item.quantity || 1) || 0,
        })),
        rider: o.rider_name ? { name: o.rider_name, phone: o.rider_phone || '' } : undefined,
      }))
      
      setOrders(mapped)
    } catch (err: any) {
      if (err?.response?.status === 401) {
        router.push('/login?redirect=/orders')
      }
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders = orders.filter((order) => {
    if (activeTab === 'active') {
      return ['received', 'preparing', 'out-for-delivery'].includes(order.status)
    }
    if (activeTab === 'completed') {
      return ['delivered', 'cancelled'].includes(order.status)
    }
    return true
  })

  const handleReorder = (orderId: string) => {
    toast.success('Items added to cart!')
  }

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return
    try {
      await ordersApi.cancel(orderId)
      toast.success('Order cancelled successfully')
      loadOrders()
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to cancel order'
      toast.error(msg)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4">
          <EmptyState
            type="orders"
            onAction={() => window.location.href = '/products'}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
          My Orders
        </h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {(['all', 'active', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium capitalize whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {filteredOrders.map((order, index) => {
            const StatusIcon = statusIcons[order.status]
            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-xl shadow-sm overflow-hidden"
              >
                {/* Order Header */}
                <div className="p-4 md:p-6 border-b border-gray-100">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getOrderStatusColor(order.status)}`}>
                        <StatusIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{order.orderNumber}</p>
                        <p className="text-sm text-gray-500">
                          Placed on {formatDate(order.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={order.status === 'delivered' ? 'success' : 'primary'}>
                        {getOrderStatusLabel(order.status)}
                      </Badge>
                      <p className="font-semibold text-gray-900">
                        {formatPriceShort(order.total)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Order Items */}
                <div className="p-4 md:p-6">
                  <div className="space-y-3">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="relative w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                          <img
                            src={item.image || '/placeholder-product.png'}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{item.name}</p>
                          <p className="text-sm text-gray-500">
                            {item.quantity} x {formatPriceShort(item.price)}
                          </p>
                        </div>
                        <p className="font-medium">
                          {formatPriceShort(item.price * item.quantity)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Order Actions */}
                <div className="p-4 md:p-6 bg-gray-50 flex flex-col sm:flex-row gap-3">
                  {order.status === 'out-for-delivery' && (
                    <Link href={`/track/${order.id}`} className="flex-1">
                      <Button variant="primary" fullWidth>
                        Track Order
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  )}
                  {order.status === 'delivered' && (
                    <Button
                      variant="outline"
                      onClick={() => handleReorder(order.id)}
                      className="flex-1"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reorder
                    </Button>
                  )}
                  {['received', 'preparing'].includes(order.status) && (
                    <Button
                      variant="outline"
                      onClick={() => handleCancelOrder(order.id)}
                      className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel Order
                    </Button>
                  )}
                  <Link href={`/track/${order.id}`} className="flex-1">
                    <Button variant="ghost" fullWidth>
                      View Details
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
