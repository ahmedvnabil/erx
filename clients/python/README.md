# erx-client (Python)

A dependency-free Python client for the **ERX (Egypt Research) REST API** — a
source-grounded research API for Egyptian public affairs. It uses only the
Python standard library (`urllib`, `json`), so there is nothing to install
beyond copying the single module.

- **Base URL:** `https://erx-mcp.zad.tools`
- **API prefix:** `/api/v1`
- **Auth:** none (read-only)
- **Python:** 3.9+

## Install

Copy `erx_client.py` into your project, or install the package locally:

```bash
pip install .
```

## Usage

```python
from erx_client import ErxClient, ErxError

client = ErxClient()  # defaults to https://erx-mcp.zad.tools

# Search the archive
hits = client.search("قانون العمل", mode="hybrid", limit=5)
print(hits["count"], "results")
for result in hits["results"]:
    print(result["document_id"], result["title"], "—", result["source_name"])

# Fetch a full document
document = client.get_document(hits["results"][0]["document_id"])["document"]

# Browse the catalog and live data
sources = client.list_sources()
datasets = client.live_datasets()
inflation = client.live_data("world-bank", indicator="FP.CPI.TOTL.ZG", country="EG")

# Export citations (returns text)
ris = client.export_references("قانون العمل", format="ris")

# Errors carry the HTTP status and body
try:
    client.get_document(999_999_999)
except ErxError as error:
    print(error.status, error.body)
```

A complete runnable script lives in [`example.py`](./example.py):

```bash
python3 example.py
```

## Methods

| Method | Endpoint |
| --- | --- |
| `search(q, mode="hybrid", limit=20, offset=0)` | `GET /api/v1/search` |
| `get_document(document_id)` | `GET /api/v1/documents/{id}` |
| `list_sources()` | `GET /api/v1/sources` |
| `coverage()` | `GET /api/v1/coverage` |
| `entities(document_id=None)` | `GET /api/v1/entities` |
| `events()` | `GET /api/v1/events` |
| `claims()` | `GET /api/v1/claims` |
| `live_datasets()` | `GET /api/v1/live/datasets` |
| `live_data(source, **params)` | `GET /api/v1/live/data` |
| `live_health()` | `GET /api/v1/live/health` |
| `status()` | `GET /api/v1/status` |
| `export_references(q, format="ris")` | `GET /export` (returns text) |

All JSON methods return plain `dict` objects with snake_case keys. On any
non-2xx response the client raises `ErxError` with `.status`, `.body` and
`.url`.
