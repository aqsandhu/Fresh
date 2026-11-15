import type { Metadata } from 'next'
import { fetchForMetadata, metaText } from '@/lib/pageMetadata'

type CategoryMeta = { name_en?: string; name_ur?: string; meta_description?: string | null; image_url?: string | null }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const c = await fetchForMetadata<CategoryMeta>(`/categories/${encodeURIComponent(slug)}`)
  if (!c?.name_en) return { title: 'Category' }
  const title = c.name_ur ? `${c.name_en} (${c.name_ur})` : c.name_en
  const description = metaText(c.meta_description, `Fresh ${c.name_en} delivered to your door. Order online from Fresh Bazar.`)
  const image = c.image_url && /^https?:\/\//.test(c.image_url) ? c.image_url : undefined
  return {
    title,
    description,
    alternates: { canonical: `/category/${slug}` },
    openGraph: { title, description, url: `/category/${slug}`, ...(image ? { images: [{ url: image, alt: c.name_en }] } : {}) },
  }
}

export default function CategoryLayout({ children }: { children: React.ReactNode }) {
  return children
}
