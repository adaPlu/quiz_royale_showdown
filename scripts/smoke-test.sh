#!/bin/bash
# Quiz Royale Showdown — Integration Smoke Test
# Run after: docker-compose up -d && cd backend && npm run dev
# Usage: bash scripts/smoke-test.sh
set -e

BASE=http://localhost:4000/api/v1

echo "=== Health Check ==="
curl -sf $BASE/health | jq .

echo ""
echo "=== Register Test User ==="
RESP=$(curl -sf -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testlead","email":"lead@test.com","password":"TestPass123"}')
echo $RESP | jq .
TOKEN=$(echo $RESP | jq -r .accessToken)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: No accessToken returned from register"
  exit 1
fi
echo "Token acquired: ${TOKEN:0:20}..."

echo ""
echo "=== Get Profile ==="
curl -sf $BASE/users/me -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "=== Create Room ==="
ROOM=$(curl -sf -X POST $BASE/rooms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isPrivate":false,"maxPlayers":8}')
echo $ROOM | jq .
ROOM_ID=$(echo $ROOM | jq -r .id)

echo ""
echo "=== Get Room ==="
curl -sf $BASE/rooms/$ROOM_ID \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "=== List Power-Ups ==="
curl -sf $BASE/powerups/inventory \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "=== List Cosmetics ==="
curl -sf $BASE/cosmetics \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "=== Login (verify token rotation) ==="
LOGIN_RESP=$(curl -sf -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lead@test.com","password":"TestPass123"}')
echo $LOGIN_RESP | jq .
NEW_TOKEN=$(echo $LOGIN_RESP | jq -r .accessToken)

if [ -z "$NEW_TOKEN" ] || [ "$NEW_TOKEN" = "null" ]; then
  echo "ERROR: No accessToken returned from login"
  exit 1
fi

echo ""
echo "=== Smoke test PASSED ==="
