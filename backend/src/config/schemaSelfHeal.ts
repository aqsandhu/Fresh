// ============================================================================
// Runtime schema "self-heal" (CREATE/ALTER TABLE from inside the API) — OFF.
//
// The database schema is owned by database/migrations alone (Render runs
// them before every deploy; locally `migrate:sql`). Checked 15 Nov 2026: a
// database built from schema.sql + migrations is identical to one the
// ensure*() helpers had "healed".
//
// The helpers used to run their DDL on the first request of every process —
// in production too. ALTER TABLE takes the strongest table lock even when the
// column already exists, so after a restart one OCP request waited behind any
// open transaction on `orders`, and every other request touching `orders`
// queued behind it (measured: 6 s for an unrelated orders list).
//
// Now each ensure*() only CHECKS (a cached information_schema query) unless
// SCHEMA_SELF_HEAL=true — kept for an emergency on a database whose
// migrations cannot be run.
// ============================================================================
export function schemaSelfHealEnabled(): boolean {
  return process.env.SCHEMA_SELF_HEAL === 'true';
}
