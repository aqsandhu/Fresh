import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Server-side key resolution for Google Maps JS (same aliases as app/backend).
 * Checked before client-side env so Vercel/Render can use GOOGLE_MAPS_API_KEY without NEXT_PUBLIC_.
 */
export async function GET() {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    ''

  if (key) {
    return NextResponse.json({ key })
  }

  try {
    const base =
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      'https://freshbazar-backend.onrender.com/api'
    const res = await fetch(`${base}/site-settings/maps-key`, { cache: 'no-store' })
    if (res.ok) {
      const json = await res.json()
      const remote = String(json?.data?.key || json?.key || '').trim()
      if (remote) return NextResponse.json({ key: remote })
    }
  } catch {
    /* backend optional */
  }

  return NextResponse.json({ key: null })
}
