// ============================================================================
// Which sale units a product may be bought in — enforced on the SERVER.
//
// The storefronts only show the fractions the admin enabled (website
// lib/unitPricing.ts, app equivalents), but the API used to accept any unit a
// client sent: "half_kg" of a product sold per piece, or a half/quarter kg the
// admin had switched off, went into the cart at a derived price and was
// ordered. Same rule as the storefront, in one place:
//   dozen       → full, half_dozen
//   kg / gram   → full, half_kg (unless switched off), quarter_kg (unless switched off)
//   anything else (piece, liter, pack …) → full only
// ============================================================================

import { normalizeProductUnit } from './unitPricing';

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

const toBool = (v: unknown): boolean => !(v === false || v === 'false' || v === 'f');

export function unitOfferedFor(
  unitType: string | null | undefined,
  allowHalfKg: unknown,
  allowQuarterKg: unknown,
  unit: string | null | undefined
): boolean {
  const u = normalizeProductUnit(unit);
  if (u === 'full') return true;
  const type = String(unitType || '').toLowerCase();
  if (type === 'dozen') return u === 'half_dozen';
  if (type === 'kg' || type === 'gram') {
    if (u === 'half_kg') return toBool(allowHalfKg);
    if (u === 'quarter_kg') return toBool(allowQuarterKg);
  }
  return false;
}

const UNIT_WORDS: Record<string, string> = { half_kg: 'half kg', quarter_kg: 'quarter kg', half_dozen: 'half dozen' };

/**
 * Null when the product may be bought in this unit, otherwise the message to
 * show. Looks the product up itself (one tiny query, only for fraction units)
 * so every caller — cart add, cart sync, checkout, WhatsApp and restaurant
 * orders — applies exactly the same rule. `to_jsonb` keeps it working on a
 * database that predates the half/quarter switches (migration 25).
 */
export async function unitNotOfferedMessage(
  client: Queryable,
  productId: string,
  unit: string | null | undefined
): Promise<string | null> {
  const u = normalizeProductUnit(unit);
  if (u === 'full') return null;
  const r = await client.query(
    `SELECT p.name_en, p.unit_type::text AS unit_type,
            to_jsonb(p)->>'allow_half_kg' AS allow_half_kg,
            to_jsonb(p)->>'allow_quarter_kg' AS allow_quarter_kg
       FROM products p WHERE p.id = $1`,
    [productId]
  );
  const p = r.rows[0];
  if (!p) return null; // the caller reports a missing product itself
  if (unitOfferedFor(p.unit_type, p.allow_half_kg, p.allow_quarter_kg, u)) return null;
  return `${p.name_en} is not sold by the ${UNIT_WORDS[u] || u}. Please choose another size.`;
}
