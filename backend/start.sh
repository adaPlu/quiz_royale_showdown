#!/bin/sh
set -e
echo "Running database migrations..."
npx prisma migrate resolve --applied 20260419165003_init 2>/dev/null || true
npx prisma migrate resolve --applied 20260425000000_init 2>/dev/null || true
npx prisma migrate deploy
echo "Starting server..."
exec node dist/index.js
