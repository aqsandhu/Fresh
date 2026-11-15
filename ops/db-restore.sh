#!/usr/bin/env bash
# ============================================================================
# FreshBazar — restore a backup made by ops/db-backup.sh, and PROVE it.
#
#   TARGET_DATABASE_URL=postgres://...  ops/db-restore.sh  backups/freshbazar-<time>.dump
#
# - Refuses to run unless TARGET_DATABASE_URL is set explicitly (it never
#   falls back to DATABASE_URL, so production is not overwritten by accident).
# - Restoring into a database that already has tables needs CONFIRM_OVERWRITE=yes.
# - Checks the dump's checksum first, restores, then compares the row count of
#   every table with the .counts.txt written at backup time. Exit code 0 only
#   when every table matches.
#
# Practise this on a spare database (a new Supabase project or a local
# Postgres) — a backup that was never restored is not a backup.
# ============================================================================
set -euo pipefail

DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Usage: TARGET_DATABASE_URL=... $0 backups/freshbazar-<time>.dump" >&2
  exit 2
fi
URL="${TARGET_DATABASE_URL:-}"
if [ -z "$URL" ]; then
  echo "Set TARGET_DATABASE_URL to the database to restore INTO (not used from DATABASE_URL on purpose)." >&2
  exit 2
fi

BASE="${DUMP%.dump}"
DIR="$(dirname "$DUMP")"

# 1. Checksum
if [ -f "$BASE.sha256" ]; then
  if command -v sha256sum >/dev/null 2>&1; then (cd "$DIR" && sha256sum -c "$(basename "$BASE.sha256")" >/dev/null)
  else (cd "$DIR" && shasum -a 256 -c "$(basename "$BASE.sha256")" >/dev/null); fi
  echo "Checksum OK."
else
  echo "No .sha256 next to the dump — skipping the checksum." >&2
fi

# 2. Target must be empty unless the operator says otherwise
EXISTING=$(psql "$URL" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
if [ "$EXISTING" != "0" ] && [ "${CONFIRM_OVERWRITE:-}" != "yes" ]; then
  echo "The target already has $EXISTING tables. Set CONFIRM_OVERWRITE=yes to replace them." >&2
  exit 3
fi

# 3. Extensions the schema needs (they live outside the dumped schema)
psql "$URL" -X -q -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"' -c 'CREATE EXTENSION IF NOT EXISTS postgis' >/dev/null

# 4. Restore
echo "Restoring $DUMP ..."
pg_restore --dbname="$URL" --clean --if-exists --no-owner --no-privileges --schema=public --exit-on-error "$DUMP" \
  2> >(grep -v 'schema "public" already exists' >&2)

# 5. Prove it: same row count in every table
if [ ! -f "$BASE.counts.txt" ]; then
  echo "Restored, but there is no .counts.txt to compare with." >&2
  exit 4
fi
MISMATCH=0
while read -r TABLE WANT; do
  WANT="${WANT%$'\r'}" # psql on Windows ends lines with \r\n
  [ -z "$TABLE" ] && continue
  GOT=$(psql "$URL" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.\"$TABLE\"" 2>/dev/null | tr -d '\r' || echo "missing")
  [ -z "$GOT" ] && GOT="missing"
  if [ "$GOT" != "$WANT" ]; then
    echo "MISMATCH $TABLE: backup $WANT, restored $GOT" >&2
    MISMATCH=$((MISMATCH + 1))
  fi
done < "$BASE.counts.txt"

TABLES=$(grep -c . "$BASE.counts.txt")
if [ "$MISMATCH" -ne 0 ]; then
  echo "Restore NOT verified: $MISMATCH of $TABLES tables differ." >&2
  exit 5
fi
echo "Restore verified: all $TABLES tables have the same row count as at backup time."
