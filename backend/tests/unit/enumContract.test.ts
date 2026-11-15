// The API contract for status / role / method values: every TypeScript union
// that mirrors a database enum must list EXACTLY the database's values — in the
// shared package (apps + website), the admin panel and the backend. A value the
// database cannot store (or a database value a client cannot show) is a bug
// that only appears at runtime. Found on 15 Nov 2026: the admin panel allowed
// a 'moderator' role and 'cod'/'online' payment methods that do not exist and
// had no 'partially_refunded' payment status.
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../..');

/** enum name → values, from schema.sql plus every ALTER TYPE … ADD VALUE in the migrations. */
function databaseEnums(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const schema = fs.readFileSync(path.join(ROOT, 'database/schema.sql'), 'utf8');
  for (const m of schema.matchAll(/CREATE TYPE\s+(\w+)\s+AS\s+ENUM\s*\(([^)]*)\)/gi)) {
    out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((v) => v[1]);
  }
  const dir = path.join(ROOT, 'database/migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of sql.matchAll(/CREATE TYPE\s+(\w+)\s+AS\s+ENUM\s*\(([^)]*)\)/gi)) {
      out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((v) => v[1]);
    }
    for (const m of sql.matchAll(/ALTER TYPE\s+(\w+)\s+ADD VALUE(?:\s+IF NOT EXISTS)?\s+'([^']+)'/gi)) {
      (out[m[1]] = out[m[1]] || []).includes(m[2]) || out[m[1]].push(m[2]);
    }
  }
  return out;
}

/** type name → string literal members, for `export type X = 'a' | 'b'` in a file. */
function literalUnions(file: string): Record<string, string[]> {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: Record<string, string[]> = {};
  for (const st of src.statements) {
    if (!ts.isTypeAliasDeclaration(st) || !ts.isUnionTypeNode(st.type)) continue;
    const values: string[] = [];
    for (const t of st.type.types) {
      if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) values.push(t.literal.text);
      else return out; // not a pure string union — skip
    }
    out[st.name.text] = values;
  }
  return out;
}

const snake = (name: string) => name.replace(/[A-Z]/g, (c, i) => (i ? '_' : '') + c.toLowerCase());

/** Values a client may use for DISPLAY only, never stored (documented in shared-types). */
const CLIENT_ONLY: Record<string, string[]> = {
  NotificationType: ['order_update', 'rider_arrived', 'atta_update', 'general'],
};

const SOURCES = {
  'shared-types (apps + website)': 'packages/shared-types/src/index.ts',
  'admin panel': 'admin-panel/src/types/index.ts',
  backend: 'backend/src/types/index.ts',
};

const db = databaseEnums();

describe.each(Object.entries(SOURCES))('%s', (_label, rel) => {
  const unions = literalUnions(path.join(ROOT, rel));
  const mirrored = Object.keys(unions).filter((name) => db[snake(name)]);

  it('mirrors at least the core enums', () => {
    expect(mirrored.length).toBeGreaterThan(0);
  });

  it.each(mirrored.map((n) => [n]))('%s has exactly the database values', (name) => {
    const allowedExtra = CLIENT_ONLY[name] || [];
    const typeValues = unions[name].filter((v) => !allowedExtra.includes(v)).sort();
    expect(typeValues).toEqual([...db[snake(name)]].sort());
  });
});
