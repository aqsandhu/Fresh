'use client'

// Change-PIN page. Reachable from Settings → "PIN security" or any other
// surface that wants to let the user rotate their PIN. Reuses the same
// PinInput component used at register / login / checkout.

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import PinInput from '@/components/auth/PinInput'
import Button from '@/components/ui/Button'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'

type Stage = 'create' | 'confirm'

export default function ChangePinPage() {
  const router = useRouter()
  const { isAuthenticated, markPinVerified } = useAuthStore()

  const [stage, setStage] = useState<Stage>('create')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      // Defer to client to avoid SSR window issue.
      if (typeof window !== 'undefined') {
        router.push('/login?redirect=/settings/pin')
      }
    }
  }, [isAuthenticated, router])

  const handleFirst = (entered: string) => {
    setPin(entered)
    setPinConfirm('')
    setStage('confirm')
  }

  const handleConfirm = async (entered: string) => {
    if (entered !== pin) {
      toast.error('PINs do not match. Try again.')
      setStage('create')
      setPin('')
      setPinConfirm('')
      return
    }
    setIsSaving(true)
    try {
      await authApi.setPin(entered)
      markPinVerified() // satisfies the checkout re-auth gate immediately
      toast.success('PIN updated')
      router.push('/profile')
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Could not update PIN. Please try again.'
      toast.error(msg)
      setStage('create')
      setPin('')
      setPinConfirm('')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-green-50 py-10 px-4">
      <div className="max-w-md mx-auto">
        <Link
          href="/profile"
          className="inline-flex items-center text-gray-500 hover:text-gray-700 text-sm mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to profile
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Change PIN</h1>
              <p className="text-sm text-gray-500">
                {stage === 'create' ? 'Enter your new 4-digit PIN' : 'Re-enter to confirm'}
              </p>
            </div>
          </div>

          <PinInput
            key={stage}
            value={stage === 'create' ? pin : pinConfirm}
            onChange={stage === 'create' ? setPin : setPinConfirm}
            onComplete={stage === 'create' ? handleFirst : handleConfirm}
            disabled={isSaving}
          />

          {isSaving && (
            <div className="flex items-center justify-center gap-2 text-primary-600 mt-4">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Saving…</span>
            </div>
          )}

          {stage === 'confirm' && !isSaving && (
            <Button
              variant="ghost"
              onClick={() => { setStage('create'); setPin(''); setPinConfirm('') }}
              className="mx-auto mt-4"
            >
              Start over
            </Button>
          )}
        </motion.div>
      </div>
    </div>
  )
}
