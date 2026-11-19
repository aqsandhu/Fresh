// ============================================================================
// VALIDATION HELPERS
// ============================================================================


// Pakistani phone number validation
export const isValidPakistaniPhone = (phone: string): boolean => {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Pakistani phone numbers: +92XXXXXXXXXX or 03XXXXXXXXX
  const pakistaniPhoneRegex = /^(\+92|0)[0-9]{10}$/;
  return pakistaniPhoneRegex.test(cleaned);
};

// A bad number is the caller's mistake → 400, not a server error (G37).
import { BadRequestError } from '../middleware/errorHandler';

// Normalize Pakistani phone number
export const normalizePhoneNumber = (phone: string): string => {
  if (!phone || typeof phone !== 'string') {
    throw new BadRequestError('Phone number is required');
  }

  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.length < 10) {
    throw new BadRequestError('Invalid phone number');
  }

  if (cleaned.startsWith('0')) {
    cleaned = '92' + cleaned.substring(1);
  }

  if (!cleaned.startsWith('92')) {
    cleaned = '92' + cleaned;
  }

  const normalized = '+' + cleaned;
  if (!isValidPakistaniPhone(normalized)) {
    throw new Error('Invalid Pakistani phone number');
  }

  return normalized;
};

// UUID validation
export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Slug generation
export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Clamp untrusted `page`/`limit` query params to safe integers.
 *
 * Raw query values were previously fed straight into `LIMIT $n OFFSET $n`:
 *  - `?limit=999999999` let any caller request an unbounded result set
 *    (memory/DB pressure — a cheap DoS on public list endpoints), and
 *  - `?limit=abc` / `?page=abc` produced NaN, which Postgres rejected with a
 *    500 instead of a clean response.
 *
 * This normalises both to bounded integers and derives the OFFSET, so every
 * list endpoint can share one safe parse.
 */
export const parsePagination = (
  pageInput: unknown,
  limitInput: unknown,
  opts: { defaultLimit?: number; maxLimit?: number } = {}
): { page: number; limit: number; offset: number } => {
  const defaultLimit = opts.defaultLimit ?? 20;
  const maxLimit = opts.maxLimit ?? 100;

  const rawPage = parseInt(String(pageInput ?? ''), 10);
  const rawLimit = parseInt(String(limitInput ?? ''), 10);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(rawLimit, maxLimit)
      : defaultLimit;

  return { page, limit, offset: (page - 1) * limit };
};
