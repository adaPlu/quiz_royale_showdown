#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: ./scripts/upload-assets.sh <local-dir> <s3://bucket/path>"
  exit 1
fi

LOCAL_DIR="$1"
S3_TARGET="$2"

aws s3 sync "$LOCAL_DIR" "$S3_TARGET" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html" \
  --content-type "application/octet-stream"

aws s3 cp "$LOCAL_DIR/index.json" "$S3_TARGET/index.json" \
  --cache-control "public,max-age=60" \
  --content-type "application/json"
