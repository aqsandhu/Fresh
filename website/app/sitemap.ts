import type { MetadataRoute } from 'next'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://freshbazar.pk').replace(/\/$/, '')
const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')

// Publicly indexable static routes. Auth- and user-specific pages (cart,
// checkout, profile, orders, login…) are intentionally excluded — they're
// disallowed in robots.ts and have no SEO value.
const STATIC_PATHS = [
  '', // home
  '/products',
  '/about',
  '/contact',
  '/faq',
  '/help',
  '/shipping',
  '/returns',
  '/privacy',
  '/terms',
  '/franchise',
  '/work-as-rider',
  '/atta-chakki',
]

// Resilient fetch: the sitemap must still build (with static routes) even if
// the backend is down or slow, so any failure just yields an empty list.
async function fetchData(path: string): Promise<any[]> {
  if (!API_URL) return []
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const body = await res.json()
    return Array.isArray(body?.data) ? body.data : []
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: now,
    changeFrequency: p === '' ? 'daily' : 'weekly',
    priority: p === '' ? 1 : 0.7,
  }))

  // Dynamic commerce URLs aren't present in the server-rendered HTML (the
  // category/product sections fetch client-side), so the sitemap is the
  // primary way crawlers discover them.
  const [categories, products] = await Promise.all([
    fetchData('/categories'),
    fetchData('/products?limit=1000'),
  ])

  const categoryEntries: MetadataRoute.Sitemap = categories
    .filter((c: any) => c?.slug)
    .map((c: any) => ({
      url: `${SITE_URL}/category/${c.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    }))

  const productEntries: MetadataRoute.Sitemap = products
    .filter((p: any) => p?.id)
    .map((p: any) => ({
      url: `${SITE_URL}/product/${p.id}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.6,
    }))

  return [...staticEntries, ...categoryEntries, ...productEntries]
}
