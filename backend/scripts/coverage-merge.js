#!/usr/bin/env node
/* eslint-disable no-console */
// Combined backend coverage = unit suite (database mocked) ∪ real-database suite.
// Run after both:   pnpm test && pnpm test:e2e && node scripts/coverage-merge.js
// Prints one line per source and the merged totals; with `--min-lines N` it
// exits 1 when the merged line coverage is below N (a ratchet for CI).
const fs = require('fs');
const path = require('path');

// istanbul-lib-coverage ships with jest; resolve it from jest's own install.
const jestDir = path.dirname(require.resolve('jest/package.json', { paths: [path.join(__dirname, '..')] }));
const libCoverage = require(require.resolve('istanbul-lib-coverage', { paths: [jestDir, path.join(__dirname, '..')] }));

const root = path.join(__dirname, '..');
const sources = [
  ['unit (database mocked)', path.join(root, 'coverage', 'coverage-final.json')],
  ['real database', path.join(root, 'coverage-e2e', 'coverage-final.json')],
];

const merged = libCoverage.createCoverageMap({});
const show = (label, summary) => {
  const s = summary.toJSON();
  console.log(`${label.padEnd(26)} lines ${String(s.lines.pct).padStart(6)} %   statements ${String(s.statements.pct).padStart(6)} %   functions ${String(s.functions.pct).padStart(6)} %   branches ${String(s.branches.pct).padStart(6)} %`);
};

let found = 0;
for (const [label, file] of sources) {
  if (!fs.existsSync(file)) {
    console.log(`${label.padEnd(26)} (no report at ${path.relative(root, file)} — run that suite with --coverage first)`);
    continue;
  }
  const map = libCoverage.createCoverageMap(JSON.parse(fs.readFileSync(file, 'utf8')));
  show(label, map.getCoverageSummary());
  merged.merge(map);
  found++;
}
if (found === 0) process.exit(1);

const total = merged.getCoverageSummary();
show('COMBINED', total);
fs.mkdirSync(path.join(root, 'coverage-combined'), { recursive: true });
fs.writeFileSync(path.join(root, 'coverage-combined', 'coverage-summary.json'), JSON.stringify({ total: total.toJSON() }, null, 2));

// Least-covered files first: where the next tests are worth the most.
if (process.argv.includes('--worst')) {
  const rows = merged.files().map((f) => {
    const s = merged.fileCoverageFor(f).toSummary().toJSON();
    return { file: path.relative(root, f), lines: s.lines.pct, total: s.lines.total, missed: s.lines.total - s.lines.covered };
  });
  rows.sort((a, b) => b.missed - a.missed);
  console.log('\nMost uncovered lines:');
  for (const r of rows.slice(0, 25)) console.log(`  ${String(r.missed).padStart(5)} missed of ${String(r.total).padStart(5)}  (${String(r.lines).padStart(5)} %)  ${r.file}`);
}

const minArg = process.argv.indexOf('--min-lines');
if (minArg !== -1) {
  const min = Number(process.argv[minArg + 1]);
  if (total.lines.pct < min) {
    console.error(`\nCombined line coverage ${total.lines.pct} % is below the floor of ${min} %.`);
    process.exit(1);
  }
}
