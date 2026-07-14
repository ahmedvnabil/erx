import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { KnowledgeIndexer } from "../src/knowledge.js";
import { HybridRetriever, LocalEmbeddingProvider, cosineSimilarity } from "../src/retrieval.js";
import { ResearchStore } from "../src/store.js";

function fixture() {
  const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-knowledge-")), "research.db"));
  store.initialize();
  store.upsertSource({ slug: "rights-source", name: "مصدر حقوقي", url: "https://example.org", sourceType: "human_rights", ownershipType: "independent", language: "ar" });
  const document = store.upsertDocument({ externalId: "rights:1", sourceSlug: "rights-source", canonicalUrl: "https://example.org/1", title: "المبادرة المصرية توثق قرار النيابة العامة في القاهرة", content: "أعلنت المبادرة المصرية للحقوق الشخصية أن النيابة العامة قررت إخلاء سبيل عدد من العمال. يتناول التقرير قانون العمل والحماية القانونية للعاملين.", publishedAt: "2026-07-01T00:00:00.000Z", topics: ["الحقوق العمالية"] });
  return { store, documentId: document.documentId };
}

describe("knowledge and retrieval", () => {
  it("extracts linked entities, claims, and events idempotently", () => {
    const { store, documentId } = fixture();
    const indexer = new KnowledgeIndexer(store);
    expect(indexer.indexDocument(documentId)).toEqual(expect.objectContaining({ entities: 3, claims: 1, events: 1 }));
    indexer.indexDocument(documentId);
    expect(store.listEntities({ documentId })).toHaveLength(3);
    expect(store.listClaims({ documentId })[0]?.claimText).toContain("إخلاء سبيل");
    expect(store.listEvents({ documentId })[0]).toEqual(expect.objectContaining({
      occurredAt: "2026-07-01T00:00:00.000Z",
      location: "القاهرة"
    }));
    store.close();
  });

  it("adds semantic results and explains rank fusion", () => {
    const { store, documentId } = fixture();
    const provider = new LocalEmbeddingProvider(128);
    new KnowledgeIndexer(store, provider).indexDocument(documentId);
    const result = new HybridRetriever(store, provider).search("حقوق العاملين", { limit: 10 })[0];
    expect(result?.documentId).toBe(documentId);
    expect(result?.matchReasons).toContain("semantic");
    expect(cosineSimilarity([2, 0], [3, 0])).toBe(1);
    store.close();
  });

  it("rejects weak semantic-only matches instead of inventing relevance", () => {
    const { store, documentId } = fixture();
    const weakVector = [0.15, Math.sqrt(1 - (0.15 ** 2))];
    const provider = {
      provider: "test",
      model: "weak-match",
      embed: () => weakVector,
      embedQuery: () => [1, 0]
    };
    store.upsertEmbedding(documentId, provider.provider, provider.model, weakVector, "weak-match");

    expect(new HybridRetriever(store, provider).search("zzzznonsensezzz", { limit: 10 })).toEqual([]);
    store.close();
  });
});
