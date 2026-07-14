#!/bin/sh
set -eu

node /app/dist/cli.js backup --output "/backups/research-$(date -u +%Y%m%dT%H%M%SZ).db"
ingest_status=0
node /app/dist/cli.js ingest --channel auto --full-text --max-urls 200 || ingest_status=$?
node /app/dist/cli.js index --provider local
exit "$ingest_status"
