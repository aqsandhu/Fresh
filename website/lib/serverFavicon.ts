import { ABSOLUTE_API_URL } from './apiBase'

// Server-side fetch of the admin-set brand favicon URL.
//
// Why this exists: the favicon is normally applied CLIENT-side (see
// components/BrandFavicon.tsx), which Google's favicon crawler never sees — it
// reads the raw server HTML. So Google showed no icon next to our search
// results. By fetching the favicon URL here and feeding it into the root
// layout's metadata (generateMetadata → icons), a real <link rel="icon"> is
// rendered into the server HTML <head> that crawlers can read.
//
// Resilient by design: any failure returns null so metadata generation never
// breaks the page. Cached for an hour at the data layer so we don't hit the
// backend on every request, while still refreshing when the admin changes it.
export async function getServerBrandFaviconUrl(): Promise<string | null> {
  try {
    const res = await fetch(`${ABSOLUTE_API_URL}/site-settings/favicon`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const json = await res.json()
    const url = json?.data?.faviconUrl || json?.data?.favicon_url
    return typeof url === 'string' && url.trim() ? url.trim() : null
  } catch {
    return null
  }
}
