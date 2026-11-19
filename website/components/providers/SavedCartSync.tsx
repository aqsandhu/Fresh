'use client'

// The cart belongs to the account (owner decision Q5 — rules in lib/savedCart).
// This keeps the browser's cart in line with it: after sign-in, when the page
// loads with a session, when the city changes, and whenever the customer comes
// back to this tab (the cart may have been changed on their phone meanwhile).
import { useEffect } from 'react'
import { useAuthStore, useCartStore } from '@/store/cartStore'
import { syncSavedCart, syncSavedCartIfStale, watchCartChanges } from '@/lib/savedCartSync'

export default function SavedCartSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const authReady = useAuthStore((s) => s.hasHydrated)
  const cartReady = useCartStore((s) => s.hasHydrated)
  const cityId = useCartStore((s) => s.activeCityId)

  useEffect(() => watchCartChanges(), [])

  useEffect(() => {
    if (isAuthenticated && authReady && cartReady) void syncSavedCart()
  }, [isAuthenticated, authReady, cartReady, cityId])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncSavedCartIfStale()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  return null
}
