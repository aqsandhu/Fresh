// Boot says loudly when a migration has not been applied (the schema has no
// other source any more — see config/schemaSelfHeal.ts).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { findPendingMigrations, MIGRATIONS_DIR } from '../../src/utils/pendingMigrations';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
for (const f of ['01-a.sql', '02-b.sql', '08b-c.sql', 'README.md']) fs.writeFileSync(path.join(dir, f), '');
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

it('lists unapplied files in order, ignoring non-SQL files', async () => {
  const q = jest.fn().mockResolvedValue({ rows: [{ filename: '01-a.sql' }] });
  await expect(findPendingMigrations(q, dir)).resolves.toEqual(['02-b.sql', '08b-c.sql']);
});

it('nothing pending when all are applied', async () => {
  const q = jest.fn().mockResolvedValue({ rows: ['01-a.sql', '02-b.sql', '08b-c.sql'].map((filename) => ({ filename })) });
  await expect(findPendingMigrations(q, dir)).resolves.toEqual([]);
});

it('null when it cannot tell (no tracking table, or no folder)', async () => {
  await expect(findPendingMigrations(jest.fn().mockRejectedValue(new Error('relation "schema_migrations" does not exist')), dir)).resolves.toBeNull();
  await expect(findPendingMigrations(jest.fn(), path.join(dir, 'missing'))).resolves.toBeNull();
});

it('reads the same folder as the migration runner', () => {
  expect(fs.existsSync(path.join(MIGRATIONS_DIR, '63-integrity-constraints.sql'))).toBe(true);
});
