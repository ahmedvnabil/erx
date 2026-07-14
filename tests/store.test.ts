import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

  it("opens the existing v0.3 database without changing its contract", () => {
    const store = new ResearchStore("data/research.db", { readonly: true });
    expect(store.listSources()).toHaveLength(33);
    expect(store.count("documents")).toBe(116);
    expect(store.listEntities({ limit: 20 }).length).toBeGreaterThan(0);
    store.close();
  });
});
