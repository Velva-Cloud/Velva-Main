#!/bin/sh
set -e

# Ensure Prisma client is ready (already generated in build)
# Run migrations (safe for prod with migrate deploy); fallback to db push if no migrations exist
npx prisma migrate deploy || npx prisma db push

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