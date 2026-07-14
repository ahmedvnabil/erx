#!/bin/sh
set -eu

egypt-research-mcp backup --output "/backups/research-$(date -u +%Y%m%dT%H%M%SZ).db"
egypt-research-mcp ingest --channel auto --full-text --max-urls 200
egypt-research-mcp index --provider local
