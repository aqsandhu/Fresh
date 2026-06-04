'use client'

// Register depends on Firebase Auth (browser-only) — opt out of static
// prerender so the firebase SDK isn't pulled into the build-time Node
// environment.
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, Shield, Loader2, CheckCircle2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import toast from 'react-hot-toast'
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth'
import Button from '@/components/ui/Button'
import BrandLogo from '@/components/ui/BrandLogo'
import Input from '@/components/ui/Input'
import PinInput from '@/components/auth/PinInput'
import { useAuthStore } from '@/store/cartStore'
import { authApi } from '@/lib/api'
import { getFirebaseAuth } from '@/lib/firebase'
import { firebaseErrorMessage } from '@/lib/firebase-errors'
import { isOtpBypassEnabled, isValidOtpBypassCode, otpBypassHint } from '@/lib/otpBypass'

type Step = 'phone' | 'otp' | 'profile' | 'pin'

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
  const [verifiedOtpCode, setVerifiedOtpCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [resendTimer, setResendTimer] = useState(0)
  // PIN setup (final step)
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinStage, setPinStage] = useState<'create' | 'confirm'>('create')

  const confirmationResultRef = useRef<ConfirmationResult | null>(null)
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)
  const autoOtpStarted = useRef(false)

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
      getFirebaseAuth(),
      'recaptcha-container-register',
      { size: 'invisible' }
    )
    return recaptchaVerifierRef.current
  }

  // ── Send OTP ──────────────────────────────────────────────────────────
  const sendOtp = useCallback(async (phoneNumber: string) => {
    setIsLoading(true)
    try {
      const res = await authApi.sendOtp(phoneNumber)
      const data = res.data

      if (data.userExists) {
        toast.error('This number is already registered. Please login with your PIN.')
        const redirect = searchParams.get('redirect')
        const loginParams = new URLSearchParams({ phone: phoneNumber })
        if (redirect) loginParams.set('redirect', redirect)
        router.push(`/login?${loginParams.toString()}`)
        return
      }

      setNormalizedPhone(data.phone)
      setPhone(phoneNumber)

      if (isOtpBypassEnabled()) {
        setStep('otp')
        setOtp(['', '', '', '', '', ''])
        setResendTimer(60)
        toast.success(otpBypassHint(), { duration: 6000 })
        return
      }

      const verifier = initRecaptcha()
      const confirmation = await signInWithPhoneNumber(getFirebaseAuth(), data.phone, verifier)
      confirmationResultRef.current = confirmation

      setStep('otp')
      setOtp(['', '', '', '', '', ''])
      setResendTimer(60)
      toast.success('OTP sent via SMS')
    } catch (err: any) {
      const backendMsg = err?.response?.data?.message
      const msg = backendMsg || firebaseErrorMessage(err, 'Failed to send OTP. Please try again.')
      toast.error(msg, { duration: 8000 })
      console.error('[Firebase OTP send error]', err)
      recaptchaVerifierRef.current?.clear()
      recaptchaVerifierRef.current = null
    } finally {
      setIsLoading(false)
    }
  }, [router, searchParams])

  useEffect(() => {
    const phoneParam = searchParams.get('phone')
    const shouldAutoOtp = searchParams.get('autoOtp') === '1'
    if (!shouldAutoOtp || !phoneParam || autoOtpStarted.current) return
    autoOtpStarted.current = true
    phoneForm.setValue('phone', phoneParam)
    sendOtp(phoneParam)
  }, [searchParams, sendOtp, phoneForm])

  const onPhoneSubmit = async (data: PhoneForm) => {
    setPhone(data.phone)
    await sendOtp(data.phone)
  }

  // ── Verify OTP → Go to profile step ───────────────────────────────────
  const verifyOtp = useCallback(async (code: string) => {
    if (code.length !== 6) return
    if (!isOtpBypassEnabled() && !confirmationResultRef.current) return
    setIsLoading(true)
    try {
      if (isOtpBypassEnabled()) {
        if (!isValidOtpBypassCode(code)) {
          toast.error('Invalid OTP. Please try again.')
          setOtp(['', '', '', '', '', ''])
          setTimeout(() => document.getElementById('rotp-0')?.focus(), 100)
          return
        }
        setVerifiedOtpCode(code)
        setStep('profile')
        toast.success('Phone verified! Now set up your profile.')
        return
      }

      // Confirm OTP with Firebase → get ID token
      const result = await confirmationResultRef.current!.confirm(code)
      const idToken = await result.user.getIdToken()
      setFirebaseIdToken(idToken)
      setStep('profile')
      toast.success('Phone verified! Now set up your profile.')
    } catch (err: any) {
      const msg = firebaseErrorMessage(err, 'Invalid OTP. Please try again.')
      toast.error(msg, { duration: 8000 })
      // eslint-disable-next-line no-console
      console.error('[Firebase OTP verify error]', err)
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => document.getElementById('rotp-0')?.focus(), 100)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── Complete Registration ─────────────────────────────────────────────
  // Two-stage: verify-register stores the user + tokens (so the next call
  // is authenticated), then we move to the PIN-setup step. The user can't
  // skip PIN — it's the primary login factor going forward.
  const onProfileSubmit = async (data: ProfileForm) => {
    setIsLoading(true)
    try {
      const res = isOtpBypassEnabled()
        ? await authApi.verifyRegisterWithCode({
            phone: normalizedPhone,
            code: verifiedOtpCode,
            full_name: data.full_name,
            email: data.email || undefined,
          })
        : await authApi.verifyRegister({
            idToken: firebaseIdToken,
            full_name: data.full_name,
            email: data.email || undefined,
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

      toast.success('Almost done — create your 4-digit PIN')
      setPinStage('create')
      setPin('')
      setPinConfirm('')
      setStep('pin')
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

  // ── Set PIN (final step) ─────────────────────────────────────────────
  // Two-stage entry: enter PIN → re-enter to confirm → POST /auth/set-pin.
  // The user is already authenticated by this point (verifyRegister set
  // tokens), so the call goes through the standard auth interceptor.
  const handlePinFirstEntry = (entered: string) => {
    setPin(entered)
    setPinConfirm('')
    setPinStage('confirm')
  }

  const handlePinConfirm = async (confirmed: string) => {
    if (confirmed !== pin) {
      toast.error('PINs do not match. Please try again.')
      setPin('')
      setPinConfirm('')
      setPinStage('create')
      return
    }
    setIsLoading(true)
    try {
      await authApi.setPin(confirmed)
      toast.success('PIN set! You can use it next time you log in.')
      const redirectTo = searchParams.get('redirect') || '/'
      router.push(redirectTo)
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to save PIN. Please try again.'
      toast.error(msg)
      setPin('')
      setPinConfirm('')
      setPinStage('create')
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
    { key: 'otp', label: 'OTP' },
    { key: 'profile', label: 'Name' },
    { key: 'pin', label: 'PIN' },
  ]
  const currentStepIndex = step === 'pin'
    ? steps.length - 1
    : steps.findIndex((s) => s.key === step)

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
            <div className="flex justify-center mb-4">
              <BrandLogo imgClassName="h-16 w-auto max-w-none object-contain" />
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
                    {isOtpBypassEnabled() ? (
                      <span className="text-amber-600">{otpBypassHint()}</span>
                    ) : (
                      <>Enter the OTP sent to <span className="font-semibold text-gray-700">{normalizedPhone}</span> via SMS</>
                    )}
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

            {/* ── Step 3: Name ───────────────────────────────────────── */}
            {step === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="mb-4 flex items-center gap-2 bg-green-50 text-green-700 text-sm px-4 py-2.5 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Phone verified! One more step before your PIN.</span>
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

                  <Button type="submit" fullWidth isLoading={isLoading} size="lg">
                    Continue to PIN
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </form>
              </motion.div>
            )}

            {/* ── Step 4: Set 4-digit PIN ──────────────────────────────── */}
            {step === 'pin' && (
              <motion.div
                key="pin"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <div className="text-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {pinStage === 'create' ? 'Choose your 4-digit PIN' : 'Confirm your PIN'}
                  </h2>
                  <p className="text-sm text-gray-500 mt-2">
                    {pinStage === 'create'
                      ? 'You will use this PIN every time you login — quick and easy, no OTP needed.'
                      : 'Enter the same PIN again to confirm.'}
                  </p>
                </div>
                <PinInput
                  key={pinStage} /* remount = clear focus + value cleanly */
                  value={pinStage === 'create' ? pin : pinConfirm}
                  onChange={pinStage === 'create' ? setPin : setPinConfirm}
                  onComplete={pinStage === 'create' ? handlePinFirstEntry : handlePinConfirm}
                  disabled={isLoading}
                />
                {isLoading && (
                  <p className="text-center text-sm text-gray-500 mt-4">Saving PIN…</p>
                )}
                {pinStage === 'confirm' && !isLoading && (
                  <button
                    onClick={() => { setPin(''); setPinConfirm(''); setPinStage('create') }}
                    className="block mx-auto mt-4 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Start over
                  </button>
                )}
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
