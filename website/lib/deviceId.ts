'use client'

const KEY = 'fb_device_id'

/** Stable, opaque per-browser id for anonymous cart/abandonment tracking. */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return ''
  }
}
