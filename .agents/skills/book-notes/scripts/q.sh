#!/usr/bin/env bash
# Run a read-only SQL query against the PersonalWebsite Postgres database.
# Usage: q.sh "SELECT ..."
# Output: CSV on stdout. Errors on stderr.
set -euo pipefail

# Resolve the physical path so this works through ~/.agents/skills/book-notes
# and ~/Desktop/Agents/book-notes discovery symlinks.
SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: .env not found in the PersonalWebsite repository" >&2
  exit 1
fi

# Extract only DATABASE_URL rather than sourcing unrelated or non-shell-safe
# values. Never print the resulting credential.
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | sed -E 's/^DATABASE_URL=//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is not set in the PersonalWebsite .env" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "usage: q.sh \"<SQL>\"" >&2
  exit 1
fi

SQL="$1"
PSQL_BIN="${PSQL_BIN:-$(command -v psql || echo /opt/homebrew/opt/postgresql@17/bin/psql)}"

"$PSQL_BIN" "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  --csv \
  -c "SET statement_timeout = '10s';" \
  -c "SET default_transaction_read_only = on;" \
  -c "$SQL"
