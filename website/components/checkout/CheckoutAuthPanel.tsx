'use client'

// ============================================================================
// CheckoutAuthPanel — inline login / sign-up shown at the TOP of the checkout
// page for guests (users who are not signed in yet).
//
// Why this exists:
//   Previously a guest who pressed "Checkout" was bounced to /login, and a
//   brand-new customer then had to set their PIN across TWO separate screens
//   (register → confirm PIN). That was long and confusing. This panel keeps the
//   whole thing on the checkout page in ONE compact section:
//
//     1. Phone          → enter contact number
//     2a. PIN  (login)  → returning user with a PIN types it and is signed in
//     2b. OTP  (verify) → new user (or PIN-less user) verifies a one-time code
//     3.  Register      → new user sets Name + a SINGLE 4-digit PIN in one shot
//
//   Once authenticated the parent (checkout page) re-renders the real checkout
//   below — address / time / payment are completely unchanged.
//
//   Instructions are admin-managed via <GuidanceTips> (pages "login" / "signup")
//   with recommended Urdu fallbacks, plus short inline hints on the OTP and
//   Register steps so the user is never confused about what to type.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, Loader2, Phone, ShieldCheck, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PinInput from '@/components/auth/PinInput'
import GuidanceTips from '@/components/guidance/GuidanceTips'
import { LOGIN_TIPS, SIGNUP_TIPS } from '@/lib/guidanceTipsContent'
import { useAuthStore } from '@/store/cartStore'
import { authApi } from '@/lib/api'
import { getFirebaseAuth } from '@/lib/firebase'
import { firebaseErrorMessage } from '@/lib/firebase-errors'
import { isOtpBypassEnabled, isValidOtpBypassCode, otpBypassHint } from '@/lib/otpBypass'
import { getLastPhone, maskPhone, setLastPhone } from '@/lib/phoneStorage'

type Step = 'phone' | 'pin' | 'otp' | 'register'

const PHONE_RE = /^(\+92|0)?[0-9]{10,11}$/

export default function CheckoutAuthPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth } = useAuthStore()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [normalizedPhone, setNormalizedPhone] = useState('')
  const [userName, setUserName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // OTP state. `otpPurpose` decides what happens once the code is verified:
  //   'login'    → existing user without a PIN → sign straight in
  //   'register' → brand-new user → move to the Register (name + PIN) step
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [otpPurpose, setOtpPurpose] = useState<'login' | 'register'>('login')
  const [resendTimer, setResendTimer] = useState(0)

  // Login (returning user) PIN.
  const [pin, setPin] = useState('')

  // Register (new user) — name + ONE PIN, no confirm step.
  const [regName, setRegName] = useState('')
  const [regPin, setRegPin] = useState('')

  const confirmationResultRef = useRef<ConfirmationResult | null>(null)
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)
  const verifiedOtpCodeRef = useRef<string>('')
  const firebaseIdTokenRef = useRef<string>('')

  // Resend countdown.
  useEffect(() => {
    if (resendTimer <= 0) return
    const interval = setInterval(() => setResendTimer((t) => t - 1), 1000)
    return () => clearInterval(interval)
  }, [resendTimer])

  // Cleanup reCAPTCHA on unmount.
  useEffect(() => {
    return () => {
      recaptchaVerifierRef.current?.clear()
    }
  }, [])

  // Returning visitor: pre-fill the last phone so they only type a PIN.
  useEffect(() => {
    const saved = getLastPhone()
    if (saved) setPhone(saved)
  }, [])

  const redirectTo = searchParams.get('redirect') || '/checkout'

  // ── reCAPTCHA (Firebase SMS path) ───────────────────────────────────────
  const initRecaptcha = () => {
    recaptchaVerifierRef.current?.clear()
    recaptchaVerifierRef.current = new RecaptchaVerifier(
      getFirebaseAuth(),
      'recaptcha-container-checkout',
      { size: 'invisible' }
    )
    return recaptchaVerifierRef.current
  }

  // ── Send OTP (used for new-user register AND PIN-less existing login) ────
  const sendOtp = async (phoneNumber: string, purpose: 'login' | 'register') => {
    setIsLoading(true)
    try {
      const res = await authApi.sendOtp(phoneNumber)
      const data = res.data

      // Defensive: existence is already known from pin-status, but keep the
      // purpose in sync with what the backend reports.
      setNormalizedPhone(data.phone || phoneNumber)
      if (data.userName) setUserName(data.userName)
      setOtpPurpose(purpose)

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
      // eslint-disable-next-line no-console
      console.error('[Checkout OTP send error]', err)
      recaptchaVerifierRef.current?.clear()
      recaptchaVerifierRef.current = null
    } finally {
      setIsLoading(false)
    }
  }

  // ── Phone submit → branch to PIN / OTP / Register ───────────────────────
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = phone.trim()
    if (!PHONE_RE.test(value)) {
      setPhoneError('Enter a valid Pakistani number (e.g. 03001234567)')
      return
    }
    setPhoneError('')
    setIsLoading(true)
    try {
      const status = await authApi.pinStatus(value)
      setNormalizedPhone(value)
      setUserName(status.fullName || null)

      if (status.exists && status.hasPin) {
        // Returning user with a PIN — fastest path.
        setPin('')
        setStep('pin')
      } else if (status.exists && !status.hasPin) {
        // Account exists but never set a PIN — verify by OTP, then sign in.
        await sendOtp(value, 'login')
      } else {
        // Brand-new number — verify by OTP, then collect name + PIN.
        await sendOtp(value, 'register')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Could not start sign-in. Please try again.'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  // ── PIN verify (returning user) ─────────────────────────────────────────
  const verifyPin = async (entered: string) => {
    if (entered.length !== 4) return
    setIsLoading(true)
    try {
      const res = await authApi.verifyPin(normalizedPhone || phone, entered)
      const { user, tokens } = res.data
      setLastPhone(user.phone)
      setAuth(
        { id: user.id, name: user.full_name, phone: user.phone, email: user.email, role: user.role },
        tokens
      )
      toast.success('Signed in!')
      // No navigation needed — the checkout page re-renders the real checkout
      // the moment isAuthenticated flips true. We only push if a non-checkout
      // redirect was requested.
      if (redirectTo && redirectTo !== '/checkout') router.push(redirectTo)
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Invalid PIN. Please try again.'
      toast.error(msg)
      setPin('')
    } finally {
      setIsLoading(false)
    }
  }

  // ── OTP verify ──────────────────────────────────────────────────────────
  const verifyOtp = async (code: string) => {
    if (code.length !== 6) return
    if (!isOtpBypassEnabled() && !confirmationResultRef.current) return
    setIsLoading(true)
    try {
      if (otpPurpose === 'register') {
        // New user: just validate the code here, then collect name + PIN. The
        // account itself is created on the Register step (verify-register).
        if (isOtpBypassEnabled()) {
          if (!isValidOtpBypassCode(code)) {
            toast.error('Invalid OTP. Please try again.')
            setOtp(['', '', '', '', '', ''])
            setTimeout(() => document.getElementById('cotp-0')?.focus(), 100)
            return
          }
          verifiedOtpCodeRef.current = code
        } else {
          const result = await confirmationResultRef.current!.confirm(code)
          firebaseIdTokenRef.current = await result.user.getIdToken()
        }
        setRegName('')
        setRegPin('')
        setStep('register')
        toast.success('Phone verified! Just your name and a PIN to finish.')
        return
      }

      // Existing user without a PIN: verify code → sign in directly.
      if (isOtpBypassEnabled()) {
        const res = await authApi.verifyLoginWithCode(normalizedPhone || phone, code)
        const { user, tokens } = res.data
        setLastPhone(user.phone)
        setAuth(
          { id: user.id, name: user.full_name, phone: user.phone, email: user.email, role: user.role },
          tokens
        )
      } else {
        const result = await confirmationResultRef.current!.confirm(code)
        const idToken = await result.user.getIdToken()
        const res = await authApi.verifyLogin(idToken)
        const { user, tokens } = res.data
        setLastPhone(user.phone)
        setAuth(
          { id: user.id, name: user.full_name, phone: user.phone, email: user.email, role: user.role },
          tokens
        )
      }
      toast.success('Signed in!')
      if (redirectTo && redirectTo !== '/checkout') router.push(redirectTo)
    } catch (err: any) {
      const backendMsg = err?.response?.data?.message
      const msg = backendMsg || firebaseErrorMessage(err, 'Invalid OTP. Please try again.')
      toast.error(msg, { duration: 8000 })
      // eslint-disable-next-line no-console
      console.error('[Checkout OTP verify error]', err)
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => document.getElementById('cotp-0')?.focus(), 100)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Register (new user): name + ONE PIN, set in a single step ────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (regName.trim().length < 2) {
      toast.error('Please enter your name (at least 2 characters).')
      return
    }
    if (regPin.length !== 4) {
      toast.error('Please choose a 4-digit PIN.')
      return
    }
    setIsLoading(true)
    try {
      // 1) Create the account (verify-register also returns auth tokens).
      const res = isOtpBypassEnabled()
        ? await authApi.verifyRegisterWithCode({
            phone: normalizedPhone || phone,
            code: verifiedOtpCodeRef.current,
            full_name: regName.trim(),
          })
        : await authApi.verifyRegister({
            idToken: firebaseIdTokenRef.current,
            full_name: regName.trim(),
          })

      const { user, tokens } = res.data
      setLastPhone(user.phone)
      // Authenticate first so the set-pin call below is authorised.
      setAuth(
        { id: user.id, name: user.full_name, phone: user.phone, email: user.email, role: user.role },
        tokens
      )

      // 2) Save the PIN (one entry — no confirm screen).
      await authApi.setPin(regPin)

      toast.success('Account ready — you are signed in!')
      if (redirectTo && redirectTo !== '/checkout') router.push(redirectTo)
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Could not finish sign-up. Please try again.'
      toast.error(msg)
      if (typeof msg === 'string' && (msg.includes('expired') || msg.includes('not found'))) {
        setStep('phone')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ── OTP input handlers ──────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').split('').slice(0, 6)
      const next = [...otp]
      digits.forEach((d, i) => {
        if (index + i < 6) next[index + i] = d
      })
      setOtp(next)
      const nextIdx = Math.min(index + digits.length, 5)
      document.getElementById(`cotp-${nextIdx}`)?.focus()
      if (next.every((d) => d !== '')) verifyOtp(next.join(''))
      return
    }
    const next = [...otp]
    next[index] = value
    setOtp(next)
    if (value && index < 5) document.getElementById(`cotp-${index + 1}`)?.focus()
    if (index === 5 && value) verifyOtp(next.join(''))
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`cotp-${index - 1}`)?.focus()
    }
  }

  const backToPhone = () => {
    setStep('phone')
    setOtp(['', '', '', '', '', ''])
    setPin('')
    setOtpPurpose('login')
  }

  // Login-side steps show the "login" tips; sign-up-side steps show "signup".
  const isSignupSide = step === 'otp' ? otpPurpose === 'register' : step === 'register'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl p-5 sm:p-6 shadow-sm border border-primary-100"
    >
      {/* Invisible reCAPTCHA container required by Firebase */}
      <div id="recaptcha-container-checkout" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
          {isSignupSide ? (
            <UserPlus className="w-5 h-5 text-primary-600" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-primary-600" />
          )}
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {isSignupSide ? 'Create your account' : 'Sign in to continue'}
          </h2>
          <p className="text-sm text-gray-500">
            {isSignupSide
              ? 'Quick sign-up — then place your order'
              : 'Login or sign up to place your order'}
          </p>
        </div>
      </div>

      {/* Admin-managed guidance (separate sets for login vs sign-up so they
          never contradict the checkout tips, which only show after sign-in). */}
      <GuidanceTips
        tips={isSignupSide ? SIGNUP_TIPS : LOGIN_TIPS}
        page={isSignupSide ? 'signup' : 'login'}
      />

      <AnimatePresence mode="wait">
        {/* ── Step 1: Phone ─────────────────────────────────────────────── */}
        {step === 'phone' && (
          <motion.form
            key="phone"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            onSubmit={handlePhoneSubmit}
            className="space-y-4"
          >
            <Input
              label="Mobile number"
              placeholder="03XX-XXXXXXX"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                if (phoneError) setPhoneError('')
              }}
              error={phoneError}
            />
            <Button type="submit" fullWidth isLoading={isLoading} size="lg">
              Continue
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <p className="text-center text-xs text-gray-500">
              New here? Just enter your number — we&apos;ll verify it with a one-time
              code, then you set a PIN for next time.
            </p>
          </motion.form>
        )}

        {/* ── Step 2a: PIN (returning user) ─────────────────────────────── */}
        {step === 'pin' && (
          <motion.div
            key="pin"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className="space-y-5"
          >
            <p className="text-center text-sm text-gray-600">
              {userName ? (
                <>
                  Welcome back, <span className="font-semibold text-gray-800">{userName}</span>.{' '}
                </>
              ) : null}
              Enter your 4-digit PIN for{' '}
              <span className="font-semibold text-gray-800">{maskPhone(normalizedPhone || phone)}</span>
            </p>
            <PinInput value={pin} onChange={setPin} onComplete={verifyPin} disabled={isLoading} />
            {isLoading && (
              <div className="flex items-center justify-center gap-2 text-primary-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">Verifying…</span>
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => sendOtp(normalizedPhone || phone, 'login')}
                disabled={isLoading}
                className="text-sm text-primary-600 font-medium hover:text-primary-700 disabled:opacity-50"
              >
                Forgot PIN? Sign in with OTP
              </button>
              <button
                type="button"
                onClick={backToPhone}
                disabled={isLoading}
                className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                Use a different number
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Step 2b: OTP ──────────────────────────────────────────────── */}
        {step === 'otp' && (
          <motion.div
            key="otp"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className="space-y-4"
          >
            {/* Clear, explicit instruction for the OTP step. */}
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-sm text-blue-800">
              {isOtpBypassEnabled() ? (
                <span className="font-medium text-amber-700">{otpBypassHint()}</span>
              ) : (
                <>
                  We sent a 6-digit code by SMS to{' '}
                  <span className="font-semibold">{normalizedPhone || phone}</span>. Enter it
                  below to {otpPurpose === 'register' ? 'verify your number.' : 'sign in.'}
                </>
              )}
            </div>

            <div className="flex justify-center gap-1.5 sm:gap-2.5">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  id={`cotp-${index}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  onFocus={(e) => e.target.select()}
                  autoFocus={index === 0}
                  disabled={isLoading}
                  className="w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold border-2 border-gray-200 rounded-lg sm:rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-gray-50 focus:bg-white disabled:opacity-50"
                />
              ))}
            </div>

            <Button
              onClick={() => verifyOtp(otp.join(''))}
              fullWidth
              isLoading={isLoading}
              disabled={otp.some((d) => !d)}
              size="lg"
            >
              {otpPurpose === 'register' ? 'Verify number' : 'Verify & sign in'}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={backToPhone}
                className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-4 h-4" />
                Change number
              </button>
              {resendTimer > 0 ? (
                <span className="text-gray-500">Resend in {resendTimer}s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => sendOtp(normalizedPhone || phone, otpPurpose)}
                  disabled={isLoading}
                  className="text-primary-600 font-medium hover:text-primary-700 disabled:opacity-50"
                >
                  Resend OTP
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Register (new user) — name + ONE PIN ──────────────── */}
        {step === 'register' && (
          <motion.form
            key="register"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            onSubmit={handleRegister}
            className="space-y-4"
          >
            {/* Clear instruction for the Register step. */}
            <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2.5 text-sm text-green-800">
              <span className="font-semibold">Number verified.</span> Enter your name and
              choose a 4-digit PIN. You&apos;ll use this PIN to sign in next time —
              <span className="font-medium"> no OTP needed.</span> (Set it once, here.)
            </div>

            <Input
              label="Full name"
              placeholder="Enter your name"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              autoFocus
            />

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Choose a 4-digit PIN</p>
              <PinInput
                value={regPin}
                onChange={setRegPin}
                disabled={isLoading}
                autoFocus={false}
              />
            </div>

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading}
              disabled={regName.trim().length < 2 || regPin.length !== 4}
            >
              Create account &amp; continue
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>

            <button
              type="button"
              onClick={backToPhone}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mx-auto"
            >
              <ArrowLeft className="w-4 h-4" />
              Start over
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Reassurance footer */}
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-400">
        <Phone className="w-3.5 h-3.5" />
        <span>Your number is only used to secure your orders</span>
      </div>
    </motion.div>
  )
}
