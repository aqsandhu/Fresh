// What may leave for the error tracker (Sentry): no phone number, email,
// password, code or token — not in an error message, a page/API URL (e.g. a
// customer search by phone), a breadcrumb or extra data. Same rule as the
// backend's log redaction (backend/src/utils/redact.ts).
//
// Console breadcrumbs are the risky part: the SDK records every
// console.error(…, error) call, and an axios error carries the request it
// failed on — Authorization header and body (a login's password) included.
// Only the scrubbed text of the message is kept, never the raw arguments.
import type { Breadcrumb, ErrorEvent } from '@sentry/react'

const PK_MOBILE = /(?<![\w-])(?:\+92|0092|92|0)[ -]?3\d{2}[ -]?\d{7}(?![\w-])/g
const SECRET_PARAM = /([?&](?:phone|password|pin|otp|code|token|access_token|refresh_token|refreshToken|key|api_key|secret)=)[^&#]*/gi
const EMAIL = /([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g
const SECRET_JSON = /("(?:password|new_?password|current_?password|old_?password|pin|otp|code|token|access_?token|refresh_?token|approval_?password)"\s*:\s*)"[^"]*"/gi

export function scrubText(text: string): string {
  return text
    .replace(SECRET_PARAM, '$1***')
    .replace(SECRET_JSON, '$1"***"')
    .replace(BEARER, '$1***')
    .replace(JWT, '***')
    .replace(PK_MOBILE, '***')
    .replace(EMAIL, (_m, first: string, domain: string) => `${first}***@${domain}`)
}

const SECRET_KEY = /^(password|new_?password|current_?password|old_?password|pin|otp|code|token|access_?token|refresh_?token|authorization|cookie|approval_?password|secret|api_?key)$/i

function scrubDeep(value: unknown, key = '', depth = 0): unknown {
  if (key && SECRET_KEY.test(key)) return '***'
  if (typeof value === 'string') return scrubText(value)
  if (!value || typeof value !== 'object') return value
  if (depth >= 5) return '[nested]'
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, '', depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubDeep(v, k, depth + 1)
  return out
}

export function scrubBreadcrumb(b: Breadcrumb): Breadcrumb {
  if (b.message) b.message = scrubText(b.message)
  if (b.data) {
    // console.* arguments are raw objects (errors with their request inside).
    if ('arguments' in b.data) delete b.data.arguments
    for (const key of ['url', 'from', 'to']) {
      const v = b.data[key]
      if (typeof v === 'string') b.data[key] = scrubText(v)
    }
  }
  return b
}

export function scrubEvent(e: ErrorEvent): ErrorEvent {
  if (e.message) e.message = scrubText(e.message)
  for (const v of e.exception?.values ?? []) {
    if (v.value) v.value = scrubText(v.value)
  }
  if (e.request?.url) e.request.url = scrubText(e.request.url)
  if (e.request?.query_string && typeof e.request.query_string === 'string') {
    e.request.query_string = scrubText(`?${e.request.query_string}`).slice(1)
  }
  if (e.request?.headers) {
    for (const h of Object.keys(e.request.headers)) {
      if (/^(authorization|cookie)$/i.test(h)) e.request.headers[h] = '***'
    }
  }
  if (e.extra) e.extra = scrubDeep(e.extra) as typeof e.extra
  if (e.breadcrumbs) e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb)
  return e
}
