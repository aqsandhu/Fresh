'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Bell, CheckCheck, Loader2, Package } from 'lucide-react'
import { useNotificationStore } from '@/store/notificationStore'
import { notificationsApi } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'

function formatWhen(iso: string) {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

export default function NotificationBell() {
  const { isAuthenticated, hasHydrated } = useAuthStore()
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useNotificationStore()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const desktopPanelRef = useRef<HTMLDivElement>(null)
  const mobilePanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      const insideButton = buttonRef.current?.contains(target)
      const insideDesktop = desktopPanelRef.current?.contains(target)
      const insideMobile = mobilePanelRef.current?.contains(target)
      if (!insideButton && !insideDesktop && !insideMobile) {
        setOpen(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  if (!hasHydrated || !isAuthenticated) return null

  const handleMarkRead = async (id: string) => {
    markAsRead(id)
    if (!id.startsWith('socket-')) {
      try {
        await notificationsApi.markAsRead(id)
      } catch {
        /* local state already updated */
      }
    }
  }

  const handleMarkAllRead = async () => {
    markAllAsRead()
    try {
      await notificationsApi.markAllAsRead()
    } catch {
      /* local state already updated */
    }
  }

  const panelClassName =
    'w-full max-w-[22rem] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden'

  const panelBody = (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div>
          <p className="font-semibold text-gray-900 text-sm">Notifications</p>
          {unreadCount > 0 && (
            <p className="text-xs text-gray-500">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No notifications yet
          </div>
        ) : (
          notifications.map((n) => {
            // Only trust actionUrl when it's a same-site path (blocks
            // javascript:/external URLs injected via notification payloads).
            const safeActionUrl =
              n.actionUrl && n.actionUrl.startsWith('/') && !n.actionUrl.startsWith('//')
                ? n.actionUrl
                : null
            const href = safeActionUrl || (n.orderId ? `/track/${n.orderId}` : '/orders')
            return (
              <Link
                key={n.id}
                href={href}
                onClick={() => {
                  handleMarkRead(n.id)
                  setOpen(false)
                }}
                className={`block px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  !n.isRead ? 'bg-primary-50/40' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                      {!n.isRead && (
                        <span className="w-2 h-2 bg-primary-500 rounded-full shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{formatWhen(n.createdAt)}</p>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </div>

      {notifications.length > 0 && (
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-center">
          <Link
            href="/orders"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            View all orders
          </Link>
        </div>
      )}
    </>
  )

  const desktopPanel =
    open ? (
      <div
        ref={desktopPanelRef}
        className={`hidden sm:block absolute right-0 mt-2 z-50 ${panelClassName}`}
      >
        {panelBody}
      </div>
    ) : null

  const mobilePanel =
    mounted &&
    createPortal(
      open ? (
        <div className="fixed z-[100] top-20 left-0 right-0 px-2 flex justify-center sm:hidden pointer-events-none">
          <div ref={mobilePanelRef} className={`pointer-events-auto ${panelClassName}`}>
            {panelBody}
          </div>
        </div>
      ) : null,
      document.body
    )

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {desktopPanel}
      {mobilePanel}
    </div>
  )
}
