'use client'

import { useEffect } from 'react'
import { scrubBreadcrumb, scrubEvent } from '@/lib/sentryScrub'

// Browser-side error monitoring for the storefront. Initialises ONLY when a DSN
// is configured (NEXT_PUBLIC_SENTRY_DSN), so it's a no-op otherwise and never
// touches the Next.js build config. Captures unhandled errors + promise
// rejections in the customer's browser.
//
// The SDK is imported on demand: a static import put ~110 KB of Sentry into the
// JavaScript of every page even when no DSN is set (as on the live site),
// slowing the first screen on phones (live mobile TBT ≈ 3.5 s).
let started = false

async function startSentry() {
  if (started || typeof window === 'undefined') return
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return
  started = true
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0, // errors only — keep it light/cheap
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}

export default function SentryInit() {
  useEffect(() => {
    void startSentry()
  }, [])
  return null
}
