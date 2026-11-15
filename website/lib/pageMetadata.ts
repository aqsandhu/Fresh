// Per-page titles and descriptions. Most pages are client components (which
// cannot export metadata), so each public route gets a tiny server layout that
// uses these helpers. The root layout adds " | Fresh Bazar" to every title.
import type { Metadata } from 'next'
import { ABSOLUTE_API_URL } from './apiBase'

export function staticMetadata(title: string, description: string, opts: { noindex?: boolean; path?: string } = {}): Metadata {
  return {
    title,
    description,
    ...(opts.path ? { alternates: { canonical: opts.path } } : {}),
    openGraph: { title, description, ...(opts.path ? { url: opts.path } : {}) },
    ...(opts.noindex ? { robots: { index: false, follow: true } } : {}),
  }
}

/** One API read for a page's metadata; never throws (a failed read keeps the default title). */
export async function fetchForMetadata<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${ABSOLUTE_API_URL}${path}`, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: T }
    return json.data ?? null
  } catch {
    return null
  }
}

/** Plain text for a meta description (no HTML, collapsed spaces, ≤ 160 characters). */
export function metaText(text: string | null | undefined, fallback: string): string {
  const clean = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const base = clean || fallback
  return base.length > 160 ? `${base.slice(0, 157).trimEnd()}…` : base
}
