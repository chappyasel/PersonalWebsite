#!/usr/bin/env bash
# Search Chappy's book notes by meaning and keyword. Read-only.
# Usage: search.sh "angle one" ["angle two" ...] [--books 25] [--passages 3]
# Output: JSON on stdout (see SKILL.md, "Concept and topic questions").
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
if [[ $# -lt 1 ]]; then
  echo "usage: search.sh \"<query>\" [\"<query>\" ...] [--books N] [--passages N]" >&2
  exit 1
fi

NODE_BIN="${NODE_BIN:-$(command -v node || ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -n1)}"
if [[ -z "$NODE_BIN" ]]; then
  echo "error: node not found" >&2
  exit 1
fi

# From the repo root, so tsx resolves the repo's ~/ imports.
cd "$REPO_ROOT"
exec "$NODE_BIN" --env-file="$ENV_FILE" --import tsx scripts/book-notes-search.ts "$@"
