#!/usr/bin/env python3
"""ERX REST quickstart — stdlib only (urllib), no dependencies.

Hits the public Egypt Research search endpoint and prints the top results.

Usage:
    python3 examples/python_quickstart.py
    python3 examples/python_quickstart.py "حرية الصحافة"
    ERX_BASE=http://localhost:8080 python3 examples/python_quickstart.py

No API key is required for public research.
"""
import json
import os
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = os.environ.get("ERX_BASE", "https://erx-mcp.zad.tools")


def search(query: str, *, mode: str = "hybrid", limit: int = 5) -> dict:
    """Call GET /api/v1/search and return the parsed JSON envelope."""
    params = urlencode({"q": query, "mode": mode, "limit": limit})
    url = f"{BASE}/api/v1/search?{params}"
    request = Request(url, headers={"Accept": "application/json"})
    with urlopen(request, timeout=30) as response:  # noqa: S310 (trusted ERX host)
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    query = sys.argv[1] if len(sys.argv) > 1 else "قانون العمل"
    data = search(query)
    print(f"query: {data['query']}  mode: {data['mode']}  count: {data['count']}")
    for item in data["results"]:
        published = item.get("published_at") or "—"
        print(f"  [{item['document_id']}] {item['title']}")
        print(f"      {item['source_type']} · {published} · {item['canonical_url']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
