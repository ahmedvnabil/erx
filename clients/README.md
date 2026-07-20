# ERX API Clients

Thin, dependency-free client libraries for the **ERX (Egypt Research) REST
API** — a source-grounded API for Egyptian public-affairs research.

- **Base URL:** `https://erx-mcp.zad.tools`
- **API prefix:** `/api/v1`
- **Auth:** none (read-only, snake_case JSON)
- **MCP endpoint:** `https://erx-mcp.zad.tools/mcp` (Streamable HTTP)

Both clients expose the same endpoint surface: `search`, document lookup,
sources, coverage, entities, events, claims, live datasets/data/health, status,
and reference export (RIS / BibTeX / CSV / JSONL).

## [Python](./python/) — `erx-client`

Standard library only (`urllib`, `json`); requires Python 3.9+.

```bash
# copy clients/python/erx_client.py into your project, or:
pip install ./python
```

```python
from erx_client import ErxClient
client = ErxClient()
hits = client.search("قانون العمل", limit=5)
print(hits["count"], "results")
```

## [TypeScript](./typescript/) — `egypt-research-client`

Global `fetch` only; runs on Node.js 18+ and modern browsers. Ships TS source.

```bash
npm install egypt-research-client   # or copy typescript/src/index.ts
```

```ts
import { ErxClient } from "egypt-research-client";
const client = new ErxClient();
const hits = await client.search("قانون العمل", { limit: 5 });
console.log(hits.count, "results");
```

See each subfolder's README for the full method table and runnable examples.
