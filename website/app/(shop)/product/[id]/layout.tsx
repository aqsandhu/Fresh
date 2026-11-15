import type { Metadata } from 'next'
import { fetchForMetadata, metaText } from '@/lib/pageMetadata'

type ProductMeta = {
  name_en?: string
  name_ur?: string
  slug?: string
  short_description?: string | null
  description_en?: string | null
  meta_description?: string | null
  primary_image?: string | null
  category_name?: string | null
}

// Each product page gets its own title, description and share image (it used
// to show the site-wide title — every product looked the same to Google).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const p = await fetchForMetadata<ProductMeta>(`/products/${encodeURIComponent(id)}`)
  if (!p?.name_en) return { title: 'Product' }
  const title = p.name_ur ? `${p.name_en} (${p.name_ur})` : p.name_en
  const description = metaText(
    p.meta_description || p.short_description || p.description_en,
    `Buy fresh ${p.name_en}${p.category_name ? ` — ${p.category_name}` : ''} online. Delivered to your door by Fresh Bazar.`
  )
  const image = p.primary_image && /^https?:\/\//.test(p.primary_image) ? p.primary_image : undefined
  return {
    title,
    description,
    alternates: { canonical: `/product/${id}` },
    openGraph: { title, description, url: `/product/${id}`, ...(image ? { images: [{ url: image, alt: p.name_en }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  }
}

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return children
}
