#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:?usage: validate-backend-runtime.sh <image> [build-sha]}"
BUILD_SHA="${2:-runtime-smoke}"
SUFFIX="${RUNTIME_SUFFIX:-${GITHUB_RUN_ID:-$$}}"
NETWORK="quiz-runtime-${SUFFIX}"
POSTGRES_CONTAINER="quiz-postgres-${SUFFIX}"
REDIS_CONTAINER="quiz-redis-${SUFFIX}"
BACKEND_CONTAINER="quiz-backend-${SUFFIX}"
HOST_PORT="${RUNTIME_HOST_PORT:-4000}"

cleanup() {
  docker logs "$BACKEND_CONTAINER" 2>/dev/null || true
  docker rm -f "$BACKEND_CONTAINER" "$POSTGRES_CONTAINER" "$REDIS_CONTAINER" 2>/dev/null || true
  docker network rm "$NETWORK" 2>/dev/null || true
}
trap cleanup EXIT

docker network create "$NETWORK" >/dev/null
docker run -d --name "$POSTGRES_CONTAINER" --network "$NETWORK" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=test-password \
  -e POSTGRES_DB=quiz_royale \
  postgres:16-alpine >/dev/null
docker run -d --name "$REDIS_CONTAINER" --network "$NETWORK" redis:7-alpine >/dev/null

dependencies_ready=false
for attempt in {1..30}; do
  if docker exec "$POSTGRES_CONTAINER" pg_isready -U postgres -d quiz_royale >/dev/null 2>&1 \
    && docker exec "$REDIS_CONTAINER" redis-cli ping | grep -q PONG; then
    dependencies_ready=true
    break
  fi
  sleep 2
done

if [ "$dependencies_ready" != "true" ]; then
  echo "Postgres/Redis did not become ready for backend runtime validation."
  exit 1
fi

docker run -d --name "$BACKEND_CONTAINER" --network "$NETWORK" -p "${HOST_PORT}:4000" \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e LOG_LEVEL=info \
  -e CORS_ORIGIN=https://quiz-royale-showdown.vercel.app \
  -e DATABASE_URL="postgresql://postgres:test-password@${POSTGRES_CONTAINER}:5432/quiz_royale" \
  -e REDIS_URL="redis://${REDIS_CONTAINER}:6379" \
  -e JWT_ACCESS_SECRET=ci-access-secret-that-is-at-least-32-characters \
  -e JWT_REFRESH_SECRET=ci-refresh-secret-that-is-at-least-32-characters \
  -e ADMIN_SECRET=ci-admin-secret-that-is-at-least-32-characters \
  -e BUILD_SHA="$BUILD_SHA" \
  "$IMAGE" >/dev/null

for attempt in {1..75}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${HOST_PORT}/health/ready"; then
    echo
    echo "Backend production readiness check passed."
    exit 0
  fi
  if ! docker inspect -f '{{.State.Running}}' "$BACKEND_CONTAINER" | grep -q true; then
    echo "Backend container exited before becoming ready."
    exit 1
  fi
  sleep 2
done

echo "Backend did not become ready within 150 seconds."
exit 1
