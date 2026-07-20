/**
 * Runnable example for the ERX TypeScript client.
 *
 * Run with a TS-aware runtime, e.g.:
 *   npx tsx example.ts
 * or compile with tsc and run the emitted JS on Node.js 18+.
 *
 * It hits the public read-only endpoints at https://erx-mcp.zad.tools .
 */

import { ErxClient, ErxError } from "./src/index.js";

async function main(): Promise<void> {
  const client = new ErxClient(); // defaults to https://erx-mcp.zad.tools

  try {
    const status = await client.status();
    console.log("Service status:", status.status);

    const hits = await client.search("قانون العمل", { mode: "hybrid", limit: 5 });
    console.log(`\nSearch returned ${hits.count} result(s):`);
    for (const result of hits.results) {
      console.log(`  [${result.document_id}] ${result.title}`);
      console.log(`      source: ${result.source_name} (${result.source_type})`);
      console.log(`      url:    ${result.canonical_url}`);
    }

    const first = hits.results[0];
    if (first) {
      const { document } = await client.getDocument(first.document_id);
      console.log(`\nDocument ${first.document_id}: ${document.title}`);
    }

    const sources = await client.listSources();
    console.log(`\nArchive tracks ${sources.count} source(s).`);

    const datasets = await client.liveDatasets();
    console.log(`Live datasets available: ${datasets.count}`);

    const references = await client.exportReferences("قانون العمل", "ris");
    console.log(`\nExported ${references.length} bytes of RIS references.`);
  } catch (error) {
    if (error instanceof ErxError) {
      console.error(`API error (status ${error.status}): ${error.body}`);
    } else {
      throw error;
    }
  }
}

void main();
