#!/bin/sh
set -e
# Use committed migrations when present, otherwise sync the schema directly (first run / dev).
if [ -d prisma/migrations ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
else
  npx prisma db push --skip-generate
fi
if [ "${RUN_SEED:-true}" = "true" ]; then
  npx tsx prisma/seed.ts || echo "Seeding skipped/failed"
fi
exec node dist/server.js
