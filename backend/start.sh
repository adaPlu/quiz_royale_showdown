#!/bin/sh
set -eu

MIGRATION_TIMEOUT_SECONDS="${MIGRATION_TIMEOUT_SECONDS:-120}"
echo "Reconciling legacy migration history with a ${MIGRATION_TIMEOUT_SECONDS}s startup limit..."

# The repository contains two identical historical init migrations before the
# canonical current baseline. The reconciliation script only auto-baselines
# those duplicates on a provably empty database. Non-empty unknown databases
# remain fail-closed unless an operator explicitly opts in with the documented
# PRISMA_RESOLVE_LEGACY_BASELINES / PRISMA_BASELINE_CURRENT_INIT flags.
timeout "$MIGRATION_TIMEOUT_SECONDS" node dist/scripts/reconcileLegacyMigrations.js
echo "Migration history reconciliation completed."

# Older Railway releases continued after Prisma failures and may have left a
# known post-baseline migration partially applied. Complete only those exact,
# idempotent schemas and mark their migration records applied before deploy.
echo "Repairing known post-baseline migration history..."
timeout "$MIGRATION_TIMEOUT_SECONDS" node dist/scripts/repairKnownMigrations.js
echo "Known migration history repair completed."

# Production startup is fail-closed: the application must never serve traffic
# against a schema that did not complete its required migrations.
echo "Running database migrations..."
timeout "$MIGRATION_TIMEOUT_SECONDS" npx prisma migrate deploy
echo "Database migrations completed."
echo "Database schema is ready for application startup."

BACKFILL_TIMEOUT_SECONDS="${BACKFILL_TIMEOUT_SECONDS:-30}"
echo "Assigning fallback names to unnamed players..."
timeout "$BACKFILL_TIMEOUT_SECONDS" node dist/scripts/backfillDisplayNames.js
echo "Player display names are ready."

GUEST_CLEANUP_TIMEOUT_SECONDS="${GUEST_CLEANUP_TIMEOUT_SECONDS:-30}"
echo "Cleaning up expired guest accounts..."
timeout "$GUEST_CLEANUP_TIMEOUT_SECONDS" node dist/scripts/cleanupExpiredGuests.js
echo "Guest account cleanup completed."

SEED_TIMEOUT_SECONDS="${SEED_TIMEOUT_SECONDS:-60}"
echo "Ensuring the production question bank is ready..."
timeout "$SEED_TIMEOUT_SECONDS" node dist/scripts/seed.js
echo "Question bank is ready."

echo "Starting server..."
exec node dist/index.js
