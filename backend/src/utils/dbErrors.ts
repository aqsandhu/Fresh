// Small DB error helpers.

/** Postgres "undefined_table" (42P01) — table not created yet (migration lag). */
export function isMissingTable(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '42P01';
}
