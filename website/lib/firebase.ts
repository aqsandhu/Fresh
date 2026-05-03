// ============================================================================
// FIREBASE CLIENT SDK - Website (Next.js)
// ----------------------------------------------------------------------------
// Lazy initialization. The previous Proxy-based export tripped Firebase
// SDK internal `instanceof Auth` / identity checks on some call paths
// (notably RecaptchaVerifier in production builds), making OTP requests
// silently fail. Switched to an explicit `getFirebaseAuth()` function
// that returns the real Auth instance — call it inside event handlers,
// not at module top level, so SSG / SSR don't try to initialize Firebase
// at build time when the NEXT_PUBLIC_FIREBASE_* env vars aren't set.
// ============================================================================

import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { Auth, getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let cachedApp: FirebaseApp | null = null
let cachedAuth: Auth | null = null

/**
 * Returns the initialized Firebase Auth instance.
 * Throws a clear, actionable error when env vars are missing so the call
 * site can show it to the user instead of falling into a confusing
 * `auth/invalid-api-key` from deep inside the SDK.
 */
export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth

  const missing = (
    ['apiKey', 'authDomain', 'projectId', 'appId'] as const
  ).filter((k) => !firebaseConfig[k])

  if (missing.length > 0) {
    throw new Error(
      `Firebase is not configured. Missing env vars: ${missing
        .map((k) => `NEXT_PUBLIC_FIREBASE_${k.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()}`)
        .join(', ')}. Set them in your hosting provider (Vercel) and redeploy.`
    )
  }

  cachedApp = getApps()[0] || initializeApp(firebaseConfig as Required<typeof firebaseConfig>)
  cachedAuth = getAuth(cachedApp)
  return cachedAuth
}
