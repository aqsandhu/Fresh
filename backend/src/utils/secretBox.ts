// ============================================================================
// SECRETS AT REST — third-party API keys the owner types into the admin panel
// (AI Audit key, customer AI-chat key) are stored in site_settings. They are
// kept there ENCRYPTED (AES-256-GCM), so a database backup, a Supabase table
// view or any read of site_settings does not hand out a working key.
//
// Key: sha256(AUDIT_AI_SECRET || JWT_SECRET). Rotating that secret makes the
// stored keys unreadable (decryptSecret → null); the owner then enters them
// again. Format: "v1:<iv>:<tag>:<ciphertext>" (base64 parts).
// ============================================================================

import crypto from 'crypto';

const secretKey = (): Buffer =>
  crypto.createHash('sha256').update(String(process.env.AUDIT_AI_SECRET || process.env.JWT_SECRET || 'freshbazar-audit')).digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
}

export function decryptSecret(stored: string): string | null {
  const [v, iv, tag, body] = String(stored || '').split(':');
  if (v !== 'v1' || !iv || !tag || !body) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Was this value written by encryptSecret (as opposed to an old plain-text save)? */
export const isEncryptedSecret = (stored: string): boolean => /^v1:[^:]+:[^:]+:[^:]+$/.test(String(stored || '').trim());
