// Runs at the end of `npm run build` (N16, 20 Nov 2026).
//
// Render's Free plan does not run a pre-deploy command, so the production
// database never received the migrations the new code needs (live checkout
// slots answered 500). The build applies them itself — ONLY on Render (Render
// sets RENDER / RENDER_SERVICE_ID during builds), never in CI or on a laptop,
// where `npm run build` stays a plain `tsc`.
//
// A failed migration fails the build, so the running version stays live.
// SKIP_BUILD_MIGRATIONS=true (Render dashboard) turns this off.
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const onRender = process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID);
if (!onRender || process.env.SKIP_BUILD_MIGRATIONS === 'true') {
  console.log('[build] database migrations skipped (not a Render build)');
  process.exit(0);
}

console.log('[build] Render build: applying database migrations...');
// The compiled runner (tsc has just built dist/) — no ts-node needed.
execFileSync(process.execPath, [path.join(__dirname, '..', 'dist', 'scripts', 'runSqlMigrations.js')], {
  stdio: 'inherit',
});
console.log('[build] database migrations done');
