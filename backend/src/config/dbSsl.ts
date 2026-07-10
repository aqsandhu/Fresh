// ============================================================================
// SHARED DB TLS CONFIG — used by BOTH the app pool (database.ts) and the SQL
// migration runner (scripts/runSqlMigrations.ts) so the two can never drift
// (the runner previously hardcoded rejectUnauthorized:false permanently).
// ============================================================================

/**
 * TLS options for a Postgres connection.
 *
 * IMPORTANT — managed Postgres providers (Supabase, Render) terminate TLS with
 * a SELF-SIGNED certificate chain. Verifying that against the system CA store
 * fails with SELF_SIGNED_CERT_IN_CHAIN, so the only correct way to verify a
 * self-signed provider is to PIN its CA via DB_SSL_CA.
 *
 * Resolution order:
 *   1. DB_SSL=false                          → no TLS at all.
 *   2. DB_SSL_REJECT_UNAUTHORIZED=false      → encrypted, unverified (explicit
 *      kill-switch; wins over everything, incl. a mismatched DB_SSL_CA —
 *      Supabase's POOLER on :6543 presents a cert the project CA doesn't cover).
 *   3. DB_SSL_CA (PEM string or base64)      → pin the provider CA, full verify
 *      (the recommended way to close the MITM window; works on the DIRECT
 *      connection, port 5432). Supabase: Dashboard → Settings → Database →
 *      "SSL Certificate".
 *   4. DB_SSL_REJECT_UNAUTHORIZED=true       → verify against system CA store.
 *   5. NODE_ENV=production                   → verified TLS by default.
 *   6. default (local/test)                  → encrypted, unverified so a
 *      self-signed development database connects out of the box.
 *
 * @param connectionString the URL this connection will actually use — when
 *   absent and DB_SSL isn't forced on, TLS stays off (host/port local dev).
 */
export function buildSslConfig(
  connectionString?: string
): false | { rejectUnauthorized: boolean; ca?: string } {
  if (process.env.DB_SSL === 'false') return false;
  if (!connectionString && process.env.DB_SSL !== 'true') return false;

  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    return { rejectUnauthorized: false };
  }

  const rawCa = process.env.DB_SSL_CA?.trim();
  if (rawCa) {
    const ca = rawCa.includes('-----BEGIN')
      ? rawCa
      : Buffer.from(rawCa, 'base64').toString('utf8');
    return { rejectUnauthorized: true, ca };
  }

  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true') {
    return { rejectUnauthorized: true };
  }

  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}
