import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { HybridRetriever, LocalEmbeddingProvider, MIN_RETRIEVAL_SCORE } from "../src/retrieval.js";
import { ResearchStore } from "../src/store.js";

describe("Arabic-first hybrid retrieval", () => {
  it("keeps inflation evidence and removes semantic-only military seminar noise", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "erx-retrieval-")), "research.db"));
    store.initialize();
    store.upsertSource({ slug: "capmas", name: "الإحصاء", url: "https://example.org", sourceType: "statistics", ownershipType: "government", language: "ar" });
    store.upsertSource({ slug: "presidency", name: "الرئاسة", url: "https://example.com", sourceType: "official", ownershipType: "government", language: "ar" });
    const relevant = store.upsertDocument({ externalId: "prices", sourceSlug: "capmas", canonicalUrl: "https://example.org/prices", title: "الأرقام القياسية لأسعار المستهلكين", excerpt: "معدل التضخم وأسعار السلع في يونيو", content: "بيانات التضخم الشهري وأسعار الغذاء والسلع.", publishedAt: "2026-07-01T00:00:00.000Z" });
    const noise = store.upsertDocument({ externalId: "seminar", sourceSlug: "presidency", canonicalUrl: "https://example.com/seminar", title: "الندوة التثقيفية للقوات المسلحة", content: "فعاليات الندوة وكلمات المشاركين.", publishedAt: "2026-07-02T00:00:00.000Z" });
    const provider = new LocalEmbeddingProvider();
    for (const id of [relevant.documentId, noise.documentId]) {
      const document = store.getDocument(id)!;
      store.upsertEmbedding(id, provider.provider, provider.model, provider.embed(`${document.title}\n${document.excerpt}\n${document.content}`), "test");
    }

    const results = new HybridRetriever(store, provider).search("التضخم وأسعار السلع", { limit: 10 });

    expect(results.map((result) => result.documentId)).toEqual([relevant.documentId]);
    expect(results[0]?.matchReasons).toContain("lexical");
    expect(results[0]?.retrievalScore).toBeGreaterThanOrEqual(MIN_RETRIEVAL_SCORE);
    expect(results[0]?.citation.archivedAt).toBeTruthy();
    store.close();
  });

  it("returns no result below the mandatory relevance threshold", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "erx-threshold-")), "research.db"));
    store.initialize();
    store.upsertSource({ slug: "source", name: "مصدر", url: "https://example.org", sourceType: "news", ownershipType: "independent", language: "ar" });
    const noise = store.upsertDocument({ externalId: "noise", sourceSlug: "source", canonicalUrl: "https://example.org/noise", title: "ندوة ثقافية", content: "فعاليات عامة", publishedAt: "2026-07-01T00:00:00.000Z" });
    const provider = new LocalEmbeddingProvider();
    store.upsertEmbedding(noise.documentId, provider.provider, provider.model, provider.embed("التضخم أسعار السلع"), "test");

    expect(new HybridRetriever(store, provider).search("التضخم وأسعار السلع")).toEqual([]);
    store.close();
  });
});
