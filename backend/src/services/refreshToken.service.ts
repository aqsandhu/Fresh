import crypto from 'crypto';
import { query } from '../config/database';

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshExpiryDate(): Date {
  const raw = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  const match = /^(\d+)([dhms])$/i.exec(raw.trim());
  if (!match) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return new Date(Date.now() + amount * (multipliers[unit] || multipliers.d));
}

export async function persistRefreshToken(
  userId: string,
  refreshToken: string
): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = refreshExpiryDate();
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (token_hash) DO UPDATE
       SET revoked_at = NULL, expires_at = EXCLUDED.expires_at`,
    [userId, tokenHash, expiresAt]
  );
}

/**
 * Returns true only when an active (non-revoked, non-expired) row exists.
 *
 * FAIL CLOSED: every issued refresh token is persisted by persistRefreshToken,
 * so "no row" means revoked/expired/forged — not "table not in use". The old
 * empty-table and on-error `return true` fallbacks turned the revocation
 * check into a no-op exactly when it mattered (DB hiccup, fresh deploy).
 */
export async function isRefreshTokenAllowed(refreshToken: string): Promise<boolean> {
  try {
    const tokenHash = hashRefreshToken(refreshToken);
    const active = await query(
      `SELECT id FROM refresh_tokens
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()`,
      [tokenHash]
    );
    return active.rows.length > 0;
  } catch {
    return false;
  }
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}
