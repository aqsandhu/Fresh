#!/usr/bin/env node
/* eslint-disable no-console */
// `any` ratchet (F1, W20). Counts the real `any` type keywords (TypeScript's
// own parser — comments and strings do not count) in each workspace's source,
// tests left out, and compares with scripts/any-baseline.json:
//   node scripts/check-any.js            → fails if any workspace has MORE than its baseline
//   node scripts/check-any.js --update   → writes today's counts (only ever lower)
//   node scripts/check-any.js --list backend   → where they are, most first
// The number may only go down; each fix lowers the baseline.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'backend'), root] }));

const WORKSPACES = {
  backend: ['backend/src'],
  'admin-panel': ['admin-panel/src'],
  website: ['website/app', 'website/components', 'website/lib', 'website/store', 'website/context', 'website/types'],
  'customer-app': ['customer-app/src'],
  'rider-app': ['rider-app/src'],
  packages: ['packages'],
};
const SKIP_DIR = /(^|[\\/])(node_modules|dist|build|\.next|__tests__|__mocks__|tests?|coverage|testDoubles)([\\/]|$)/;
const SKIP_FILE = /\.(test|spec)\.tsx?$|\.d\.ts$/;
const BASELINE = path.join(__dirname, 'any-baseline.json');

function files(dir) {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(p); }
      else if (/\.tsx?$/.test(e.name) && !SKIP_FILE.test(e.name)) out.push(p);
    }
  };
  walk(path.join(root, dir));
  return out;
}

function countFile(file) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let n = 0;
  const visit = (node) => { if (node.kind === ts.SyntaxKind.AnyKeyword) n++; ts.forEachChild(node, visit); };
  visit(src);
  return n;
}

function measure() {
  const result = {};
  const perFile = {};
  for (const [ws, dirs] of Object.entries(WORKSPACES)) {
    let total = 0;
    for (const d of dirs) for (const f of files(d)) {
      const n = countFile(f);
      if (n) perFile[path.relative(root, f).split(path.sep).join('/')] = n;
      total += n;
    }
    result[ws] = total;
  }
  return { result, perFile };
}

const args = process.argv.slice(2);
const { result, perFile } = measure();

if (args[0] === '--list') {
  const ws = args[1];
  const prefixes = ws ? WORKSPACES[ws] : Object.values(WORKSPACES).flat();
  Object.entries(perFile)
    .filter(([f]) => prefixes.some((p) => f.startsWith(p)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, Number(args[2] || 30))
    .forEach(([f, n]) => console.log(String(n).padStart(5), f));
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
let failed = false;
for (const [ws, n] of Object.entries(result)) {
  const was = baseline[ws];
  const mark = was === undefined ? '(new)' : n > was ? `✗ was ${was}` : n < was ? `↓ was ${was}` : '=';
  if (was !== undefined && n > was) failed = true;
  console.log(`${ws.padEnd(14)} ${String(n).padStart(5)}  ${mark}`);
}
console.log(`${'total'.padEnd(14)} ${String(Object.values(result).reduce((a, b) => a + b, 0)).padStart(5)}`);

if (args[0] === '--update') {
  const next = { ...baseline };
  for (const [ws, n] of Object.entries(result)) next[ws] = baseline[ws] === undefined ? n : Math.min(n, baseline[ws]);
  fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log('baseline written');
  process.exit(0);
}
if (failed) {
  console.error('\nMore `any` than the baseline — type it properly (see scripts/check-any.js --list <workspace>).');
  process.exit(1);
}
