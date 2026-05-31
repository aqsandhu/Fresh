'use client'

import { create } from 'zustand'

export interface AppNotification {
  id: string
  type: string
  title: string
  message: string
  orderId?: string
  isRead: boolean
  createdAt: string
  actionUrl?: string
}

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  isLoading: boolean
  setNotifications: (items: AppNotification[], unreadCount?: number) => void
  addNotification: (item: AppNotification) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  setNotifications: (items, unreadCount) =>
    set({
      notifications: items,
      unreadCount: unreadCount ?? items.filter((n) => !n.isRead).length,
    }),

  addNotification: (item) => {
    const exists = get().notifications.some((n) => n.id === item.id)
    if (exists) return
    const notifications = [item, ...get().notifications].slice(0, 50)
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.isRead).length,
    })
  },

  markAsRead: (id) => {
    const notifications = get().notifications.map((n) =>
      n.id === id ? { ...n, isRead: true } : n
    )
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.isRead).length,
    })
  },

  markAllAsRead: () => {
    const notifications = get().notifications.map((n) => ({ ...n, isRead: true }))
    set({ notifications, unreadCount: 0 })
  },

  setLoading: (isLoading) => set({ isLoading }),

  reset: () => set({ notifications: [], unreadCount: 0, isLoading: false }),
}))
