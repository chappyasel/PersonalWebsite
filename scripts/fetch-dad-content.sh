#!/bin/bash
set -e

# Skip if content already exists (local dev with symlinks)
if [ -d "content/dad/Journal" ] && [ -d "content/dad/Insights" ]; then
  echo "Dad content already present, skipping fetch"
  exit 0
fi

# Run the Node fetch script (no gcloud dependency)
node scripts/fetch-dad-content.mjs
