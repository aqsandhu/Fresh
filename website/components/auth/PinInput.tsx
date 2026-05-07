'use client'

// Reusable 4-digit PIN input. Used on:
//   - register flow (set initial PIN after OTP success)
//   - login page (every-login PIN entry)
//   - settings (change PIN)
//   - checkout (re-auth when inactive)
//
// Single source of truth so the keyboard / focus / paste / autofill
// behaviour stays consistent everywhere. Caller controls value via
// `value` + `onChange(string)` and decides when to submit.

import { useEffect, useRef } from 'react'

interface PinInputProps {
  /** Exactly 4 digits, or fewer while typing. */
  value: string
  onChange: (next: string) => void
  /** Auto-submit handler — fires the moment 4 digits are entered. */
  onComplete?: (pin: string) => void
  disabled?: boolean
  autoFocus?: boolean
  /** Hide the digits as the user types (for shoulder-surfing protection). */
  mask?: boolean
}

const LENGTH = 4

export default function PinInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus = true,
  mask = true,
}: PinInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  // Pad value to 4 chars so each box always renders.
  const cells = (value + '____').slice(0, LENGTH).split('')

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  const setCharAt = (index: number, char: string) => {
    const arr = (value + '____').slice(0, LENGTH).split('').map((c) => (c === '_' ? '' : c))
    arr[index] = char
    const next = arr.join('').replace(/_/g, '')
    onChange(next)
    if (next.length === LENGTH) onComplete?.(next)
  }

  const handleInput = (i: number, raw: string) => {
    if (disabled) return
    const digits = raw.replace(/\D/g, '')
    if (!digits) {
      setCharAt(i, '')
      return
    }
    // Pasting / autofill: spread digits across cells starting at i
    if (digits.length > 1) {
      const arr = (value + '____').slice(0, LENGTH).split('').map((c) => (c === '_' ? '' : c))
      for (let k = 0; k < digits.length && i + k < LENGTH; k++) arr[i + k] = digits[k]
      const next = arr.join('').replace(/_/g, '')
      onChange(next)
      const nextIdx = Math.min(i + digits.length, LENGTH - 1)
      refs.current[nextIdx]?.focus()
      if (next.length === LENGTH) onComplete?.(next)
      return
    }
    setCharAt(i, digits[0])
    if (i < LENGTH - 1) refs.current[i + 1]?.focus()
  }

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !cells[i] && i > 0) {
      refs.current[i - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < LENGTH - 1) refs.current[i + 1]?.focus()
  }

  return (
    <div className="flex justify-center gap-3" dir="ltr">
      {cells.map((c, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type={mask ? 'password' : 'text'}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={c === '_' ? '' : c}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          className="w-14 h-16 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all disabled:opacity-50"
        />
      ))}
    </div>
  )
}
