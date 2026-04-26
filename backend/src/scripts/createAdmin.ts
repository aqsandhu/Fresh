// ============================================================================
// CLI: Create or update the super-admin user from environment variables.
//
// Usage:
//   npm run create-admin
//
// Expects ADMIN_PHONE and ADMIN_PASSWORD in the environment (loaded from
// backend/.env by dotenv). See bootstrapAdmin.ts for the full env contract.
// ============================================================================

import dotenv from 'dotenv';
dotenv.config();

import { bootstrapAdmin } from './bootstrapAdmin';
import { closePool } from '../config/database';

(async () => {
  const result = await bootstrapAdmin();
  const line = `[create-admin] ${result.status.toUpperCase()}: ${result.message}`;

  if (result.status === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }

  await closePool();
  process.exit(result.status === 'error' ? 1 : 0);
})();
