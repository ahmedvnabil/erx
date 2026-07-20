#!/usr/bin/env bash
# ERX REST examples — curl calls against the public Egypt Research API.
# Usage: ./examples/rest.sh            (uses the hosted endpoint)
#        ERX_BASE=http://localhost:8080 ./examples/rest.sh   (self-hosted)
#
# No API key is required for public research. All endpoints are GET + JSON.
set -euo pipefail

BASE="${ERX_BASE:-https://erx-mcp.zad.tools}"
API="${BASE}/api/v1"

echo "== 1. Hybrid search: قانون العمل =="
curl -fsS -G "${API}/search" \
  --data-urlencode "q=قانون العمل" \
  --data-urlencode "mode=hybrid" \
  --data-urlencode "limit=5"
echo

echo "== 2. Get one document (id=1) =="
curl -fsS "${API}/documents/1"
echo

echo "== 3. Archive coverage + source health =="
curl -fsS "${API}/coverage"
echo

echo "== 4. Live indicator: World Bank population, Egypt =="
curl -fsS -G "${API}/live/data" \
  --data-urlencode "source=world-bank" \
  --data-urlencode "indicator=SP.POP.TOTL" \
  --data-urlencode "country=EGY"
echo

echo "== 5. Export references as RIS -> egypt-research.ris =="
curl -fsS -G "${BASE}/export" \
  --data-urlencode "q=قانون العمل" \
  --data-urlencode "format=ris" \
  -o egypt-research.ris
echo "saved egypt-research.ris"

# Tip: pipe any JSON call through `jq` for readable output, e.g.
#   curl -fsS "${API}/coverage" | jq .
