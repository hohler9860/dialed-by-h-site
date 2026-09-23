#!/bin/sh
# Pause (or resume) the pipeline workers + ingest so the database can recover.
#   sh scripts/pause-workers.sh pause
#   sh scripts/pause-workers.sh resume
N8N=https://n8n-nltfpptgxpadu0eorz1wreey.66.135.7.116.sslip.io
K=$(cat ~/.n8n-api-key)
verb=${1:-pause}; [ "$verb" = "resume" ] && ep=activate || ep=deactivate
for id in Xg82RvsmhFExr7zj eP9B2LCiMmgbzqW6 S6OXOdFfniHWrRNV oWrtjyWujmWjo6ZT; do
  printf "%s %s -> " "$ep" "$id"
  curl -s -X POST "$N8N/api/v1/workflows/$id/$ep" -H "X-N8N-API-KEY: $K" -o /dev/null -w "HTTP %{http_code}\n"
done
echo "(classify, vision verify, media upload, ingest v2 catch-up; the push ingest keeps receiving messages)"
