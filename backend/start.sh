#!/bin/sh
set -e
echo "Running database migrations..."

# Use only when deploying against an already-shaped database where historical
# baseline migrations were applied out-of-band and migration history needs to be
# reconciled. Keep this opt-in; setting it on an unknown database can hide drift.
if [ "${PRISMA_RESOLVE_LEGACY_BASELINES:-0}" = "1" ]; then
  npx prisma migrate resolve --applied 20260419165003_init 2>/dev/null || true
  npx prisma migrate resolve --applied 20260422211153_init 2>/dev/null || true
fi

if [ "${PRISMA_BASELINE_CURRENT_INIT:-0}" = "1" ]; then
  npx prisma migrate resolve --applied 20260425000000_init 2>/dev/null || true
fi

npx prisma migrate deploy
echo "Starting server..."
exec node dist/index.js
