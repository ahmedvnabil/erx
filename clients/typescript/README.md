# egypt-research-client (TypeScript)

A zero-dependency TypeScript client for the **ERX (Egypt Research) REST API** —
a source-grounded research API for Egyptian public affairs. It uses the global
`fetch` API, so it runs on **Node.js 18+** and modern browsers with no runtime
dependencies.

> This package **ships TypeScript source** (`src/index.ts`). Consume it with a
> TS toolchain (tsc, tsx, Bun, Vite, esbuild, etc.). `main` and `types` both
> point at the source file.

- **Base URL:** `https://erx-mcp.zad.tools`
- **API prefix:** `/api/v1`
- **Auth:** none (read-only)

## Install

```bash
npm install egypt-research-client
# or just copy src/index.ts into your project
```

## Usage

```ts
import { ErxClient, ErxError } from "egypt-research-client";

const client = new ErxClient(); // defaults to https://erx-mcp.zad.tools

// Search the archive (results are fully typed)
const hits = await client.search("قانون العمل", { mode: "hybrid", limit: 5 });
for (const result of hits.results) {
  console.log(result.document_id, result.title, "—", result.source_name);
}

// Fetch a full document
const { document } = await client.getDocument(hits.results[0].document_id);

// Catalog + live data
const sources = await client.listSources();
const datasets = await client.liveDatasets();
const inflation = await client.liveData("world-bank", {
  indicator: "FP.CPI.TOTL.ZG",
  country: "EG",
});

// Export citations (returns a string)
const ris = await client.exportReferences("قانون العمل", "ris");

// Errors carry the HTTP status and body
try {
  await client.getDocument(999_999_999);
} catch (error) {
  if (error instanceof ErxError) console.log(error.status, error.body);
}
```

A complete runnable script lives in [`example.ts`](./example.ts):

```bash
npx tsx example.ts
```

## Methods

| Method | Endpoint |
| --- | --- |
| `search(q, { mode, limit, offset })` | `GET /api/v1/search` |
| `getDocument(documentId)` | `GET /api/v1/documents/{id}` |
| `listSources()` | `GET /api/v1/sources` |
| `coverage()` | `GET /api/v1/coverage` |
| `entities(documentId?)` | `GET /api/v1/entities` |
| `events()` | `GET /api/v1/events` |
| `claims()` | `GET /api/v1/claims` |
| `liveDatasets()` | `GET /api/v1/live/datasets` |
| `liveData(source, params?)` | `GET /api/v1/live/data` |
| `liveHealth()` | `GET /api/v1/live/health` |
| `status()` | `GET /api/v1/status` |
| `exportReferences(q, format?)` | `GET /export` (returns string) |

All methods are `async`. JSON responses use snake_case keys and are typed via
exported interfaces (`SearchResponse`, `SearchResult`, `Source`, etc.). On any
non-2xx response the client throws `ErxError` with `.status`, `.body` and `.url`.
