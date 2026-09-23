#!/bin/sh
# Pushes the fixed watchdog (never restarts when its own DB check fails) and re-activates it.
N8N=https://n8n-nltfpptgxpadu0eorz1wreey.66.135.7.116.sslip.io; K=$(cat ~/.n8n-api-key)
curl -s -X PUT "$N8N/api/v1/workflows/huCzEumZYRHZmVE6" -H "X-N8N-API-KEY: $K" -H "Content-Type: application/json" \
  -d @/Users/henryohler/.n8n-watchdog-v3.json -o /dev/null -w "update HTTP %{http_code}\n"
curl -s -X POST "$N8N/api/v1/workflows/huCzEumZYRHZmVE6/activate" -H "X-N8N-API-KEY: $K" -o /dev/null -w "activate HTTP %{http_code}\n"
