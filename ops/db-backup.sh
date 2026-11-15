#!/usr/bin/env bash
# ============================================================================
# FreshBazar — database backup
#
#   DATABASE_URL=postgres://...  ops/db-backup.sh  [output-folder]
#
# Writes three files into the folder (default ./backups):
#   freshbazar-<UTC time>.dump         pg_dump custom format (compressed)
#   freshbazar-<UTC time>.counts.txt   row count of every table at backup time
#   freshbazar-<UTC time>.sha256       checksum of the dump
# and deletes dumps older than KEEP_DAYS (default 14) in that folder.
#
# Use a DIRECT connection, not Supabase's pooler on :6543 — set
# DATABASE_MIGRATION_URL (preferred) or DATABASE_URL.
# pg_dump must be the same major version as the server or newer.
#
# The dump holds customer names, phones and addresses: keep it somewhere
# private (never a public bucket or a git repository) — see docs/RUNBOOK.md.
# ============================================================================
set -euo pipefail

URL="${DATABASE_MIGRATION_URL:-${DATABASE_URL:-}}"
if [ -z "$URL" ]; then
  echo "Set DATABASE_MIGRATION_URL or DATABASE_URL (a direct connection)." >&2
  exit 2
fi
case "$URL" in
  *:6543*) echo "That is the Supabase pooler (:6543) — use the direct connection (:5432)." >&2; exit 2 ;;
esac

OUT="${1:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$OUT"
STAMP="$(date -u +%Y%m%d-%H%M%SZ)"
BASE="$OUT/freshbazar-$STAMP"

echo "Backing up to $BASE.dump ..."
pg_dump "$URL" --format=custom --compress=6 --no-owner --no-privileges --schema=public --file="$BASE.dump"

# Row counts — exact (count(*)), so the restore can prove nothing went missing.
psql "$URL" -X -A -t -v ON_ERROR_STOP=1 -c "
  SELECT format('SELECT %L || '' '' || count(*) FROM public.%I;', table_name, table_name)
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name" \
  | psql "$URL" -X -A -t -v ON_ERROR_STOP=1 > "$BASE.counts.txt"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUT" && sha256sum "$(basename "$BASE.dump")" > "$(basename "$BASE.sha256")")
else
  (cd "$OUT" && shasum -a 256 "$(basename "$BASE.dump")" > "$(basename "$BASE.sha256")")
fi

TABLES=$(wc -l < "$BASE.counts.txt" | tr -d ' ')
ORDERS=$(awk '$1=="orders"{print $2}' "$BASE.counts.txt")
SIZE=$(du -h "$BASE.dump" | cut -f1)
echo "Done: $SIZE, $TABLES tables, ${ORDERS:-0} orders."

# Retention: only our own dump files in this folder.
find "$OUT" -maxdepth 1 -type f -name 'freshbazar-*' -mtime +"$KEEP_DAYS" -print -delete || true
