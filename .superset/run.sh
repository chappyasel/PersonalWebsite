#!/usr/bin/env bash

set -euo pipefail

workspace_root=$(git rev-parse --show-toplevel)
cd "$workspace_root"

required_node=$(tr -d '[:space:]' < "$workspace_root/.nvmrc")
nvm_loader="${NVM_DIR:-$HOME/.nvm}/nvm.sh"

if [[ ! -s "$nvm_loader" ]]; then
  echo "Superset run requires nvm at $nvm_loader." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$nvm_loader"
nvm use --silent "$required_node" >/dev/null

exec corepack pnpm dev
