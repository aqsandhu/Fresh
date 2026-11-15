// ============================================================================
// PII REDACTION FOR LOGS
//
// Logs go to Render's log viewer, log files and anyone who is sent a log
// excerpt. Customer phone numbers, CNICs, passwords, PINs, one-time codes and
// tokens must never be in them. Instead of trusting every one of the ~200
// logger calls, the logger itself runs every entry through `redactLogValue`.
//
// What is hidden:
//   - values under phone-like keys (phone, normalizedPhone, customer_phone…)
//     → "***" + the last 3 digits (enough to tell two numbers apart in support)
//   - values under secret keys (password, pin, otp, token, authorization…)
//     → "[redacted]"
//   - Pakistani mobile numbers and CNICs anywhere inside a string (messages,
//     URLs in request logs, database error details)
// Ids (user / order / rider ids) stay — they are how a log line is traced.
// ============================================================================

const PHONE_KEY = /(phone|mobile|msisdn|whatsapp|cnic)/i;
const SECRET_KEY = /^(password|new_?password|old_?password|current_?password|pin|new_?pin|otp|otp_?code|verification_?code|token|access_?token|refresh_?token|id_?token|authorization|cookie|set-cookie|secret|api_?key|x-api-key)$/i;

// +92 3xx xxxxxxx / 0092… / 92… / 03xx-xxxxxxx — not when glued to other word
// characters or dashes (so UUIDs and order numbers are left alone).
const PK_MOBILE = /(?<![\w-])(?:\+92|0092|92|0)[ -]?3\d{2}[ -]?\d{7}(?![\w-])/g;
// Dashed form only inside free text (13 bare digits is also a millisecond
// timestamp); under a cnic key any form is hidden by PHONE_KEY above.
const CNIC = /(?<![\w-])\d{5}-\d{7}-\d(?![\w-])/g;
// Email addresses: first character + domain stay (enough for support).
const EMAIL = /([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

function maskDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 3 ? `***${digits.slice(-3)}` : '***';
}

export function redactString(text: string): string {
  if (!text || text.length < 10) return text;
  return text
    .replace(PK_MOBILE, (m) => maskDigits(m))
    .replace(CNIC, '*****-*******-*')
    .replace(EMAIL, (_m, first: string, domain: string) => `${first}***@${domain}`);
}

/** Is this field name one whose value must never be written anywhere? */
export function isSecretField(name: string): boolean {
  const last = String(name).split('.').pop() || '';
  return SECRET_KEY.test(last);
}

const MAX_DEPTH = 6;

export function redactLogValue(value: unknown, key = '', depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (key && SECRET_KEY.test(key)) return '[redacted]';
  if (typeof value === 'string') return key && PHONE_KEY.test(key) ? maskDigits(value) : redactString(value);
  if (typeof value === 'number') return key && PHONE_KEY.test(key) ? maskDigits(String(value)) : value;
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[nested]';
  if (seen.has(value as object)) return '[circular]';
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => redactLogValue(v, key, depth + 1, seen));
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (value instanceof Error) {
    // A plain copy: Error fields are not enumerable, so the logs used to show
    // "{}" for them — and the original error object is not changed.
    const e = value as Error & Record<string, unknown>;
    const copy: Record<string, unknown> = { name: e.name, message: redactString(e.message) };
    for (const k of ['code', 'detail', 'constraint', 'table', 'column', 'statusCode', 'stack']) {
      if (e[k] !== undefined) copy[k] = redactLogValue(e[k], k, depth + 1, seen);
    }
    return copy;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactLogValue(v, k, depth + 1, seen);
  }
  // A validation detail { field: 'password', value: 'abc' } — the secret is
  // under the generic key "value", so the key rule above cannot see it.
  const field = (value as Record<string, unknown>).field;
  if (typeof field === 'string' && 'value' in out) {
    if (isSecretField(field)) out.value = '[redacted]';
    else if (PHONE_KEY.test(field) && out.value != null) out.value = maskDigits(String(out.value));
  }
  return out;
}

// ----------------------------------------------------------------------------
// What a THIRD PARTY (the error tracker) may see of a request: the field names
// and the shape of what was sent, not what the customer typed. Free text
// (addresses, names, delivery notes), emails, long digit strings (bank
// accounts, CNICs), home coordinates and secrets are replaced; ids, amounts,
// flags, dates and short codes stay so the failure can still be understood.
// ----------------------------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const LOCATION_KEY = /^(lat|lng|lon|latitude|longitude|coords?|location|location_accuracy|accuracy)$/i;

export function summarizeForTracker(value: unknown, key = '', depth = 0): unknown {
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  if (key && (SECRET_KEY.test(key) || PHONE_KEY.test(key))) return redactLogValue(value, key);
  if (key && LOCATION_KEY.test(key)) return '[location]';
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (UUID.test(value) || ISO_DATE.test(value)) return value;
    if (value.includes('@')) return '[email]';
    const digits = value.replace(/\D/g, '').length;
    if (value.length <= 32 && !/\s/.test(value) && digits < 7) return value;
    return `[text, ${value.length} chars]`;
  }
  if (typeof value !== 'object') return '[value]';
  if (depth >= MAX_DEPTH) return '[nested]';
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((v) => summarizeForTracker(v, key, depth + 1));
    return value.length > 20 ? [...items, `[+${value.length - 20} more]`] : items;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = summarizeForTracker(v, k, depth + 1);
  }
  return out;
}

/** "a=1&token=x" → each value judged by its own name (token → [redacted]). */
export function redactQueryString(query: string, forTracker = false): string {
  const params = new URLSearchParams(query.replace(/^\?/, ''));
  const out: string[] = [];
  for (const [k, v] of params) {
    const safe = forTracker ? summarizeForTracker(v, k) : redactLogValue(v, k);
    out.push(`${encodeURIComponent(k)}=${String(safe)}`);
  }
  return out.join('&');
}

/** A URL with its query values redacted by name (and phones in the path masked). */
export function redactUrl(url: string, forTracker = false): string {
  if (!url) return url;
  const i = url.indexOf('?');
  if (i < 0) return redactString(url);
  return `${redactString(url.slice(0, i))}?${redactQueryString(url.slice(i + 1), forTracker)}`;
}

/**
 * Redacts a winston `info` object in place (string keys only — winston keeps
 * its own bookkeeping under Symbol keys, which are left untouched).
 */
export function redactLogInfo<T extends Record<string, unknown>>(info: T): T {
  const seen = new WeakSet<object>();
  for (const k of Object.keys(info)) {
    if (k === 'level' || k === 'timestamp' || k === 'service') continue;
    (info as Record<string, unknown>)[k] = redactLogValue(info[k], k === 'message' ? '' : k, 0, seen);
  }
  return info;
}
