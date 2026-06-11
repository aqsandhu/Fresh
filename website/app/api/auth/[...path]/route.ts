import { NextRequest, NextResponse } from 'next/server'

// First-party auth proxy.
//
// Browser auth calls hit the same-origin `/api/auth/*` path. They MUST NOT use
// the next.config.js / vercel.json rewrite, because Vercel rewrites to an
// external destination (the onrender.com backend) silently DROP the upstream
// `Set-Cookie` header — so the HttpOnly auth cookies never reach the browser
// and every login appears to succeed but instantly loses its session, sending
// the user into an endless PIN re-prompt loop.
//
// A Route Handler runs as our own server code (it wins over both rewrite
// layers per Vercel's filesystem precedence), so we can copy the backend's
// Set-Cookie headers onto the response ourselves. The cookies are then stored
// first-party for freshbazar.pk (HttpOnly, Secure, SameSite=Lax preserved),
// which is exactly what the cookie-auth design requires.
//
// Non-auth `/api/*` calls keep using the fast rewrite — they only ever READ
// the cookie (request direction, which the rewrite forwards correctly) and
// never set one.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND_API_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'
).replace(/\/$/, '')

// Request headers that must not be forwarded verbatim — fetch recomputes Host
// (so SNI/routing target the backend, not freshbazar.pk) and length/framing.
const SKIP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length'])

// Response headers that would corrupt the proxied body if copied: the body has
// already been decoded by fetch, and NextResponse recomputes length/framing.
const SKIP_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
])

/** undici exposes getSetCookie(); fall back gracefully on older runtimes. */
function readSetCookies(headers: Headers): string[] {
  const maybe = headers as unknown as { getSetCookie?: () => string[] }
  if (typeof maybe.getSetCookie === 'function') {
    return maybe.getSetCookie()
  }
  const raw = headers.get('set-cookie')
  return raw ? [raw] : []
}

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const target = `${BACKEND_API_URL}/auth/${path.join('/')}${request.nextUrl.search}`

  const headers = new Headers(request.headers)
  SKIP_REQUEST_HEADERS.forEach((name) => headers.delete(name))

  const method = request.method
  const hasBody = method !== 'GET' && method !== 'HEAD'

  let backendRes: Response
  try {
    backendRes = await fetch(target, {
      method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json(
      { success: false, message: 'Auth service is unreachable. Please try again.' },
      { status: 502 }
    )
  }

  const body = await backendRes.arrayBuffer()
  const res = new NextResponse(body, {
    status: backendRes.status,
    statusText: backendRes.statusText,
  })

  backendRes.headers.forEach((value, key) => {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      res.headers.set(key, value)
    }
  })

  // The whole point: re-emit the backend's Set-Cookie headers from our own
  // origin so the browser actually stores the session cookies.
  for (const cookie of readSetCookies(backendRes.headers)) {
    res.headers.append('set-cookie', cookie)
  }

  return res
}

type RouteContext = { params: { path: string[] } }

export function GET(request: NextRequest, { params }: RouteContext) {
  return proxy(request, params.path)
}
export function POST(request: NextRequest, { params }: RouteContext) {
  return proxy(request, params.path)
}
export function PUT(request: NextRequest, { params }: RouteContext) {
  return proxy(request, params.path)
}
export function PATCH(request: NextRequest, { params }: RouteContext) {
  return proxy(request, params.path)
}
export function DELETE(request: NextRequest, { params }: RouteContext) {
  return proxy(request, params.path)
}
export function OPTIONS(request: NextRequest, { params }: RouteContext) {
  return proxy(request, params.path)
}
