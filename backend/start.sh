#!/bin/sh
set -e

# Ensure Prisma client is ready (already generated in build)
# If there are migration files, deploy them; otherwise push schema changes.
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "Applying Prisma migrations (deploy)..."
  npx prisma migrate deploy
else
  echo "No migrations found. Pushing Prisma schema to database..."
  npx prisma db push
fi

# Optional seed on boot (idempotent) - disabled by default in production
if [ "${SEED_ON_BOOT:-false}" = "true" ]; then
  echo "Running seed (idempotent)..."
  node prisma/seed.js || echo "Seed step skipped or failed (continuing)."
fi

# Start the API (support both dist/src/main.js and dist/main.js layouts)
if [ -f "dist/src/main.js" ]; then
  node dist/src/main.js
elif [ -f "dist/main.js" ]; then
  node dist/main.js
else
  echo "Build output not found (dist/src/main.js or dist/main.js)."
  ls -la dist || true
  exit 1
fi