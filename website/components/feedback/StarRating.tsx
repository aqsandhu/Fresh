'use client'

import { Star } from 'lucide-react'

interface StarRatingProps {
  value: number
  onChange?: (rating: number) => void
  size?: number
  className?: string
}

/**
 * Star rating — interactive input when `onChange` is provided, otherwise a
 * read-only display (supports a fractional average via half-fill).
 */
export default function StarRating({ value, onChange, size = 20, className = '' }: StarRatingProps) {
  const interactive = typeof onChange === 'function'

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`} dir="ltr">
      {[1, 2, 3, 4, 5].map((position) => {
        const filled = value >= position
        const half = !filled && value >= position - 0.5
        const star = (
          <span className="relative inline-block" style={{ width: size, height: size }}>
            <Star
              className="absolute inset-0 text-gray-300"
              style={{ width: size, height: size }}
              fill="none"
            />
            {(filled || half) && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: half ? size / 2 : size }}
              >
                <Star
                  className="text-amber-400"
                  style={{ width: size, height: size }}
                  fill="currentColor"
                />
              </span>
            )}
          </span>
        )

        if (!interactive) {
          return <span key={position}>{star}</span>
        }
        return (
          <button
            key={position}
            type="button"
            onClick={() => onChange!(position)}
            className="p-0.5 transition-transform hover:scale-110"
            aria-label={`${position} star${position > 1 ? 's' : ''}`}
          >
            {star}
          </button>
        )
      })}
    </div>
  )
}
