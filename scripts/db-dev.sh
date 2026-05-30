#!/usr/bin/env bash
# Open (or run a query against) the LOCAL D1 SQLite file that `astro dev` uses.
#
# Why this exists: `wrangler d1 execute --local` and `astro dev`'s platformProxy
# compute the local SQLite filename differently, so they read/write DIFFERENT
# files under .wrangler/state/v3/d1/. There is no wrangler flag to point
# `d1 execute` at the dev server's file, so for inspecting dev data we go
# straight to the SQLite file with the system `sqlite3` binary.
#
# The dev server's DB is ambiguous by filename (a content hash), and a stray
# empty DB can be the most-recently-touched one, so we don't trust mtime: we
# pick the candidate file that actually has the most rows in `users`.
#
# Usage:
#   npm run db:dev                       # interactive sqlite3 shell
#   npm run db:dev "SELECT * FROM users" # run one statement and exit
set -euo pipefail

D1_DIR=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"

if [ ! -d "$D1_DIR" ]; then
  echo "No local D1 state found at $D1_DIR." >&2
  echo "Start the dev server once (npm run dev) so the adapter creates it." >&2
  exit 1
fi

best_file=""
best_count=-1
for f in "$D1_DIR"/*.sqlite; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in metadata.sqlite) continue ;; esac
  # Row count in `users`; 0 if the table doesn't exist in this file.
  count="$(sqlite3 "$f" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo 0)"
  if [ "$count" -gt "$best_count" ]; then
    best_count="$count"
    best_file="$f"
  fi
done

if [ -z "$best_file" ]; then
  echo "No usable D1 SQLite file found in $D1_DIR." >&2
  exit 1
fi

exec sqlite3 "$best_file" "$@"
