// The API must not run CREATE/ALTER TABLE while serving requests: ALTER TABLE
// takes the strongest table lock even when the column exists, and after a
// restart one OCP request froze every request touching `orders` behind any open
// transaction (6 s measured). Migrations own the schema; ensure*() only checks.
const poolCtor = jest.fn(() => ({ query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), end: jest.fn().mockResolvedValue(undefined) }));
jest.mock('pg', () => ({ Pool: poolCtor }));
const dbQuery = jest.fn();
jest.mock('../../src/config/database', () => ({ query: (...a: unknown[]) => dbQuery(...a) }));

const ORIGINAL = { ...process.env };

function load() {
  let mods: { ocp: typeof import('../../src/config/ocpSchema'); address: typeof import('../../src/config/addressSchema') } | undefined;
  jest.isolateModules(() => {
    mods = { ocp: require('../../src/config/ocpSchema'), address: require('../../src/config/addressSchema') };
  });
  return mods!;
}

beforeEach(() => {
  poolCtor.mockClear();
  dbQuery.mockReset();
  process.env = { ...ORIGINAL, DATABASE_URL: 'postgres://x@localhost/db' };
  delete process.env.SCHEMA_SELF_HEAL;
});
afterAll(() => {
  process.env = ORIGINAL;
});

it('by default only checks — no DDL connection is opened', async () => {
  dbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });
  const { ocp, address } = load();
  await expect(ocp.ensureOcpTables()).resolves.toBe(true);
  await expect(address.ensureAddressColumns()).resolves.toBe(true);
  expect(poolCtor).not.toHaveBeenCalled();
  for (const [sql] of dbQuery.mock.calls) expect(String(sql)).not.toMatch(/ALTER|CREATE/i);
});

it('reports a missing table as not ready instead of creating it', async () => {
  dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  const { ocp } = load();
  await expect(ocp.ensureOcpTables()).resolves.toBe(false);
  expect(poolCtor).not.toHaveBeenCalled();
});

it('SCHEMA_SELF_HEAL=true brings the old behaviour back (emergency only)', async () => {
  process.env.SCHEMA_SELF_HEAL = 'true';
  dbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });
  const { address } = load();
  await address.ensureAddressColumns();
  expect(poolCtor).toHaveBeenCalled();
});
