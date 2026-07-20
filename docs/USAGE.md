# دليل الاستخدام — ERX Usage Guide

**Egypt Research Commons / مرصد مصر البحثي** — a source-grounded MCP server and REST research
commons for Egyptian public affairs. Every result carries its original URL, publisher, and dates.

- MCP endpoint (Streamable HTTP): `https://erx-mcp.zad.tools/mcp`
- REST base: `https://erx-mcp.zad.tools/api/v1`
- npm package: `egypt-research-mcp` (Node `>=24`, no API key required for public research)

> Replace `https://erx-mcp.zad.tools` with your own origin if you self-host. In self-hosted
> deployments the base URL is taken from `EGYPT_RESEARCH_PUBLIC_URL`.

---

## 1. MCP — النموذج (Model Context Protocol)

ERX ships the same 21 `egypt_*` tools over two transports: **Streamable HTTP** (hosted) and
**stdio** (local process). Neither requires authentication for read tools.

### 1.1 Streamable HTTP (hosted)

Point any MCP client at the hosted endpoint.

**Claude Desktop / generic client** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "egypt-research": {
      "url": "https://erx-mcp.zad.tools/mcp"
    }
  }
}
```

**Cursor** — `~/.cursor/mcp.json` (project-scoped: `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "egypt-research": {
      "url": "https://erx-mcp.zad.tools/mcp"
    }
  }
}
```

**VS Code** — `.vscode/mcp.json` (VS Code uses `servers` + an explicit `type`):

```json
{
  "servers": {
    "egypt-research": {
      "type": "http",
      "url": "https://erx-mcp.zad.tools/mcp"
    }
  }
}
```

### 1.2 stdio (local)

Run the server as a local child process — good for offline work and CI. The package boots a
local SQLite archive; no key is needed.

```bash
npx -y egypt-research-mcp serve --transport stdio
```

Client config that spawns it over stdio:

```json
{
  "mcpServers": {
    "egypt-research": {
      "command": "npx",
      "args": ["-y", "egypt-research-mcp", "serve", "--transport", "stdio"]
    }
  }
}
```

> `GEMINI_API_KEY` is **optional** — it only enables external semantic (embedding) indexing.
> Lexical and hybrid search work without it.

### 1.3 Programmatic client (Node)

See [`examples/mcp-client.mjs`](../examples/mcp-client.mjs). It connects over Streamable HTTP,
calls `tools/list`, then calls `egypt_search`. The SDK (`@modelcontextprotocol/sdk`) is already a
dependency:

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(new URL("https://erx-mcp.zad.tools/mcp"));
const client = new Client({ name: "erx-demo", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const result = await client.callTool({
  name: "egypt_search",
  arguments: { query: "قانون العمل", source_types: ["legal"], limit: 5 }
});
await client.close();
```

---

## 2. REST — الواجهة (public HTTP API)

Base: `https://erx-mcp.zad.tools/api/v1`. All endpoints are `GET`, return JSON, send
`Access-Control-Allow-Origin: *`, and are rate limited per client per minute. JSON response
fields are **snake_case** (the server converts internal camelCase on the wire).

| Method & path | Purpose | Key query params |
|---|---|---|
| `GET /api/v1/search` | Search documents | `q` (2–1000 chars, required), `mode` = `hybrid`\|`lexical`, `limit` (1–100) |
| `GET /api/v1/documents/{document_id}` | One source-backed document | — |
| `GET /api/v1/sources` | Research source catalog | — |
| `GET /api/v1/coverage` | Archive coverage + source health | — |
| `GET /api/v1/status` | Service status + coverage snapshot | — |
| `GET /api/v1/entities` | Extracted entities | `document_id` (optional) |
| `GET /api/v1/events` | Documented events | — |
| `GET /api/v1/claims` | Claims and their evidence | — |
| `GET /api/v1/saved-searches` | Locally saved follow-up queries | — |
| `GET /api/v1/live/datasets` | Public live-data connector catalog | — |
| `GET /api/v1/live/data` | Query one live dataset | `source` (required), `indicator`, `country`, `period_from`, `period_to`, `limit` |
| `GET /api/v1/live/health` | Live-source availability check | — |
| `GET /api/v1/openapi.json` | OpenAPI 3.1 description | — |
| `GET /export` | Reference export (see §3) | `q`, `format` |

Validation errors return `422` with `{ "error": { "code": "invalid_query" } }` (or
`invalid_limit`, `invalid_mode`, `invalid_live_source`). Rate-limit overflow returns `429` with a
`Retry-After` header.

### 2.1 Search

```bash
curl -G "https://erx-mcp.zad.tools/api/v1/search" \
  --data-urlencode "q=قانون العمل" \
  --data-urlencode "mode=hybrid" \
  --data-urlencode "limit=5"
```

Response (abridged):

```json
{
  "query": "قانون العمل",
  "mode": "hybrid",
  "count": 5,
  "results": [
    {
      "document_id": 1,
      "source_slug": "eipr",
      "source_type": "legal",
      "title": "…",
      "canonical_url": "https://…",
      "published_at": "2026-07-14T00:00:00.000Z",
      "archived_at": "2026-07-14T01:00:00.000Z",
      "match_reasons": ["lexical", "semantic"],
      "excerpt": "…",
      "citation": { "title": "…", "source_name": "…", "url": "https://…", "published_at": "…", "archived_at": "…" }
    }
  ]
}
```

### 2.2 Get a document

```bash
curl "https://erx-mcp.zad.tools/api/v1/documents/1"
```

```json
{ "document": { "document_id": 1, "title": "…", "canonical_url": "https://…", "content": "…" } }
```

`404` with `{ "error": { "code": "not_found" } }` when the id is unknown.

### 2.3 Coverage

```bash
curl "https://erx-mcp.zad.tools/api/v1/coverage"
```

```json
{
  "documents": 1,
  "searchable_documents": 1,
  "excluded_documents": 0,
  "sources": 1,
  "healthy_sources": 1,
  "topic_counts": { "…": 1 }
}
```

### 2.4 Live data

```bash
curl -G "https://erx-mcp.zad.tools/api/v1/live/data" \
  --data-urlencode "source=world-bank" \
  --data-urlencode "indicator=SP.POP.TOTL" \
  --data-urlencode "country=EGY"
```

Live sources: `world-bank`, `imf-datamapper`, `who-gho`, `unhcr`, `crossref`, `un-comtrade`.
Every observation carries `value`, `period`, `retrieved_at`, `source_url`, and `license`.

---

## 3. Export formats — صيغ التصدير

`GET /export?q=<query>&format=<format>` returns a downloadable file
(`Content-Disposition: attachment`). The MCP tool `egypt_export_references` returns the same
formats. Supported `format` values:

| Format | Use | Notes |
|---|---|---|
| `ris` | Reference managers (Zotero, EndNote) | default; `TY  - ELEC` records |
| `bibtex` | LaTeX / academic writing | `@misc{…}` entries |
| `csv` | Spreadsheets / quick review | header: `document_id,title,source_name,source_type,url,published_at,archived_at` |
| `jsonl` | Data pipelines | one full JSON result per line |

```bash
curl -G "https://erx-mcp.zad.tools/export" \
  --data-urlencode "q=قانون العمل" \
  --data-urlencode "format=ris" -o egypt-research.ris
```

An unsupported `format` returns `400 { "error": "unsupported_format" }`.

---

## 4. أي أداة لأي مهمة — Which tool for which task

All MCP tools are prefixed `egypt_`. The most useful ones:

| Task | Tool | Typical input |
|---|---|---|
| بحث موحد في الوثائق | `egypt_search` | `{ "query": "قانون العمل", "source_types": ["legal"], "limit": 20 }` |
| بحث نصي + دلالي مع تفسير الترتيب | `egypt_hybrid_search` | `{ "query": "حقوق العمال", "source_types": ["human_rights"] }` |
| استرجاع وثيقة واستشهادها | `egypt_get_document` | `{ "document_id": 1 }` |
| ملف بحثي كامل في استدعاء واحد | `egypt_research_dossier` | `{ "query": "حقوق اللاجئين", "limit": 20 }` |
| بناء خط زمني موثق | `egypt_build_timeline` | `{ "query": "حرية الصحافة", "limit": 50 }` |
| مقارنة التغطية بين أنواع المصادر | `egypt_compare_sources` | `{ "query": "التضخم" }` |
| تجميع ومقارنة ادعاءات متشابهة | `egypt_compare_claims` | `{ "query": "ترحيل اللاجئين" }` |
| تتبع ادعاء إلى كل دليل | `egypt_trace_claim` | `{ "claim_id": 1 }` |
| استخراج الجهات والأماكن | `egypt_find_entities` | `{ "document_id": 1, "limit": 100 }` |
| أحداث مؤرخة مرتبطة بوثائقها | `egypt_list_events` | `{ "limit": 100 }` |
| كتالوج المصادر وحالتها | `egypt_list_sources` | `{ "source_type": "human_rights", "active_only": true }` |
| ملف مصدر وصحة جمعه | `egypt_get_source_profile` | `{ "source_slug": "eipr" }` |
| موجز مواد يوم محدد | `egypt_get_daily_brief` | `{ "date": "2026-07-14", "limit": 50 }` |
| القصص المتقاربة وتنوع ناشريها | `egypt_list_stories` | `{ "limit": 20 }` |
| تصدير المراجع (RIS/BibTeX/CSV/JSONL) | `egypt_export_references` | `{ "query": "قانون العمل", "format": "ris" }` |
| تغطية الأرشيف وصحة المصادر | `egypt_get_coverage` | `egypt_get_coverage()` |
| حفظ استعلام متابعة محلي | `egypt_save_research_query` | `{ "name": "متابعة قانون العمل", "query": "قانون العمل" }` |
| كتالوج البيانات الحية | `egypt_list_live_datasets` | `egypt_list_live_datasets()` |
| جلب مؤشر حي مع provenance | `egypt_get_live_data` | `{ "source": "world-bank", "indicator": "SP.POP.TOTL", "country": "EGY" }` |
| مقارنة سلاسل بيانات حية | `egypt_compare_live_data` | `{ "queries": [{ "source": "world-bank", "indicator": "SP.POP.TOTL" }] }` |
| اختبار صحة مصادر البيانات الحية | `egypt_live_source_health` | `egypt_live_source_health()` |

The full, always-current tool reference (inputs + copy-paste examples) is rendered on the hosted
docs page: `https://erx-mcp.zad.tools/docs`.

---

## 5. مبادئ / Research contract

- **المصدر أولًا** — every result returns URL, publisher, publication and archive dates.
- **لا درجات حقيقة آلية** — source type and ownership are comparison context, not a verdict.
- **التكرار ليس تحققًا** — republication is separated from independent confirmation.

ERX is open research infrastructure, not a fact-checking authority.
