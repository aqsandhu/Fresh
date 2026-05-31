'use client'

// Re-auth gate for sensitive routes (checkout). After PIN_STALE_MS of inactivity,
// asks for PIN only — never re-prompts for phone when session is still valid.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { ShieldCheck, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import PinInput from './PinInput'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'
import { maskPhone, PIN_STALE_MS } from '@/lib/phoneStorage'

interface Props {
  thresholdMs?: number
  children: React.ReactNode
}

export default function PinReauthGate({ thresholdMs = PIN_STALE_MS, children }: Props) {
  const { user, isAuthenticated, pinVerifiedAt, markPinVerified, hasHydrated } =
    useAuthStore()
  const router = useRouter()
  const pathname = usePathname() || '/checkout'
  const [pin, setPin] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
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
      const res = await authApi.verifyPin(user.phone, entered)
      const tokens = res.data?.tokens
      if (tokens?.accessToken) {
        useAuthStore.getState().setAuth(
          {
            id: user.id,
            name: user.name,
            phone: res.data?.user?.phone || user.phone,
            email: user.email,
            role: user.role,
          },
          {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          }
        )
      } else {
        markPinVerified()
      }
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
          <h2 className="text-lg font-bold text-gray-900">Welcome back</h2>
          <p className="text-sm text-gray-500 mt-1">
            Enter your 4-digit PIN to continue
          </p>
          <p className="text-sm font-semibold text-gray-800 mt-3 tracking-wide">
            {maskPhone(user.phone)}
          </p>
        </div>
        <PinInput value={pin} onChange={setPin} onComplete={handleVerify} disabled={isVerifying} />
        {isVerifying && (
          <div className="flex items-center justify-center gap-2 text-primary-600 mt-4">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Verifying…</span>
          </div>
        )}
        <p className="text-center text-sm mt-6">
          <Link
            href={`/login?redirect=${encodeURIComponent(pathname)}&another=1`}
            className="text-primary-600 font-medium hover:text-primary-700"
          >
            Login with another number
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
