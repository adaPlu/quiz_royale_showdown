#!/bin/sh
set -u

MIGRATION_TIMEOUT_SECONDS="${MIGRATION_TIMEOUT_SECONDS:-60}"
echo "Running database migrations with a ${MIGRATION_TIMEOUT_SECONDS}s startup limit..."

# Use only when deploying against an already-shaped database where historical
# baseline migrations were applied out-of-band and migration history needs to be
# reconciled. Keep this opt-in; setting it on an unknown database can hide drift.
if [ "${PRISMA_RESOLVE_LEGACY_BASELINES:-0}" = "1" ]; then
  timeout "$MIGRATION_TIMEOUT_SECONDS" npx prisma migrate resolve --applied 20260419165003_init 2>/dev/null || true
  timeout "$MIGRATION_TIMEOUT_SECONDS" npx prisma migrate resolve --applied 20260422211153_init 2>/dev/null || true
fi

if [ "${PRISMA_BASELINE_CURRENT_INIT:-0}" = "1" ]; then
  timeout "$MIGRATION_TIMEOUT_SECONDS" npx prisma migrate resolve --applied 20260425000000_init 2>/dev/null || true
fi

if timeout "$MIGRATION_TIMEOUT_SECONDS" npx prisma migrate deploy; then
  echo "Database migrations completed."
else
  migration_status=$?
  if [ "$migration_status" -eq 124 ]; then
    echo "WARNING: Prisma migrations exceeded ${MIGRATION_TIMEOUT_SECONDS}s."
  else
    echo "WARNING: Prisma migrations failed with exit code ${migration_status}."
  fi
  echo "Starting the HTTP service so /health can report liveness."
  echo "Use /health/ready and the deployment logs to diagnose database readiness."
fi

SEED_TIMEOUT_SECONDS="${SEED_TIMEOUT_SECONDS:-60}"
echo "Ensuring the production question bank is ready..."
if timeout "$SEED_TIMEOUT_SECONDS" node dist/scripts/seed.js; then
  echo "Question bank is ready."
else
  seed_status=$?
  echo "WARNING: Database seed check failed with exit code ${seed_status}."
  echo "The server will start, but game starts may fail until active questions exist."
fi

echo "Starting server..."
exec node dist/index.js
