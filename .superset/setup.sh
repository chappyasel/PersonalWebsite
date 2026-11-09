#!/usr/bin/env bash

set -euo pipefail

workspace_root=$(git rev-parse --show-toplevel)
cd "$workspace_root"

required_node=$(tr -d '[:space:]' < "$workspace_root/.nvmrc")
nvm_loader="${NVM_DIR:-$HOME/.nvm}/nvm.sh"

if [[ ! -s "$nvm_loader" ]]; then
  echo "Superset setup requires nvm at $nvm_loader." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$nvm_loader"

if ! nvm use --silent "$required_node" >/dev/null; then
  nvm install "$required_node"
fi

corepack enable

expected_pnpm=$(node -p \
  "require('./package.json').packageManager.replace(/^pnpm@/, '')")
actual_pnpm=$(corepack pnpm --version)

if [[ "$actual_pnpm" != "$expected_pnpm" ]]; then
  echo "Expected pnpm $expected_pnpm, but Corepack selected $actual_pnpm." >&2
  exit 1
fi

# Git lists the primary checkout first, regardless of its current branch.
main_checkout=$(
  git worktree list --porcelain | awk '/^worktree / && !found { print substr($0, 10); found = 1 }'
)

if [[ -z "$main_checkout" ]]; then
  echo "Could not locate the main worktree for environment-file setup." >&2
  exit 1
fi

env_available=false
for env_name in .env .env.local .env.development .env.development.local; do
  source_path="$main_checkout/$env_name"
  target_path="$workspace_root/$env_name"

  if [[ ! -e "$target_path" && -f "$source_path" ]]; then
    cp -p "$source_path" "$target_path"
    echo "Copied $env_name from the main checkout."
  fi

  if [[ -f "$target_path" ]]; then
    env_available=true
  fi
done

if [[ "$env_available" != true ]]; then
  echo "No development environment file is available after setup. Add .env, .env.local, .env.development, or .env.development.local to this workspace or the main checkout." >&2
  exit 1
fi

corepack pnpm install --frozen-lockfile

echo "Superset setup complete with Node $(node --version) and pnpm $actual_pnpm."
