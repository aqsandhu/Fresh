import type { MetadataRoute } from 'next'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://freshbazar.pk').replace(/\/$/, '')

// Auth-gated and user-specific routes carry no SEO value and should never be
// indexed. Keeping them out of search results also avoids leaking deep links
// to checkout/account flows.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/login',
        '/register',
        '/cart',
        '/checkout',
        '/profile',
        '/orders',
        '/addresses',
        '/wishlist',
        '/settings',
        '/track/',
        '/select-city',
        '/ocp',
        '/restaurant',
        '/shareholder',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
