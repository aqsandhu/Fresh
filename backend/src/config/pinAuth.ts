// ============================================================================
// PIN AUTH DB SETUP — idempotent column migration on startup
// ============================================================================

import { query } from './database';
import logger from '../utils/logger';

export async function ensurePinColumns(): Promise<void> {
  try {
    await query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255),
        ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ
    `);
    logger.info('PIN auth columns ensured on users table');
  } catch (error: any) {
    logger.warn('Could not ensure PIN columns (PIN login may fail)', {
      error: error?.message,
    });
  }
}
