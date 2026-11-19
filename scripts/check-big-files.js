#!/usr/bin/env node
/* eslint-disable no-console */
// Big-file ratchet (F2, W21). No source file may pass 800 lines; the files
// that are already bigger are listed in scripts/big-files-baseline.json with
// their size today and may only shrink (split them by job — see W21).
//   node scripts/check-big-files.js            → fails on a new big file or a listed one that grew
//   node scripts/check-big-files.js --update   → writes today's list (sizes only ever lower)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const LIMIT = 800;
const DIRS = ['backend/src', 'admin-panel/src', 'website/app', 'website/components', 'website/lib', 'website/store', 'website/context', 'customer-app/src', 'rider-app/src', 'packages'];
const SKIP_DIR = /^(node_modules|dist|build|\.next|__tests__|__mocks__|tests?|coverage)$/;
const SKIP_FILE = /\.(test|spec)\.tsx?$|\.d\.ts$/;
const BASELINE = path.join(__dirname, 'big-files-baseline.json');

const sizes = {};
const walk = (d) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(p); continue; }
    if (!/\.tsx?$/.test(e.name) || SKIP_FILE.test(e.name)) continue;
    const n = fs.readFileSync(p, 'utf8').split('\n').length;
    if (n > LIMIT) sizes[path.relative(root, p).split(path.sep).join('/')] = n;
  }
};
for (const d of DIRS) walk(path.join(root, d));

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
if (process.argv[2] === '--update') {
  const next = {};
  for (const [f, n] of Object.entries(sizes)) next[f] = baseline[f] === undefined ? n : Math.min(n, baseline[f]);
  fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`${Object.keys(next).length} file(s) over ${LIMIT} lines recorded`);
  process.exit(0);
}
let failed = false;
for (const [f, n] of Object.entries(sizes).sort((a, b) => b[1] - a[1])) {
  const was = baseline[f];
  if (was === undefined) { failed = true; console.log(`✗ ${f}: ${n} lines (new file over ${LIMIT})`); }
  else if (n > was) { failed = true; console.log(`✗ ${f}: ${n} lines (was ${was})`); }
  else console.log(`  ${f}: ${n}${n < was ? ` (was ${was})` : ''}`);
}
if (failed) {
  console.error(`\nSplit it by job instead of growing it (no file over ${LIMIT} lines).`);
  process.exit(1);
}
