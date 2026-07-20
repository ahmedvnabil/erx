import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bootstrapCatalog } from "../src/catalog.js";
import { createMcpServer, TOOL_NAMES } from "../src/mcp.js";
import { KnowledgeIndexer } from "../src/knowledge.js";
import { ResearchStore } from "../src/store.js";

describe("MCP contract", () => {
  it("publishes the stable tool API", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-mcp-tools-")), "research.db"));
    store.initialize();
    bootstrapCatalog(store);
    const server = createMcpServer(store);
    const client = new Client({ name: "contract-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
    const result = await client.callTool({ name: "egypt_list_sources", arguments: {} });
    expect(result.isError).not.toBe(true);

    await client.close();
    await server.close();
    store.close();
  });

  it("executes tools, resources, and prompts over the protocol", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-mcp-contract-")), "research.db"));
    store.initialize();
    store.upsertSource({ slug: "official-test", name: "مصدر رسمي", url: "https://example.org", sourceType: "official", ownershipType: "government", language: "ar" });
    const inserted = store.upsertDocument({ externalId: "doc-1", sourceSlug: "official-test", canonicalUrl: "https://example.org/1", title: "قرار اقتصادي في القاهرة", excerpt: "قرار اقتصادي", content: "أعلنت النيابة العامة قرارا اقتصاديا في القاهرة.", publishedAt: "2026-07-14T00:00:00.000Z", topics: ["الاقتصاد والعدالة الاجتماعية"] });
    store.assignStory(inserted.documentId);
    new KnowledgeIndexer(store).indexDocument(inserted.documentId);
    const server = createMcpServer(store);
    const client = new Client({ name: "execution-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const calls: Array<[string, Record<string, unknown>]> = [
      ["egypt_search", { query: "قرار اقتصادي" }], ["egypt_get_document", { document_id: inserted.documentId }],
      ["egypt_build_timeline", { query: "قرار اقتصادي" }], ["egypt_compare_sources", { query: "قرار اقتصادي" }],
      ["egypt_get_source_profile", { source_slug: "official-test" }], ["egypt_list_sources", {}],
      ["egypt_get_daily_brief", { date: "2026-07-14" }], ["egypt_list_stories", {}],
      ["egypt_export_references", { query: "قرار اقتصادي", format: "ris" }], ["egypt_hybrid_search", { query: "قرار اقتصادي", source_types: ["official"], date_from: "2026-01-01" }],
      ["egypt_research_dossier", { query: "قرار اقتصادي", source_types: ["official"], date_from: "2026-01-01" }],
      ["egypt_find_entities", { document_id: inserted.documentId }], ["egypt_list_events", { document_id: inserted.documentId }],
      ["egypt_trace_claim", { claim_id: store.listClaims()[0]!.id }], ["egypt_compare_claims", { query: "قرار اقتصادي" }],
      ["egypt_list_live_datasets", {}], ["egypt_save_research_query", { name: "اقتصاد مصر", query: "قرار اقتصادي" }]
    ];
    for (const [name, arguments_] of calls) expect((await client.callTool({ name, arguments: arguments_ })).isError).not.toBe(true);
    const dossier = await client.callTool({ name: "egypt_research_dossier", arguments: { query: "قرار اقتصادي" } });
    expect(dossier.isError).not.toBe(true);
    expect(dossier.structuredContent).toEqual(expect.objectContaining({
      query: "قرار اقتصادي",
      coverage: expect.objectContaining({ document_count: 1, source_count: 1 }),
      timeline: expect.any(Array),
      claims: expect.any(Array),
      entities: expect.any(Array)
    }));
    const comparedClaims = await client.callTool({ name: "egypt_compare_claims", arguments: { query: "قرار اقتصادي" } });
    expect(comparedClaims.structuredContent).toEqual(expect.objectContaining({ count: 1, clusters: expect.any(Array) }));
    const firstPage = await client.callTool({ name: "egypt_search", arguments: { query: "قرار اقتصادي", limit: 1, offset: 0 } });
    expect(firstPage.structuredContent).toEqual(expect.objectContaining({ total_count: 1, count: 1, offset: 0, has_more: false, next_offset: null }));
    const noStrongMatches = await client.callTool({ name: "egypt_hybrid_search", arguments: { query: "استعلام بلا صلة بالمحتوى الموجود" } });
    expect(noStrongMatches.structuredContent).toEqual(expect.objectContaining({
      count: 0,
      strong_matches: false,
      message: "لا توجد مطابقات قوية"
    }));
    const sourcesResource = (await client.readResource({ uri: "egypt://sources" })).contents[0];
    const sourceResource = (await client.readResource({ uri: "egypt://source/official-test" })).contents[0];
    expect(sourcesResource && "text" in sourcesResource ? sourcesResource.text : "").toContain("official-test");
    expect(sourceResource && "text" in sourceResource ? sourceResource.text : "").toContain("مصدر رسمي");
    expect((await client.getPrompt({ name: "research_brief", arguments: { topic: "الاقتصاد" } })).messages[0]?.content).toEqual(expect.objectContaining({ type: "text" }));
    expect((await client.getPrompt({ name: "verify_claim", arguments: { claim: "ادعاء" } })).messages).toHaveLength(1);
    const liveDatasets = await client.callTool({ name: "egypt_list_live_datasets", arguments: {} });
    expect(liveDatasets.isError).not.toBe(true);
    expect(liveDatasets.structuredContent).toEqual(expect.objectContaining({ count: 6, datasets: expect.any(Array) }));
    await client.close(); await server.close(); store.close();
  });
});
