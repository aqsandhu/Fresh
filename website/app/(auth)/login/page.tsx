'use client'

// Login depends on Firebase Auth (browser-only) — opt out of static
// prerender so the firebase SDK isn't pulled into the build-time Node
// environment.
export const dynamic = 'force-dynamic'

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
import { getFirebaseAuth } from '@/lib/firebase'
import { firebaseErrorMessage } from '@/lib/firebase-errors'
import { isOtpBypassEnabled, otpBypassHint } from '@/lib/otpBypass'
import PinInput from '@/components/auth/PinInput'
import BrandLogo from '@/components/ui/BrandLogo'
import AutoHeight from '@/components/ui/AutoHeight'
import {
  clearLastPhone,
  getLastPhone,
  maskPhone,
  setLastPhone,
} from '@/lib/phoneStorage'

// ── Schemas ─────────────────────────────────────────────────────────────
const phoneSchema = z.object({
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^(\+92|0)?[0-9]{10,11}$/, 'Enter a valid Pakistani phone number (e.g. 03001234567)'),
})

type PhoneForm = z.infer<typeof phoneSchema>

type Step = 'phone' | 'pin' | 'otp' | 'newPin'

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
  const [pin, setPin] = useState('')
  const [bootstrapping, setBootstrapping] = useState(true)
  const [otpPurpose, setOtpPurpose] = useState<'login' | 'resetPin'>('login')
  const [newPin, setNewPin] = useState('')
  const [newPinConfirm, setNewPinConfirm] = useState('')

  const confirmationResultRef = useRef<ConfirmationResult | null>(null)
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)
  const resetIdTokenRef = useRef<string | null>(null)
  const resetOtpCodeRef = useRef<string | null>(null)

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
    setValue,
    formState: { errors },
  } = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) })

  useEffect(() => {
    const phoneParam = searchParams.get('phone')
    if (phoneParam) {
      setPhone(phoneParam)
      setValue('phone', phoneParam)
    }
  }, [searchParams, setValue])

  // Returning users: skip phone entry when we have a saved number with PIN set.
  useEffect(() => {
    let cancelled = false

    async function bootstrapPinLogin() {
      if (searchParams.get('another') === '1') {
        clearLastPhone()
        setStep('phone')
        setBootstrapping(false)
        return
      }

      if (searchParams.get('phone')) {
        setBootstrapping(false)
        return
      }

      const saved = getLastPhone()
      if (!saved) {
        setBootstrapping(false)
        return
      }

      try {
        const status = await authApi.pinStatus(saved)
        if (cancelled) return
        if (status.exists && status.hasPin) {
          setPhone(saved)
          setNormalizedPhone(saved)
          setUserName(status.fullName || null)
          setPin('')
          setStep('pin')
        }
      } catch {
        /* fall through to phone step */
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    }

    bootstrapPinLogin()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  // ── Initialize reCAPTCHA ──────────────────────────────────────────────
  const initRecaptcha = () => {
    recaptchaVerifierRef.current?.clear()
    recaptchaVerifierRef.current = new RecaptchaVerifier(
      getFirebaseAuth(),
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

      if (isOtpBypassEnabled()) {
        setStep('otp')
        setOtp(['', '', '', '', '', ''])
        setResendTimer(60)
        toast.success(otpBypassHint(), { duration: 6000 })
        return
      }

      // Step 2: Send OTP via Firebase (SMS)
      const verifier = initRecaptcha()
      const confirmation = await signInWithPhoneNumber(getFirebaseAuth(), data.phone, verifier)
      confirmationResultRef.current = confirmation

      setStep('otp')
      setOtp(['', '', '', '', '', ''])
      setResendTimer(60)
      toast.success('OTP sent via SMS')
    } catch (err: any) {
      // Surface the Firebase error code in the toast so a screenshot tells
      // us exactly what's wrong (config issue, quota, unauthorized domain,
      // etc.) instead of just "Failed to send OTP".
      const backendMsg = err?.response?.data?.message
      const msg = backendMsg || firebaseErrorMessage(err, 'Failed to send OTP. Please try again.')
      // Long messages don't fit in default toast — let the user read it.
      toast.error(msg, { duration: 8000 })
      // eslint-disable-next-line no-console
      console.error('[Firebase OTP send error]', err)
      recaptchaVerifierRef.current?.clear()
      recaptchaVerifierRef.current = null
    } finally {
      setIsLoading(false)
    }
  }

  // ── Phone submit ──────────────────────────────────────────────────────
  // First check whether this phone has a PIN set. If yes, jump to PIN entry
  // (no SMS sent). If no, fall back to OTP. New phones bounce to /register.
  const onPhoneSubmit = async (data: PhoneForm) => {
    setPhone(data.phone)
    setIsLoading(true)
    try {
      const status = await authApi.pinStatus(data.phone)

      if (!status.exists) {
        const redirect = searchParams.get('redirect')
        const params = new URLSearchParams({
          phone: data.phone,
          autoOtp: '1',
        })
        if (redirect) params.set('redirect', redirect)
        router.push(`/register?${params.toString()}`)
        return
      }

      setUserName(status.fullName || null)
      setNormalizedPhone(data.phone)

      if (status.hasPin) {
        setOtpPurpose('login')
        setPin('')
        setStep('pin')
      } else {
        setOtpPurpose('login')
        await sendOtp(data.phone)
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to start sign-in. Please try again.'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  // Verify PIN against backend, set tokens, redirect.
  const verifyPinHandler = useCallback(async (entered: string) => {
    if (entered.length !== 4) return
    setIsLoading(true)
    try {
      const res = await authApi.verifyPin(normalizedPhone || phone, entered)
      const { user, tokens } = res.data
      setLastPhone(user.phone)
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
      const msg = err?.response?.data?.message || 'Invalid PIN. Please try again.'
      toast.error(msg)
      setPin('')
    } finally {
      setIsLoading(false)
    }
  }, [normalizedPhone, phone, setAuth, router, searchParams])

  const handleUseAnotherNumber = () => {
    clearLastPhone()
    setStep('phone')
    setPhone('')
    setNormalizedPhone('')
    setPin('')
    setUserName(null)
  }

  // Forgot PIN — OTP verify, then set a new PIN.
  const handleForgotPin = async () => {
    if (!phone) return
    setOtpPurpose('resetPin')
    await sendOtp(phone)
  }

  const handleNewPinSubmit = async () => {
    if (newPin.length !== 4 || newPinConfirm.length !== 4) {
      toast.error('Please enter and confirm your 4-digit PIN.')
      return
    }
    if (newPin !== newPinConfirm) {
      toast.error('PINs do not match. Please try again.')
      setNewPin('')
      setNewPinConfirm('')
      return
    }

    setIsLoading(true)
    try {
      if (isOtpBypassEnabled()) {
        const code = resetOtpCodeRef.current
        if (!code) {
          toast.error('Verification expired. Please request OTP again.')
          setStep('pin')
          return
        }
        await authApi.resetPinWithCode(normalizedPhone || phone, code, newPin)
        const res = await authApi.verifyLoginWithCode(normalizedPhone || phone, code)
        const { user, tokens } = res.data
        setLastPhone(user.phone)
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
      } else {
        if (!resetIdTokenRef.current) {
          toast.error('Verification expired. Please request OTP again.')
          setStep('pin')
          return
        }
        await authApi.resetPin(resetIdTokenRef.current, newPin)
        const res = await authApi.verifyLogin(resetIdTokenRef.current)
        const { user, tokens } = res.data
        setLastPhone(user.phone)
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
      }

      toast.success('PIN updated. You are now logged in.')
      setOtpPurpose('login')
      resetIdTokenRef.current = null
      resetOtpCodeRef.current = null
      setNewPin('')
      setNewPinConfirm('')
      const redirectTo = searchParams.get('redirect') || '/'
      router.push(redirectTo)
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to reset PIN. Please try again.'
      toast.error(msg)
      setNewPin('')
      setNewPinConfirm('')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Verify OTP ────────────────────────────────────────────────────────
  const verifyOtp = useCallback(async (code: string) => {
    if (code.length !== 6) return
    if (!isOtpBypassEnabled() && !confirmationResultRef.current) return
    setIsLoading(true)
    try {
      if (otpPurpose === 'resetPin') {
        if (isOtpBypassEnabled()) {
          resetOtpCodeRef.current = code
        } else {
          const result = await confirmationResultRef.current!.confirm(code)
          resetIdTokenRef.current = await result.user.getIdToken()
        }
        setNewPin('')
        setNewPinConfirm('')
        setStep('newPin')
        toast.success('OTP verified. Set your new PIN below.')
        return
      }

      if (isOtpBypassEnabled()) {
        const res = await authApi.verifyLoginWithCode(normalizedPhone || phone, code)
        const { user, tokens } = res.data
        setLastPhone(user.phone)
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
        return
      }

      // Step 1: Confirm OTP with Firebase
      const result = await confirmationResultRef.current!.confirm(code)
      const idToken = await result.user.getIdToken()

      // Step 2: Send Firebase ID token to backend
      const res = await authApi.verifyLogin(idToken)
      const { user, tokens } = res.data
      setLastPhone(user.phone)

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
      const backendMsg = err?.response?.data?.message
      const msg = backendMsg || firebaseErrorMessage(err, 'Invalid OTP. Please try again.')
      toast.error(msg, { duration: 8000 })
      // eslint-disable-next-line no-console
      console.error('[Firebase OTP verify error]', err)
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => document.getElementById('otp-0')?.focus(), 100)
    } finally {
      setIsLoading(false)
    }
  }, [setAuth, router, searchParams, normalizedPhone, phone, otpPurpose])

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

  if (bootstrapping) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-primary-50 via-white to-green-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  const isCompactStep = step === 'otp' || step === 'newPin'

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-primary-50 via-white to-green-50 flex items-start sm:items-center justify-center py-4 sm:py-8 px-3 sm:px-4 overflow-y-auto">
      {/* Invisible reCAPTCHA container required by Firebase */}
      <div id="recaptcha-container" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md my-auto"
      >
        <div
          className={`bg-white rounded-xl sm:rounded-2xl shadow-xl border border-gray-100 ${
            isCompactStep ? 'p-4 sm:p-6' : 'p-5 sm:p-8'
          }`}
        >
          {/* Logo */}
          <div className={`text-center ${isCompactStep ? 'mb-4' : 'mb-6 sm:mb-8'}`}>
            <div className={`flex justify-center ${isCompactStep ? 'mb-2' : 'mb-3 sm:mb-4'}`}>
              <BrandLogo
                imgClassName={
                  isCompactStep
                    ? 'h-10 w-auto max-w-none object-contain'
                    : 'h-14 sm:h-16 w-auto max-w-none object-contain'
                }
              />
            </div>
            <h1 className={`font-bold text-gray-900 ${isCompactStep ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'}`}>
              {step === 'otp'
                ? 'Verify OTP'
                : step === 'newPin'
                  ? 'Set New PIN'
                  : step === 'pin'
                    ? `Welcome${userName ? `, ${userName}` : ' back'}`
                    : 'Welcome Back'}
            </h1>
            <p className="text-gray-500 mt-1 text-xs sm:text-sm px-1">
              {step === 'otp' ? (
                isOtpBypassEnabled() ? (
                  <span className="text-amber-600">{otpBypassHint()}</span>
                ) : (
                  <>
                    {otpPurpose === 'resetPin' ? 'Verify OTP to reset your PIN for ' : 'OTP sent to '}
                    <span className="font-semibold text-gray-700">{normalizedPhone}</span>
                    {otpPurpose === 'login' && ' via SMS'}
                  </>
                )
              ) : step === 'newPin' ? (
                'Enter and confirm your new 4-digit PIN'
              ) : step === 'pin' ? (
                <>Enter your 4-digit PIN for <span className="font-semibold text-gray-800">{maskPhone(normalizedPhone || phone)}</span></>
              ) : (
                'Login to your Fresh Bazar account'
              )}
            </p>
            {step === 'otp' && userName && (
              <p className="text-primary-600 font-medium mt-1">Hi, {userName}!</p>
            )}
          </div>

          <AutoHeight>
          <AnimatePresence mode="wait" initial={false}>
            {step === 'phone' ? (
              <motion.div key="phone" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2, ease: 'easeInOut' }}>
                <form onSubmit={handleSubmit(onPhoneSubmit)} className="space-y-5">
                  <Input
                    label="Phone Number"
                    placeholder="03XX-XXXXXXX"
                    type="tel"
                    {...register('phone')}
                    error={errors.phone?.message}
                  />

                  <Button type="submit" fullWidth isLoading={isLoading} size="lg">
                    Continue
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                  <p className="text-center text-xs text-gray-500">
                    New customer? Enter your number — we&apos;ll verify with OTP on the next screen.
                  </p>
                </form>
              </motion.div>
            ) : step === 'pin' ? (
              <motion.div
                key="pin"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                <div className="space-y-6">
                  <PinInput value={pin} onChange={setPin} onComplete={verifyPinHandler} disabled={isLoading} />
                  {isLoading && (
                    <div className="flex items-center justify-center gap-2 text-primary-600">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-medium">Verifying…</span>
                    </div>
                  )}
                  <div className="text-center space-y-3">
                    <button
                      onClick={handleForgotPin}
                      disabled={isLoading}
                      className="text-primary-600 font-medium hover:text-primary-700 disabled:opacity-50"
                    >
                      Forgot PIN? Sign in with OTP
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      fullWidth
                      onClick={handleUseAnotherNumber}
                      disabled={isLoading}
                    >
                      Login with another number
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : step === 'newPin' ? (
              <motion.div
                key="newPin"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                <div className="space-y-4 sm:space-y-5">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2 text-center">New PIN</p>
                    <PinInput
                      value={newPin}
                      onChange={setNewPin}
                      disabled={isLoading}
                      autoFocus
                      size="compact"
                    />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2 text-center">Confirm PIN</p>
                    <PinInput
                      value={newPinConfirm}
                      onChange={setNewPinConfirm}
                      disabled={isLoading}
                      autoFocus={false}
                      size="compact"
                    />
                  </div>
                  <Button
                    fullWidth
                    size="lg"
                    onClick={handleNewPinSubmit}
                    isLoading={isLoading}
                    disabled={newPin.length !== 4 || newPinConfirm.length !== 4}
                    className="!py-2.5 sm:!py-3"
                  >
                    Save PIN & Continue
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="otp" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2, ease: 'easeInOut' }}>
                <div className="space-y-4 sm:space-y-5">
                  {/* OTP Inputs */}
                  <div className="flex justify-center gap-1.5 sm:gap-2.5 max-w-full">
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
                        className="w-9 h-11 sm:w-11 sm:h-14 md:w-12 text-center text-lg sm:text-xl font-bold border-2 border-gray-200 rounded-lg sm:rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-gray-50 focus:bg-white disabled:opacity-50 flex-1 max-w-[2.75rem] sm:max-w-none sm:flex-none"
                        disabled={isLoading}
                      />
                    ))}
                  </div>

                  {isLoading && (
                    <div className="flex items-center justify-center gap-2 text-primary-600">
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                      <span className="text-xs sm:text-sm font-medium">Verifying...</span>
                    </div>
                  )}

                  <Button
                    onClick={() => verifyOtp(otp.join(''))}
                    fullWidth
                    isLoading={isLoading}
                    disabled={otp.some((d) => !d)}
                    size="lg"
                    className="!py-2.5 sm:!py-3"
                  >
                    {otpPurpose === 'resetPin' ? 'Verify OTP' : 'Verify & Login'}
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
                    onClick={() => {
                      setOtpPurpose('login')
                      setStep('phone')
                      setOtp(['', '', '', '', '', ''])
                    }}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mx-auto transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Change number
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </AutoHeight>

          {!isCompactStep && (
            <>
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
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
