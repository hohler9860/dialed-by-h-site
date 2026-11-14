#!/bin/sh
# Pushes the vision verify worker to the live n8n instance.
#   sh scripts/push-verify-worker.sh            -> the 2026-11-14 patch (model fallbacks)
#   sh scripts/push-verify-worker.sh rollback   -> the worker exactly as it was before the patch
N8N=https://n8n-nltfpptgxpadu0eorz1wreey.66.135.7.116.sslip.io
K=$(cat ~/.n8n-api-key)
D=$(cd "$(dirname "$0")" && pwd)
f=n8n-verify-worker-2026-11-14.json
[ "$1" = "rollback" ] && f=n8n-verify-worker-2026-11-14-rollback.json
printf "%s -> " "$f"
curl -s -X PUT "$N8N/api/v1/workflows/eP9B2LCiMmgbzqW6" -H "X-N8N-API-KEY: $K" -H "Content-Type: application/json" -d @"$D/$f" -o /tmp/n8n-put-verify.json -w "HTTP %{http_code}\n"
