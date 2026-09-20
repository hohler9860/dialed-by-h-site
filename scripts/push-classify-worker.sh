#!/bin/sh
# Pushes the patched classify worker (2026-09-20) to the live n8n instance.
curl -s -X PUT "https://n8n-nltfpptgxpadu0eorz1wreey.66.135.7.116.sslip.io/api/v1/workflows/Xg82RvsmhFExr7zj" \
  -H "X-N8N-API-KEY: $(cat ~/.n8n-api-key)" \
  -H "Content-Type: application/json" \
  -d @/Users/henryohler/IdeaProjects/dialed-by-h-site/scripts/n8n-classify-worker-2026-09-20.json \
  -o /tmp/n8n-put.json -w "HTTP %{http_code}\n"
head -c 200 /tmp/n8n-put.json; echo
