// Sign-in, notifications, chat, addresses, AI help — moved from api.ts (W21: only the place changed, not the behaviour).

import { Address } from '@/types'
import { withCityParams, api } from './shared'

// Auth API
export const authApi = {
  // Step 1: Check the phone + (in backend-OTP mode) have the server send the
  // code itself — WhatsApp first, SMS fallback. Response data carries
  // { mode: 'bypass'|'backend'|'firebase', channel?: 'whatsapp'|'sms' }.
  sendOtp: async (phone: string, channel?: 'whatsapp' | 'sms') => {
    const response = await api.post('/auth/send-otp', channel ? { phone, channel } : { phone })
    return response.data // { success, data: { phone, userExists, userName, mode, channel }, message }
  },

  // Step 2a: Verify Firebase ID token and login (existing user)
  verifyLogin: async (idToken: string) => {
    const response = await api.post('/auth/verify-login', { idToken })
    return response.data // { success, data: { user, tokens }, message }
  },

  // Temporary bypass — phone + fixed OTP code (when NEXT_PUBLIC_OTP_BYPASS=true)
  verifyLoginWithCode: async (phone: string, code: string) => {
    const response = await api.post('/auth/verify-login', { phone, code })
    return response.data
  },

  // Step 2b: Verify Firebase ID token and register (new user)
  verifyRegister: async (data: {
    idToken: string
    full_name: string
    email?: string
  }) => {
    const response = await api.post('/auth/verify-register', data)
    return response.data // { success, data: { user, tokens }, message }
  },

  verifyRegisterWithCode: async (data: {
    phone: string
    code: string
    full_name: string
    email?: string
  }) => {
    const response = await api.post('/auth/verify-register', data)
    return response.data
  },

  // Self-service account deletion (Play Store / App Store requirement) —
  // anonymizes the account server-side and revokes every session.
  deleteAccount: async (pin?: string) => {
    const response = await api.post('/auth/delete-account', pin ? { pin } : {})
    return response.data
  },

  // ─── 4-digit PIN flow ──────────────────────────────────────────────────
  // After the one-time OTP at registration, every subsequent login uses a
  // 4-digit PIN. Forgot PIN → reuses send-otp + reset-pin.

  pinStatus: async (phone: string): Promise<{ exists: boolean; hasPin: boolean; fullName?: string }> => {
    const response = await api.get('/auth/pin-status', { params: { phone } })
    return response.data?.data || { exists: false, hasPin: false }
  },

  // Contract C2: users who already have a PIN must prove the current one
  // before rotating. Backend responds with data.sessions_revoked=true on a
  // successful change (all refresh tokens revoked → re-login required).
  setPin: async (pin: string, currentPin?: string) => {
    const response = await api.post('/auth/set-pin', currentPin ? { pin, current_pin: currentPin } : { pin })
    return response.data
  },

  verifyPin: async (phone: string, pin: string) => {
    const response = await api.post('/auth/verify-pin', { phone, pin })
    return response.data // { success, data: { user, tokens }, message }
  },

  // After a Firebase OTP that the user requested via the "forgot PIN" flow.
  resetPin: async (idToken: string, newPin: string) => {
    const response = await api.post('/auth/reset-pin', { idToken, newPin })
    return response.data
  },

  resetPinWithCode: async (phone: string, code: string, newPin: string) => {
    const response = await api.post('/auth/reset-pin', { phone, code, newPin })
    return response.data
  },

  // Get current user profile
  getProfile: async () => {
    const response = await api.get('/auth/me')
    return response.data
  },

  // Short-lived token for the Socket.IO handshake. In cookie mode the websocket
  // connects cross-site to the backend host where the HttpOnly cookie can't be
  // sent, so we mint a handshake token over this same-origin (cookie-authed)
  // call instead. Returns null if the session isn't valid.
  getSocketToken: async (): Promise<string | null> => {
    try {
      const response = await api.get('/auth/socket-token')
      return response.data?.data?.token ?? null
    } catch {
      return null
    }
  },

  // Update user profile
  updateProfile: async (data: { full_name?: string; email?: string; preferred_language?: string; notification_enabled?: boolean }) => {
    const response = await api.put('/auth/profile', data)
    return response.data
  },

  // Change password
  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await api.put('/auth/change-password', { currentPassword, newPassword })
    return response.data
  },

  // Refresh token
  refreshToken: async (refreshToken: string) => {
    const response = await api.post('/auth/refresh', { refreshToken })
    return response.data
  },
}

// Notifications API
export const notificationsApi = {
  getAll: async (): Promise<{ notifications: Array<{
    id: string
    type: string
    title: string
    message: string
    orderId?: string
    isRead: boolean
    createdAt: string
    actionUrl?: string
  }>; unreadCount: number }> => {
    const response = await api.get('/notifications')
    const data = response.data?.data || response.data
    return {
      notifications: data?.notifications || [],
      unreadCount: data?.unreadCount ?? 0,
    }
  },

  markAsRead: async (id: string) => {
    const response = await api.patch(`/notifications/${id}/read`)
    return response.data
  },

  markAllAsRead: async () => {
    const response = await api.patch('/notifications/read-all')
    return response.data
  },
}

// Chat API
export const chatApi = {
  getMessages: async (orderId: string) => {
    const response = await api.get(`/chat/${orderId}`)
    return response.data
  },
  sendMessage: async (orderId: string, message: string) => {
    const response = await api.post(`/chat/${orderId}`, { message })
    return response.data
  },
}

// ── Reviews & Complaints (Feature 3) ────────────────────────────────────────

// Addresses API
export const addressesApi = {
  getAll: async (): Promise<Address[]> => {
    const response = await api.get('/addresses')
    const body = response.data
    return body.data || []
  },

  create: async (data: Record<string, any>): Promise<Address> => {
    const response = await api.post('/addresses', data)
    const body = response.data
    return body.data || body
  },

  /** Create address with optional door picture (multipart). */
  createWithDoorPicture: async (
    fields: Record<string, string | number | boolean>,
    doorPicture: File
  ): Promise<Address> => {
    const formData = new FormData()
    Object.entries(fields).forEach(([k, v]) => formData.append(k, String(v)))
    formData.append('door_picture', doorPicture, doorPicture.name || 'door.jpg')
    const response = await api.post('/addresses', formData)
    const body = response.data
    return body.data || body
  },

  /** Update address with optional door picture (multipart). */
  updateWithDoorPicture: async (
    id: string,
    fields: Record<string, string | number | boolean>,
    doorPicture: File
  ): Promise<Address> => {
    const formData = new FormData()
    Object.entries(fields).forEach(([k, v]) => formData.append(k, String(v)))
    formData.append('door_picture', doorPicture, doorPicture.name || 'door.jpg')
    const response = await api.put(`/addresses/${id}`, formData)
    const body = response.data
    return body.data || body
  },

  update: async (id: string, data: Partial<Address>) => {
    const response = await api.put(`/addresses/${id}`, data)
    const body = response.data
    return body.data || body
  },

  delete: async (id: string) => {
    const response = await api.delete(`/addresses/${id}`)
    return response.data
  },
}

// AI assistant API (public). Key stays on the server.
export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export const aiChatApi = {
  getStatus: async (): Promise<{ enabled: boolean }> => {
    const response = await api.get('/ai-chat/status')
    return response.data?.data || response.data
  },
  sendMessage: async (messages: AiChatMessage[], page?: string): Promise<{ reply: string }> => {
    const response = await api.post(
      '/ai-chat/message',
      { messages, page },
      { params: withCityParams() }
    )
    return response.data?.data || response.data
  },
}
