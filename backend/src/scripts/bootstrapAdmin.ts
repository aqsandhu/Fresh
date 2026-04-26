// ============================================================================
// ADMIN BOOTSTRAP
// ----------------------------------------------------------------------------
// Idempotently creates or updates a super-admin user from environment
// variables. Used both at server startup (if ADMIN_PHONE + ADMIN_PASSWORD are
// set) and as a standalone CLI (see createAdmin.ts).
//
// Required env vars (both must be set for bootstrap to run):
//   ADMIN_PHONE       - Pakistani phone number (e.g. +923001234567)
//   ADMIN_PASSWORD    - min 8 characters
//
// Optional env vars:
//   ADMIN_EMAIL       - defaults to admin@freshbazar.pk
//   ADMIN_FULL_NAME   - defaults to "System Administrator"
//
// Lookup matches an existing admin row by phone OR email so a previously-
// seeded admin row (e.g. from database/schema.sql) gets its password
// rotated to the env value rather than tripping the email-unique
// constraint with a new INSERT.
// ============================================================================

import bcrypt from 'bcryptjs';
import { withTransaction } from '../config/database';
import logger from '../utils/logger';
import { isValidPakistaniPhone, normalizePhoneNumber } from '../utils/validators';

export interface BootstrapResult {
  status: 'created' | 'updated' | 'skipped' | 'error';
  userId?: string;
  message: string;
}

const ADMIN_PERMISSIONS = {
  users: { read: true, write: true, delete: true },
  orders: { read: true, write: true, delete: true },
  products: { read: true, write: true, delete: true },
  riders: { read: true, write: true, delete: true },
  reports: { read: true, write: true },
  settings: { read: true, write: true },
};

export async function bootstrapAdmin(): Promise<BootstrapResult> {
  const phoneRaw = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  const email = process.env.ADMIN_EMAIL || 'admin@freshbazar.pk';
  const fullName = process.env.ADMIN_FULL_NAME || 'System Administrator';

  if (!phoneRaw || !password) {
    return {
      status: 'skipped',
      message: 'ADMIN_PHONE / ADMIN_PASSWORD not set — admin bootstrap skipped',
    };
  }

  if (!isValidPakistaniPhone(phoneRaw)) {
    return {
      status: 'error',
      message: `ADMIN_PHONE is not a valid Pakistani phone number`,
    };
  }

  if (password.length < 8) {
    return {
      status: 'error',
      message: 'ADMIN_PASSWORD must be at least 8 characters',
    };
  }

  const phone = normalizePhoneNumber(phoneRaw);
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    return await withTransaction(async (client) => {
      const existing = await client.query<{
        id: string;
        role: string;
        phone: string;
        email: string | null;
      }>(
        `SELECT id, role, phone, email
           FROM users
          WHERE phone = $1 OR email = $2`,
        [phone, email]
      );

      if (existing.rows.length > 1) {
        return {
          status: 'error',
          message:
            `Multiple users match ADMIN_PHONE or ADMIN_EMAIL — refusing to ` +
            `auto-merge. Clean up duplicates in the users table and redeploy.`,
        };
      }

      let userId: string;
      let status: BootstrapResult['status'];

      if (existing.rows.length === 0) {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO users
             (phone, email, full_name, password_hash, role, status, is_phone_verified)
           VALUES ($1, $2, $3, $4, 'super_admin', 'active', TRUE)
           RETURNING id`,
          [phone, email, fullName, passwordHash]
        );
        userId = ins.rows[0].id;
        status = 'created';
      } else {
        const user = existing.rows[0];
        if (user.role !== 'admin' && user.role !== 'super_admin') {
          return {
            status: 'error',
            message:
              `User ${user.phone} / ${user.email ?? '(no email)'} exists but has ` +
              `role '${user.role}'. Refusing to elevate to super_admin automatically — ` +
              `change the user's role manually or use a different ADMIN_PHONE / ADMIN_EMAIL.`,
          };
        }
        await client.query(
          `UPDATE users
             SET phone = $1,
                 email = $2,
                 password_hash = $3,
                 status = 'active',
                 is_phone_verified = TRUE,
                 updated_at = NOW()
           WHERE id = $4`,
          [phone, email, passwordHash, user.id]
        );
        userId = user.id;
        status = 'updated';
      }

      await client.query(
        `INSERT INTO admins (user_id, permissions)
         SELECT $1, $2::jsonb
         WHERE NOT EXISTS (SELECT 1 FROM admins WHERE user_id = $1)`,
        [userId, JSON.stringify(ADMIN_PERMISSIONS)]
      );

      return {
        status,
        userId,
        message: `Admin ${status} for phone ${phone}`,
      };
    });
  } catch (error: any) {
    logger.error('Admin bootstrap failed:', error);
    return {
      status: 'error',
      message: error.message || 'Unknown error during admin bootstrap',
    };
  }
}
