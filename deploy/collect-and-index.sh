#!/bin/sh
set -eu

node /app/dist/cli.js backup --output "/backups/research-$(date -u +%Y%m%dT%H%M%SZ).db"
node /app/dist/cli.js ingest --channel auto --full-text --max-urls 200
node /app/dist/cli.js index --provider local
