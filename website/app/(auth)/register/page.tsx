'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, Shield, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
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

type Step = 'phone' | 'otp' | 'profile'

// ── Schemas ─────────────────────────────────────────────────────────────
const phoneSchema = z.object({
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^(\+92|0)?[0-9]{10,11}$/, 'Enter a valid Pakistani number (e.g. 03001234567)'),
})

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type PhoneForm = z.infer<typeof phoneSchema>
type ProfileForm = z.infer<typeof profileSchema>

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth } = useAuthStore()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState(searchParams.get('phone') || '')
  const [normalizedPhone, setNormalizedPhone] = useState('')
  const [firebaseIdToken, setFirebaseIdToken] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [resendTimer, setResendTimer] = useState(0)
  const [showPassword, setShowPassword] = useState(false)

  const confirmationResultRef = useRef<ConfirmationResult | null>(null)
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)

  // Resend countdown
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

  const phoneForm = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: searchParams.get('phone') || '' },
  })

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
  })

  // ── Initialize reCAPTCHA ──────────────────────────────────────────────
  const initRecaptcha = () => {
    recaptchaVerifierRef.current?.clear()
    recaptchaVerifierRef.current = new RecaptchaVerifier(
      firebaseAuth,
      'recaptcha-container-register',
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

      if (data.userExists) {
        toast.error('This number is already registered. Please login instead.')
        router.push(`/login`)
        return
      }

      setNormalizedPhone(data.phone)

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

  // ── Verify OTP → Go to profile step ───────────────────────────────────
  const verifyOtp = useCallback(async (code: string) => {
    if (code.length !== 6 || !confirmationResultRef.current) return
    setIsLoading(true)
    try {
      // Confirm OTP with Firebase → get ID token
      const result = await confirmationResultRef.current.confirm(code)
      const idToken = await result.user.getIdToken()
      setFirebaseIdToken(idToken)
      setStep('profile')
      toast.success('Phone verified! Now set up your profile.')
    } catch (err: any) {
      const msg = err?.message || 'Invalid OTP. Please try again.'
      toast.error(msg)
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => document.getElementById('rotp-0')?.focus(), 100)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── Complete Registration ─────────────────────────────────────────────
  const onProfileSubmit = async (data: ProfileForm) => {
    setIsLoading(true)
    try {
      const res = await authApi.verifyRegister({
        idToken: firebaseIdToken,
        full_name: data.full_name,
        email: data.email || undefined,
        password: data.password,
      })

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

      toast.success('Account created successfully!')
      router.push('/')
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Registration failed. Please try again.'
      toast.error(msg)
      if (msg.includes('expired') || msg.includes('not found')) {
        setStep('phone')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ── Resend OTP ────────────────────────────────────────────────────────
  const handleResend = async () => {
    await sendOtp(phone)
  }

  // ── OTP Input Handlers ────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').split('').slice(0, 6)
      const newOtp = [...otp]
      digits.forEach((d, i) => { if (index + i < 6) newOtp[index + i] = d })
      setOtp(newOtp)
      const nextIdx = Math.min(index + digits.length, 5)
      document.getElementById(`rotp-${nextIdx}`)?.focus()
      if (newOtp.every((d) => d !== '')) verifyOtp(newOtp.join(''))
      return
    }
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    if (value && index < 5) document.getElementById(`rotp-${index + 1}`)?.focus()
    if (index === 5 && value) verifyOtp(newOtp.join(''))
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`rotp-${index - 1}`)?.focus()
    }
  }

  // ── Step Indicator ────────────────────────────────────────────────────
  const steps = [
    { key: 'phone', label: 'Phone' },
    { key: 'otp', label: 'Verify' },
    { key: 'profile', label: 'Profile' },
  ]
  const currentStepIndex = steps.findIndex((s) => s.key === step)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-green-50 flex items-center justify-center py-12 px-4">
      {/* Invisible reCAPTCHA container required by Firebase */}
      <div id="recaptcha-container-register" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-200">
              <span className="text-white font-bold text-2xl">S</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
            <p className="text-gray-500 mt-1 text-sm">Join Fresh Bazar for fresh groceries</p>
          </div>

          {/* Step Indicators */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < currentStepIndex
                    ? 'bg-primary-600 text-white'
                    : i === currentStepIndex
                    ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-300'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  {i < currentStepIndex ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-8 h-0.5 ${i < currentStepIndex ? 'bg-primary-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ── Step 1: Phone ──────────────────────────────────────── */}
            {step === 'phone' && (
              <motion.div key="phone" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-5">
                  <Input
                    label="Phone Number"
                    placeholder="03XX-XXXXXXX"
                    type="tel"
                    {...phoneForm.register('phone')}
                    error={phoneForm.formState.errors.phone?.message}
                  />

                  <Button type="submit" fullWidth isLoading={isLoading} size="lg">
                    Send OTP via SMS
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </form>
              </motion.div>
            )}

            {/* ── Step 2: OTP ────────────────────────────────────────── */}
            {step === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="space-y-6">
                  <p className="text-center text-sm text-gray-500">
                    Enter the OTP sent to <span className="font-semibold text-gray-700">{normalizedPhone}</span> via SMS
                  </p>

                  <div className="flex justify-center gap-2.5">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        id={`rotp-${index}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onFocus={(e) => e.target.select()}
                        autoFocus={index === 0}
                        className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-gray-50 focus:bg-white"
                      />
                    ))}
                  </div>

                  <Button
                    onClick={() => verifyOtp(otp.join(''))}
                    fullWidth
                    disabled={otp.some((d) => !d)}
                    size="lg"
                  >
                    Verify Phone
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>

                  <div className="text-center">
                    {resendTimer > 0 ? (
                      <p className="text-sm text-gray-500">
                        Resend in <span className="font-semibold text-gray-700">{resendTimer}s</span>
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

            {/* ── Step 3: Profile & Password ─────────────────────────── */}
            {step === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="mb-4 flex items-center gap-2 bg-green-50 text-green-700 text-sm px-4 py-2.5 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Phone <strong>{phone}</strong> verified!</span>
                </div>

                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                  <Input
                    label="Full Name"
                    placeholder="Enter your full name"
                    {...profileForm.register('full_name')}
                    error={profileForm.formState.errors.full_name?.message}
                  />

                  <Input
                    label="Email (Optional)"
                    type="email"
                    placeholder="your@email.com"
                    {...profileForm.register('email')}
                    error={profileForm.formState.errors.email?.message}
                  />

                  <div className="relative">
                    <Input
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 8 chars, 1 uppercase, 1 number"
                      {...profileForm.register('password')}
                      error={profileForm.formState.errors.password?.message}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <Input
                    label="Confirm Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Re-enter your password"
                    {...profileForm.register('confirmPassword')}
                    error={profileForm.formState.errors.confirmPassword?.message}
                  />

                  <Button type="submit" fullWidth isLoading={isLoading} size="lg">
                    Create Account
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </form>
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

          <p className="text-center text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-primary-600 font-semibold hover:text-primary-700">
              Login
            </Link>
          </p>

          <p className="mt-6 text-xs text-center text-gray-400">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="text-primary-600 hover:underline">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-primary-600 hover:underline">Privacy Policy</Link>
          </p>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Shield className="w-3.5 h-3.5" />
            <span>Phone verified via OTP for your security</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
