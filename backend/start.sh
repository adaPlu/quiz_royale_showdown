#!/bin/sh
set -eu

MIGRATION_TIMEOUT_SECONDS="${MIGRATION_TIMEOUT_SECONDS:-120}"
echo "Running database migrations with a ${MIGRATION_TIMEOUT_SECONDS}s startup limit..."

# Baseline reconciliation remains explicitly opt-in. Unknown databases must not
# silently bypass migration history checks.
if [ "${PRISMA_RESOLVE_LEGACY_BASELINES:-0}" = "1" ]; then
  timeout "$MIGRATION_TIMEOUT_SECONDS" npx prisma migrate resolve --applied 20260419165003_init 2>/dev/null || true
  timeout "$MIGRATION_TIMEOUT_SECONDS" npx prisma migrate resolve --applied 20260422211153_init 2>/dev/null || true
fi

if [ "${PRISMA_BASELINE_CURRENT_INIT:-0}" = "1" ]; then
  timeout "$MIGRATION_TIMEOUT_SECONDS" npx prisma migrate resolve --applied 20260425000000_init 2>/dev/null || true
fi

# Production startup is fail-closed: the application must never serve traffic
# against a schema that did not complete its required migrations.
timeout "$MIGRATION_TIMEOUT_SECONDS" npx prisma migrate deploy
echo "Database migrations completed."

BACKFILL_TIMEOUT_SECONDS="${BACKFILL_TIMEOUT_SECONDS:-30}"
echo "Assigning fallback names to unnamed players..."
timeout "$BACKFILL_TIMEOUT_SECONDS" node dist/scripts/backfillDisplayNames.js
echo "Player display names are ready."

SEED_TIMEOUT_SECONDS="${SEED_TIMEOUT_SECONDS:-60}"
echo "Ensuring the production question bank is ready..."
timeout "$SEED_TIMEOUT_SECONDS" node dist/scripts/seed.js
echo "Question bank is ready."

echo "Starting server..."
exec node dist/index.js
