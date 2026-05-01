'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, Shield, Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import toast from 'react-hot-toast'
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/store/cartStore'
import { authApi } from '@/lib/api'
import { firebaseAuth } from '@/lib/firebase'

// ── Schemas ─────────────────────────────────────────────────────────────
const phoneSchema = z.object({
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^(\+92|0)?[0-9]{10,11}$/, 'Enter a valid Pakistani phone number (e.g. 03001234567)'),
})

type PhoneForm = z.infer<typeof phoneSchema>

type Step = 'phone' | 'otp'

// ── Component ───────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth } = useAuthStore()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [normalizedPhone, setNormalizedPhone] = useState('')
  const [userName, setUserName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [resendTimer, setResendTimer] = useState(0)

  const confirmationResultRef = useRef<ConfirmationResult | null>(null)
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return
    const interval = setInterval(() => setResendTimer((t) => t - 1), 1000)
    return () => clearInterval(interval)
  }, [resendTimer])

  // Cleanup reCAPTCHA on unmount
  useEffect(() => {
    return () => {
      recaptchaVerifierRef.current?.clear()
    }
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) })

  // ── Initialize reCAPTCHA ──────────────────────────────────────────────
  const initRecaptcha = () => {
    recaptchaVerifierRef.current?.clear()
    recaptchaVerifierRef.current = new RecaptchaVerifier(
      firebaseAuth,
      'recaptcha-container',
      { size: 'invisible' }
    )
    return recaptchaVerifierRef.current
  }

  // ── Send OTP ──────────────────────────────────────────────────────────
  const sendOtp = async (phoneNumber: string) => {
    setIsLoading(true)
    try {
      // Step 1: Check user existence with backend
      const res = await authApi.sendOtp(phoneNumber)
      const data = res.data

      if (!data.userExists) {
        toast.error('No account found with this number. Please register first.')
        router.push(`/register?phone=${encodeURIComponent(phoneNumber)}`)
        return
      }

      setNormalizedPhone(data.phone)
      setUserName(data.userName)

      // Step 2: Send OTP via Firebase (SMS)
      const verifier = initRecaptcha()
      const confirmation = await signInWithPhoneNumber(firebaseAuth, data.phone, verifier)
      confirmationResultRef.current = confirmation

      setStep('otp')
      setOtp(['', '', '', '', '', ''])
      setResendTimer(60)
      toast.success('OTP sent via SMS')
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to send OTP. Please try again.'
      toast.error(msg)
      recaptchaVerifierRef.current?.clear()
      recaptchaVerifierRef.current = null
    } finally {
      setIsLoading(false)
    }
  }

  const onPhoneSubmit = async (data: PhoneForm) => {
    setPhone(data.phone)
    await sendOtp(data.phone)
  }

  // ── Verify OTP ────────────────────────────────────────────────────────
  const verifyOtp = useCallback(async (code: string) => {
    if (code.length !== 6 || !confirmationResultRef.current) return
    setIsLoading(true)
    try {
      // Step 1: Confirm OTP with Firebase
      const result = await confirmationResultRef.current.confirm(code)
      const idToken = await result.user.getIdToken()

      // Step 2: Send Firebase ID token to backend
      const res = await authApi.verifyLogin(idToken)
      const { user, tokens } = res.data

      setAuth(
        {
          id: user.id,
          name: user.full_name,
          phone: user.phone,
          email: user.email,
          role: user.role,
        },
        tokens
      )

      toast.success('Login successful!')
      const redirectTo = searchParams.get('redirect') || '/'
      router.push(redirectTo)
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Invalid OTP. Please try again.'
      toast.error(msg)
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => document.getElementById('otp-0')?.focus(), 100)
    } finally {
      setIsLoading(false)
    }
  }, [setAuth, router, searchParams])

  // ── Resend OTP ────────────────────────────────────────────────────────
  const handleResend = async () => {
    await sendOtp(phone)
  }

  // ── OTP Input Handlers ────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    if (value.length > 1) {
      // Handle pasting
      const digits = value.replace(/\D/g, '').split('').slice(0, 6)
      const newOtp = [...otp]
      digits.forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d
      })
      setOtp(newOtp)
      const nextIdx = Math.min(index + digits.length, 5)
      document.getElementById(`otp-${nextIdx}`)?.focus()
      if (newOtp.every((d) => d !== '')) verifyOtp(newOtp.join(''))
      return
    }
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    if (value && index < 5) document.getElementById(`otp-${index + 1}`)?.focus()
    if (index === 5 && value) verifyOtp(newOtp.join(''))
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus()
    }
  }

  // ── Channel Buttons ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-green-50 flex items-center justify-center py-12 px-4">
      {/* Invisible reCAPTCHA container required by Firebase */}
      <div id="recaptcha-container" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-200">
              <span className="text-white font-bold text-2xl">S</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {step === 'otp' ? 'Verify OTP' : 'Welcome Back'}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              {step === 'otp'
                ? <>OTP sent to <span className="font-semibold text-gray-700">{normalizedPhone}</span> via SMS</>
                : 'Login to your Fresh Bazar account'}
            </p>
            {step === 'otp' && userName && (
              <p className="text-primary-600 font-medium mt-1">Hi, {userName}!</p>
            )}
          </div>

          <AnimatePresence mode="wait">
            {step === 'phone' ? (
              <motion.div key="phone" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <form onSubmit={handleSubmit(onPhoneSubmit)} className="space-y-5">
                  <Input
                    label="Phone Number"
                    placeholder="03XX-XXXXXXX"
                    type="tel"
                    {...register('phone')}
                    error={errors.phone?.message}
                  />

                  <Button type="submit" fullWidth isLoading={isLoading} size="lg">
                    Send OTP via SMS
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </form>
              </motion.div>
            ) : (
              <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="space-y-6">
                  {/* OTP Inputs */}
                  <div className="flex justify-center gap-2.5">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        id={`otp-${index}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onFocus={(e) => e.target.select()}
                        autoFocus={index === 0}
                        className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-gray-50 focus:bg-white"
                        disabled={isLoading}
                      />
                    ))}
                  </div>

                  {isLoading && (
                    <div className="flex items-center justify-center gap-2 text-primary-600">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-medium">Verifying...</span>
                    </div>
                  )}

                  <Button
                    onClick={() => verifyOtp(otp.join(''))}
                    fullWidth
                    isLoading={isLoading}
                    disabled={otp.some((d) => !d)}
                    size="lg"
                  >
                    Verify & Login
                  </Button>

                  {/* Resend Options */}
                  <div className="text-center">
                    {resendTimer > 0 ? (
                      <p className="text-sm text-gray-500">
                        Resend OTP in <span className="font-semibold text-gray-700">{resendTimer}s</span>
                      </p>
                    ) : (
                      <button
                        onClick={handleResend}
                        disabled={isLoading}
                        className="text-sm text-primary-600 font-medium hover:text-primary-700 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors disabled:opacity-50"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>

                  {/* Back button */}
                  <button
                    onClick={() => { setStep('phone'); setOtp(['', '', '', '', '', '']) }}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mx-auto transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Change number
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          {/* Register Link */}
          <p className="text-center text-gray-600">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary-600 font-semibold hover:text-primary-700">
              Register
            </Link>
          </p>

          {/* Security Note */}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Shield className="w-3.5 h-3.5" />
            <span>OTP verification keeps your account secure</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
