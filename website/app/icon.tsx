import { renderBrandIcon } from '@/lib/brandIcon'

// Google-search / browser-tab favicon: a real, square, same-origin PNG.
// Next turns this file into GET /icon and injects
// <link rel="icon" sizes="96x96" type="image/png"> into every page's <head>.
export const size = { width: 96, height: 96 }
export const contentType = 'image/png'
// ImageResponse (@vercel/og) is built for the Edge runtime; on the Node runtime
// it fails to load its WASM during `next build` static export. Edge also skips
// build-time prerender so the admin's current favicon is read at request time.
// Freshness/caching is handled by the Cache-Control headers in renderBrandIcon.
export const runtime = 'edge'

export default function Icon() {
  return renderBrandIcon(size.width)
}
