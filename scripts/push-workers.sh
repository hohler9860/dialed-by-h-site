#!/bin/sh
# Pushes the patched classify + verify workers to the live n8n instance.
N8N=https://n8n-nltfpptgxpadu0eorz1wreey.66.135.7.116.sslip.io
K=$(cat ~/.n8n-api-key)
D=/Users/henryohler/IdeaProjects/dialed-by-h-site/scripts
for pair in "Xg82RvsmhFExr7zj:n8n-classify-worker-2026-09-20.json" "eP9B2LCiMmgbzqW6:n8n-verify-worker-2026-09-20.json"; do
  id=${pair%%:*}; f=${pair#*:}
  printf "%s -> " "$f"
  curl -s -X PUT "$N8N/api/v1/workflows/$id" -H "X-N8N-API-KEY: $K" -H "Content-Type: application/json" -d @"$D/$f" -o /tmp/n8n-put-$id.json -w "HTTP %{http_code}\n"
done
