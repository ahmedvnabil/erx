import { createHash } from "node:crypto";
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

const document = {
  externalId: "cite-1",
  sourceSlug: source.slug,
  canonicalUrl: "https://example.com/report/2026/07/decree",
  title: "قرار وزاري جديد",
  excerpt: "تفاصيل القرار الوزاري",
  content: "أصدرت الوزارة قرارا جديدا اليوم",
  publishedAt: "2026-07-15T10:00:00.000Z",
  documentType: "article",
  topics: ["policy"],
  language: "ar" as const
};

const newStore = (label: string): ResearchStore => {
  const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), label)), "research.db"));
  store.initialize();
  store.upsertSource(source);
  return store;
};

describe("citation identifiers", () => {
  it("derives a deterministic citationId from the canonical URL", () => {
    const store = newStore("erx-cite-det-");
    const inserted = store.upsertDocument(document);
    const result = store.getDocument(inserted.documentId);
    const expected = `erx:${createHash("sha256").update(document.canonicalUrl).digest("hex").slice(0, 12)}`;
    expect(result?.citation.citationId).toBe(expected);
    store.close();
  });

  it("keeps citationId stable across repeated searchResult reads of the same document", () => {
    const store = newStore("erx-cite-stable-");
    const inserted = store.upsertDocument(document);
    const first = store.getDocument(inserted.documentId);
    const second = store.getDocumentByUrl(document.canonicalUrl);
    expect(first?.citation.citationId).toBe(second?.citation.citationId);
    expect(first?.citation.citationId).toMatch(/^erx:[0-9a-f]{12}$/);
    store.close();
  });

  it("produces the same citationId for identical inserts in independent stores", () => {
    const one = newStore("erx-cite-a-");
    const two = newStore("erx-cite-b-");
    const first = one.getDocument(one.upsertDocument(document).documentId);
    const second = two.getDocument(two.upsertDocument(document).documentId);
    expect(first?.citation.citationId).toBe(second?.citation.citationId);
    one.close();
    two.close();
  });

  it("exposes a permalink that ends with /documents/<id>", () => {
    const store = newStore("erx-cite-permalink-");
    const inserted = store.upsertDocument(document);
    const result = store.getDocument(inserted.documentId);
    expect(result?.citation.permalink).toBe(`https://erx-mcp.zad.tools/documents/${inserted.documentId}`);
    expect((result?.citation.permalink ?? "").endsWith(`/documents/${inserted.documentId}`)).toBe(true);
    store.close();
  });
});
