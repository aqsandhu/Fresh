import { ImageResponse } from 'next/og'
import { getServerBrandFaviconUrl } from './serverFavicon'

// Shared renderer for the site's Google-search favicon (see app/icon.tsx and
// app/apple-icon.tsx).
//
// Why this exists: Google Search only shows a favicon that is a SQUARE (1:1)
// image reachable from a crawlable <link> in the server HTML. The admin-set
// brand favicon fails that on two counts — it is not square (e.g. 1253x1139)
// and it is a heavy cross-origin JPEG on Supabase. So Google showed no icon.
//
// This paints whatever the admin uploaded, letter-boxed and centered, onto a
// fixed square canvas and returns a small same-origin PNG. Next wires it into
// every page's <head> as <link rel="icon">, server-side, so crawlers see it.
// If the brand favicon can't be fetched we still return a valid square icon
// (the "FB" mark) rather than nothing.
export async function renderBrandIcon(px: number): Promise<ImageResponse> {
  const faviconUrl = await getServerBrandFaviconUrl()

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background: faviconUrl ? '#ffffff' : '#16a34a',
        }}
      >
        {faviconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faviconUrl}
            width={px}
            height={px}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            alt=""
          />
        ) : (
          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: Math.round(px * 0.5),
              fontWeight: 700,
            }}
          >
            FB
          </div>
        )}
      </div>
    ),
    {
      width: px,
      height: px,
      // Let browsers and (mainly) the Vercel CDN cache the rendered PNG for an
      // hour, then serve stale while it re-renders in the background. Keeps the
      // /icon URL stable and cheap without pinning a favicon the admin changed.
      headers: {
        'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  )
}
