'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/react'

// Browser-side error monitoring for the storefront. Initialises ONLY when a DSN
// is configured (NEXT_PUBLIC_SENTRY_DSN), so it's a no-op otherwise and never
// touches the Next.js build config. Captures unhandled errors + promise
// rejections in the customer's browser.
let started = false

function startSentry() {
  if (started || typeof window === 'undefined') return
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0, // errors only — keep it light/cheap
  })
  started = true
}

export default function SentryInit() {
  useEffect(() => {
    startSentry()
  }, [])
  return null
}
