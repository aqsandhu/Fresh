'use client'

import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

// The label, the field and its message are tied together: a screen reader
// names the field, a click on the label focuses it, and an error is announced
// and described on the field (I16 — the label used to stand alone).
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id: givenId, ...props }, ref) => {
    const autoId = useId()
    const id = givenId ?? autoId
    const messageId = error || helperText ? `${id}-msg` : undefined
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={props['aria-describedby'] ?? messageId}
          className={cn(
            'w-full px-4 py-2.5 rounded-lg border transition-colors duration-200',
            'placeholder:text-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 hover:border-gray-400',
            className
          )}
          {...props}
        />
        {error && (
          <p id={messageId} role="alert" className="mt-1.5 text-sm text-red-600">{error}</p>
        )}
        {helperText && !error && (
          <p id={messageId} className="mt-1.5 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
