'use client'

// Re-auth gate. Wrap anything sensitive (checkout in particular) with this
// component. If the user has been inactive for longer than the threshold,
// it asks for their 4-digit PIN before rendering children. Once verified,
// the user's pinVerifiedAt timestamp is bumped so the gate stops asking
// for the rest of the activity window.
//
// We never re-prompt for the phone number — the user is already logged
// in, the gate just confirms it's still them on the device.

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { ShieldCheck, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import PinInput from './PinInput'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'

interface Props {
  /** How fresh a PIN verification has to be before children render. */
  thresholdMs?: number
  children: React.ReactNode
}

const DEFAULT_THRESHOLD = 30 * 60 * 1000 // 30 minutes

export default function PinReauthGate({ thresholdMs = DEFAULT_THRESHOLD, children }: Props) {
  const { user, isAuthenticated, pinVerifiedAt, markPinVerified, hasHydrated } =
    useAuthStore()
  const router = useRouter()
  const pathname = usePathname() || '/checkout'
  const [pin, setPin] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  // We compute "stale" once at mount to avoid flicker as time passes; the
  // user can hold the page open for hours after verifying without being
  // re-prompted mid-flow.
  const [stale, setStale] = useState<boolean>(() => {
    if (!pinVerifiedAt) return true
    return Date.now() - pinVerifiedAt > thresholdMs
  })

  useEffect(() => {
    if (!pinVerifiedAt) {
      setStale(true)
      return
    }
    setStale(Date.now() - pinVerifiedAt > thresholdMs)
  }, [pinVerifiedAt, thresholdMs])

  // Redirect to /login ONLY after the persisted auth store has finished
  // hydrating from localStorage. Otherwise a hard refresh redirects an
  // already-logged-in user back to /login because the initial state is
  // "not authenticated" for one render before rehydration completes.
  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated || !user?.phone) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [hasHydrated, isAuthenticated, user?.phone, pathname, router])

  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!isAuthenticated || !user?.phone) {
    return null
  }

  const handleVerify = async (entered: string) => {
    if (!user?.phone) {
      toast.error('Session error. Please log in again.')
      return
    }
    setIsVerifying(true)
    try {
      // verify-pin issues fresh tokens too — that's fine, the auth store
      // can keep the new pair. But we don't strictly need them here; the
      // current point is just to confirm the PIN.
      await authApi.verifyPin(user.phone, entered)
      markPinVerified()
      setStale(false)
      setPin('')
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Wrong PIN. Please try again.'
      toast.error(msg)
      setPin('')
    } finally {
      setIsVerifying(false)
    }
  }

  if (!stale) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-green-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8"
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center mb-3">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Confirm it's you</h2>
          <p className="text-sm text-gray-500 mt-1">
            You've been away for a while. Enter your 4-digit PIN to continue.
          </p>
        </div>
        <PinInput value={pin} onChange={setPin} onComplete={handleVerify} disabled={isVerifying} />
        {isVerifying && (
          <div className="flex items-center justify-center gap-2 text-primary-600 mt-4">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Verifying…</span>
          </div>
        )}
      </motion.div>
    </div>
  )
}
