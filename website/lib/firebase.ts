// ============================================================================
// FIREBASE CLIENT SDK - Website (Next.js)
// ----------------------------------------------------------------------------
// Lazy initialization. The Firebase SDK throws `auth/invalid-api-key` when
// initializeApp is called without a real API key, which used to fail Next's
// build-time static prerender of /login and /register (env vars aren't set
// during a fresh build). We avoid the eager top-level init and instead build
// the Auth instance on first property access — by then we're at runtime in
// the browser where the NEXT_PUBLIC_FIREBASE_* values are populated.
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

function ensureAuth(): Auth {
  if (cachedAuth) return cachedAuth
  if (!firebaseConfig.apiKey) {
    throw new Error(
      'Firebase config missing — set NEXT_PUBLIC_FIREBASE_* env vars before using Firebase Auth.'
    )
  }
  cachedApp = getApps()[0] || initializeApp(firebaseConfig as Required<typeof firebaseConfig>)
  cachedAuth = getAuth(cachedApp)
  return cachedAuth
}

// Export a Proxy that defers initialization until the first property is
// accessed at runtime. Drop-in replacement for the previous eager export so
// existing call sites (`signInWithPhoneNumber(firebaseAuth, …)`) keep working.
export const firebaseAuth = new Proxy({} as Auth, {
  get: (_target, prop, receiver) => Reflect.get(ensureAuth(), prop, receiver),
  set: (_target, prop, value, receiver) => Reflect.set(ensureAuth(), prop, value, receiver),
  has: (_target, prop) => prop in ensureAuth(),
})

export default firebaseAuth
