// ============================================================================
// Which files in database/migrations have NOT been applied to this database?
//
// Checked once at boot. The schema is owned by the migrations alone (the old
// boot-time "ensure*Schema" DDL is off by default — SCHEMA_SELF_HEAL), so an
// unapplied migration means missing tables/columns and 500s. Saying so loudly
// at startup beats discovering it one failing screen at a time.
// ============================================================================
import fs from 'fs';
import path from 'path';

// Same folder the migration runner reads (src/utils and dist/utils are both
// three levels below the repo root).
export const MIGRATIONS_DIR = path.resolve(__dirname, '../../../database/migrations');

type Query = (text: string) => Promise<{ rows: Array<{ filename: string }> }>;

/**
 * File names not yet applied, in order — or null when it cannot be told
 * (no migrations folder next to the build, or no schema_migrations table).
 */
export async function findPendingMigrations(query: Query, dir = MIGRATIONS_DIR): Promise<string[] | null> {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return null;
  }
  let applied: Set<string>;
  try {
    applied = new Set((await query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename));
  } catch {
    return null;
  }
  return files.filter((f) => !applied.has(f));
}
