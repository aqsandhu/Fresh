/**
 * node-pg-migrate configuration
 *
 * Usage:
 *   npm run migrate:create -- my_migration_name
 *   npm run migrate:up
 *   npm run migrate:down
 *
 * Environment variables:
 *   DATABASE_URL - Full PostgreSQL connection string
 *   Or individual: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

const path = require('path');

// Build connection string from individual env vars or use DATABASE_URL
let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || 5432;
  const database = process.env.DB_NAME || 'grocery_db';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';

  connectionString = `postgres://${user}:${password}@${host}:${port}/${database}`;
}

module.exports = {
  databaseUrl: connectionString,
  migrationsDir: path.join(__dirname, 'migrations'),
  migrationsTable: 'pgmigrations',
  schema: 'public',
  // Direction for npm run migrate (up or down)
  direction: 'up',
  // Number of migrations to run (undefined = all)
  count: undefined,
  // Create transaction around each migration
  createTransaction: true,
  // Disable checking for order of migrations
  checkOrder: false,
  // Verbose logging
  verbose: true,
  // Decamelize table/column names (use snake_case)
  decamelize: true,
};
