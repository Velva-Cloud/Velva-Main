#!/bin/sh
set -e

# Ensure Prisma client is ready (already generated in build)
# Run migrations (safe for prod with migrate deploy); fallback to db push if no migrations exist
npx prisma migrate deploy || npx prisma db push

# Start the API
node dist/src/main.js