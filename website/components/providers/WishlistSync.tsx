'use client'

// The wishlist follows the account (W22). At sign-in (or a page opened with a
// session) this device's list is joined to the account's — nothing lost,
// nothing doubled — and the account's list is shown from then on. At
// sign-out the device's copy is cleared, so the next person on this browser
// does not see it.
import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/cartStore'
import { useWishlistStore } from '@/store/wishlistStore'
import { wishlistApi } from '@/lib/api'

export default function WishlistSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const ready = useAuthStore((s) => s.hasHydrated)
  const wasSignedIn = useRef<boolean | null>(null)

  useEffect(() => {
    if (!ready) return
    const before = wasSignedIn.current
    wasSignedIn.current = isAuthenticated
    if (isAuthenticated) {
      const { ids, unsynced, replace } = useWishlistStore.getState()
      // Guest changes are joined; otherwise the account's list is the truth.
      ;(unsynced ? wishlistApi.merge(ids) : wishlistApi.get())
        .then(replace)
        .catch(() => {
          /* offline: keep this device's list; the next sign-in / page load joins it */
        })
    } else if (before === true) {
      useWishlistStore.getState().clear()
    }
  }, [isAuthenticated, ready])

  return null
}
