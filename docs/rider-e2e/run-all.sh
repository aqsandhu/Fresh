#!/usr/bin/env bash
# Run every real-DB API check in order; exit 1 if any check fails.
# Needs: backend on :3999 against a FRESH database (see README), JWT_SECRET
# exported, curl, jq, psql, node. Used by .github/workflows/db-e2e.yml.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
status=0
# fixes-2026-10-31 first: it creates the time slots the other scripts use.
for s in fixes-2026-10-31 rider-flow restaurant-and-safeguards urgent-rate cod-only qa-2026-11-01; do
  echo "::group::$s"
  bash "$DIR/$s.sh"
  rc=$?
  echo "::endgroup::"
  if [ $rc -ne 0 ]; then echo "✗ $s failed"; status=1; else echo "✓ $s"; fi
done
echo "::group::admin-socket-rooms"
node "$DIR/admin-socket-rooms.js"; rc=$?
echo "::endgroup::"
if [ $rc -ne 0 ]; then echo "✗ admin-socket-rooms failed"; status=1; else echo "✓ admin-socket-rooms"; fi
exit $status
