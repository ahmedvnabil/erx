import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { bootstrapCatalog } from "../src/catalog.js";
import { KnowledgeIndexer } from "../src/knowledge.js";
import { ResearchStore } from "../src/store.js";

const source = {
  slug: "test-source",
  name: "مصدر تجريبي",
  url: "https://example.com",
  sourceType: "news" as const,
  ownershipType: "independent",
  language: "ar" as const,
  active: true
};

describe("ResearchStore", () => {
  it("creates the compatible schema and indexes searchable documents", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-mcp-")), "research.db"));
    store.initialize();
    store.upsertSource(source);
    const first = store.upsertDocument({
      externalId: "article-1",
      sourceSlug: source.slug,
      canonicalUrl: "https://example.com/a/1",
      title: "قرار اقتصادي مصري جديد",
      excerpt: "تفاصيل القرار الاقتصادي",
      content: "أعلنت الحكومة المصرية تفاصيل القرار الاقتصادي اليوم",
      publishedAt: "2026-07-14T10:00:00.000Z",
      documentType: "article",
      topics: ["economy"],
      language: "ar"
    });
    const unchanged = store.upsertDocument({
      externalId: "article-1",
      sourceSlug: source.slug,
      canonicalUrl: "https://example.com/a/1",
      title: "قرار اقتصادي مصري جديد",
      excerpt: "تفاصيل القرار الاقتصادي",
      content: "أعلنت الحكومة المصرية تفاصيل القرار الاقتصادي اليوم",
      publishedAt: "2026-07-14T10:00:00.000Z",
      documentType: "article",
      topics: ["economy"],
      language: "ar"
    });

    expect(first.createdVersion).toBe(true);
    expect(unchanged).toEqual({ documentId: first.documentId, createdVersion: false });
    expect(store.search("القرار الاقتصادي")).toHaveLength(1);
    expect(store.getDocument(first.documentId)?.citation.url).toBe("https://example.com/a/1");
    expect(store.integrityCheck()).toBe("ok");
    store.close();
  });

  it("reopens a seeded database readonly without changing its contract", () => {
    const database = join(mkdtempSync(join(tmpdir(), "egypt-reopen-")), "research.db");
    const writableStore = new ResearchStore(database);
    writableStore.initialize();
    bootstrapCatalog(writableStore);
    const inserted = writableStore.upsertDocument({
      externalId: "reopen-1",
      sourceSlug: "cabinet-egypt",
      canonicalUrl: "https://example.com/reopen/1",
      title: "قرار اقتصادي في القاهرة",
      excerpt: "بيان رسمي للاختبار",
      content: "أعلن مجلس النواب قرارا اقتصاديا جديدا في القاهرة.",
      publishedAt: "2026-07-14T10:00:00.000Z",
      documentType: "article",
      topics: ["economy"],
      language: "ar"
    });
    new KnowledgeIndexer(writableStore).indexDocument(inserted.documentId);
    writableStore.close();

    const store = new ResearchStore(database, { readonly: true });
    expect(store.listSources()).toHaveLength(33);
    expect(store.count("documents")).toBe(1);
    expect(store.listEntities({ limit: 20 }).length).toBeGreaterThan(0);
    store.close();
  });
});
