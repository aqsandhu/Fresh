'use client'

import { useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/cartStore'
import { useNotificationStore, type AppNotification } from '@/store/notificationStore'
import { notificationsApi } from '@/lib/api'
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  reconnectSocket,
} from '@/lib/socket'
import { getValidAccessToken, refreshWebsiteAccessToken } from '@/lib/tokenRefresh'

function socketNotificationId(type: string, orderId?: string) {
  return `socket-${type}-${orderId || 'general'}-${Date.now()}`
}

function fromSocketPayload(
  type: string,
  data: Record<string, unknown>,
  title: string,
  message: string
): AppNotification {
  return {
    id: socketNotificationId(type, data.orderId ? String(data.orderId) : undefined),
    type,
    title,
    message: String(data.message || message),
    orderId: data.orderId ? String(data.orderId) : undefined,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: data.orderId ? `/track/${data.orderId}` : '/orders',
  }
}

export default function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasHydrated } = useAuthStore()
  const { setNotifications, addNotification, reset, setLoading } = useNotificationStore()
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const data = await notificationsApi.getAll()
      setNotifications(data.notifications, data.unreadCount)
    } catch {
      /* keep existing local items on failure */
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, setNotifications, setLoading])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      loadNotifications()
    }, 800)
  }, [loadNotifications])

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated) {
      reset()
      disconnectSocket()
      return
    }

    loadNotifications()
  }, [hasHydrated, isAuthenticated, loadNotifications, reset])

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) return

    let cancelled = false
    let cleanupConnectError: (() => void) | undefined

    const handlers: Array<{ event: string; fn: (data: Record<string, unknown>) => void }> = [
      {
        event: 'order:created',
        fn: (data) => {
          const item = fromSocketPayload(
            'order_placed',
            data,
            'Order placed',
            data.orderNumber ? `Order #${data.orderNumber} placed successfully` : 'Your order was placed'
          )
          addNotification(item)
          toast.success(item.message)
          scheduleRefresh()
        },
      },
      {
        event: 'order:status_changed',
        fn: (data) => {
          const item = fromSocketPayload(
            'order_confirmed',
            data,
            'Order update',
            data.message ? String(data.message) : 'Your order status was updated'
          )
          addNotification(item)
          scheduleRefresh()
        },
      },
      {
        event: 'order:delivered',
        fn: (data) => {
          const item = fromSocketPayload(
            'delivered',
            data,
            'Order delivered',
            data.message ? String(data.message) : 'Your order has been delivered'
          )
          addNotification(item)
          toast.success(item.message)
          scheduleRefresh()
        },
      },
      {
        event: 'order:rider_assigned',
        fn: (data) => {
          const item = fromSocketPayload(
            'rider_assigned',
            data,
            'Rider assigned',
            data.message ? String(data.message) : 'A rider has been assigned to your order'
          )
          addNotification(item)
          scheduleRefresh()
        },
      },
    ]

    const setup = async () => {
      const token = await getValidAccessToken()
      if (cancelled || !token) return

      const socket = connectSocket(token)

      const handleConnectError = async (err: Error) => {
        if (!err.message.toLowerCase().includes('jwt') && !err.message.toLowerCase().includes('expired')) {
          return
        }
        const fresh = await refreshWebsiteAccessToken()
        if (fresh) {
          reconnectSocket(fresh)
        }
      }

      socket.on('connect_error', handleConnectError)
      cleanupConnectError = () => socket.off('connect_error', handleConnectError)

      handlers.forEach(({ event, fn }) => socket.on(event, fn))
    }

    setup()

    return () => {
      cancelled = true
      cleanupConnectError?.()
      const socket = getSocket()
      if (socket) {
        handlers.forEach(({ event, fn }) => socket.off(event, fn))
      }
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [hasHydrated, isAuthenticated, addNotification, scheduleRefresh])

  return <>{children}</>
}
